import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { clearSettingsCache, loadOriginalSettings, saveSettings } from '../../src/config/index.js';
import { ServerDaoImpl } from '../../src/dao/ServerDao.js';

/**
 * Regression tests for JSON settings cache coherence.
 *
 * An in-process write can land in the same filesystem mtime tick as the
 * snapshot the DAO and the config module keep in memory, so comparing mtimes
 * alone serves stale settings and silently drops concurrent updates. A
 * generation counter bumped by clearSettingsCache() is what makes the
 * invalidation deterministic.
 */
describe('JSON settings cache coherence', () => {
  let directory: string;
  let settingsPath: string;
  let originalPath: string | undefined;
  const timestamp = new Date('2020-01-01T00:00:00Z');

  const writeSettings = (settings: Record<string, unknown>, mtime: Date = timestamp) => {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    fs.utimesSync(settingsPath, mtime, mtime);
  };

  const readStoredSettings = (): any => JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  beforeEach(() => {
    originalPath = process.env.MCPHUB_SETTING_PATH;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mcphub-settings-cache-'));
    settingsPath = path.join(directory, 'mcp_settings.json');
    process.env.MCPHUB_SETTING_PATH = settingsPath;
    clearSettingsCache();
    writeSettings({
      mcpServers: { notes: { command: 'node', enabled: true } },
      users: [],
      groups: [],
      systemConfig: {},
    });
  });

  afterEach(() => {
    if (originalPath === undefined) {
      delete process.env.MCPHUB_SETTING_PATH;
    } else {
      process.env.MCPHUB_SETTING_PATH = originalPath;
    }
    clearSettingsCache();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('serves the cached DAO snapshot while the file mtime is unchanged', async () => {
    const servers = new ServerDaoImpl();
    expect(await servers.findById('notes')).not.toBeNull();

    // Replace the file content but keep the mtime identical: a correctly cached
    // DAO must keep serving its snapshot instead of re-reading the file.
    writeSettings({ mcpServers: {}, users: [], groups: [], systemConfig: {} });

    expect(await servers.findById('notes')).not.toBeNull();
  });

  it('reloads after an external edit with a newer mtime', async () => {
    const servers = new ServerDaoImpl();
    expect(await servers.findById('notes')).not.toBeNull();

    writeSettings(
      {
        mcpServers: { notebook: { command: 'node', enabled: true } },
        users: [],
        groups: [],
        systemConfig: {},
      },
      new Date(timestamp.getTime() + 1000),
    );

    expect(await servers.findById('notebook')).not.toBeNull();
  });

  it('reloads after an external edit that moves the mtime backwards', async () => {
    const servers = new ServerDaoImpl();
    expect(await servers.findById('notes')).not.toBeNull();

    // Older mtimes must still invalidate: comparing with `>=` would keep the
    // stale snapshot forever after a restore or a clock adjustment.
    writeSettings(
      {
        mcpServers: { notebook: { command: 'node', enabled: true } },
        users: [],
        groups: [],
        systemConfig: {},
      },
      new Date(timestamp.getTime() - 1000),
    );

    expect(await servers.findById('notebook')).not.toBeNull();
  });

  it('invalidates DAO snapshots after a config-module save in the same mtime tick', async () => {
    const servers = new ServerDaoImpl();
    expect(await servers.findById('notes')).not.toBeNull();

    const settings = loadOriginalSettings();
    settings.mcpServers = {
      ...settings.mcpServers,
      notebook: { command: 'node', enabled: true } as any,
    };
    expect(saveSettings(settings)).toBe(true);

    // Force the file back onto the mtime the DAO cached: only the generation
    // counter can tell the DAO that its snapshot is stale.
    fs.utimesSync(settingsPath, timestamp, timestamp);

    expect(await servers.findById('notebook')).not.toBeNull();
  });

  it('keeps a config-module write when a DAO saves afterwards', async () => {
    const servers = new ServerDaoImpl();
    await servers.findAll(); // warm the DAO snapshot

    const settings = loadOriginalSettings();
    settings.groups = [{ id: 'g', name: 'g', servers: ['notebook'] } as any];
    expect(saveSettings(settings)).toBe(true);
    fs.utimesSync(settingsPath, timestamp, timestamp);

    await servers.update('notes', { enabled: false });

    // The config-module write must survive the DAO save, and the DAO's own
    // update must still land: a stale snapshot would drop the group entry.
    const stored = readStoredSettings();
    expect(stored.groups[0].servers).toEqual(['notebook']);
    expect((await servers.findById('notes'))?.enabled).toBe(false);
  });
});
