import fs from 'fs';
import os from 'os';
import path from 'path';

import { BearerKeyDaoImpl } from '../../src/dao/BearerKeyDao.js';
import { hashBearerToken } from '../../src/utils/bearerKeyToken.js';

const writeSettings = (settingsPath: string, settings: unknown): void => {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
};

describe('BearerKeyDaoImpl migration + settings caching behavior', () => {
  let tmpDir: string;
  let settingsPath: string;
  let originalSettingsEnv: string | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcphub-bearer-keys-'));
    settingsPath = path.join(tmpDir, 'mcp_settings.json');

    originalSettingsEnv = process.env.MCPHUB_SETTING_PATH;
    process.env.MCPHUB_SETTING_PATH = settingsPath;
  });

  afterEach(() => {
    if (originalSettingsEnv === undefined) {
      delete process.env.MCPHUB_SETTING_PATH;
    } else {
      process.env.MCPHUB_SETTING_PATH = originalSettingsEnv;
    }

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('does not rewrite settings when bearerKeys exists as an empty array', async () => {
    writeSettings(settingsPath, {
      mcpServers: {},
      users: [],
      systemConfig: {
        routing: {
          enableBearerAuth: false,
          bearerAuthKey: '',
        },
      },
      bearerKeys: [],
    });

    const writeSpy = jest.spyOn(fs, 'writeFileSync');

    const dao = new BearerKeyDaoImpl();
    const enabled1 = await dao.findEnabled();
    const enabled2 = await dao.findEnabled();

    expect(enabled1).toEqual([]);
    expect(enabled2).toEqual([]);

    // The DAO should NOT persist anything because bearerKeys already exists.
    expect(writeSpy).not.toHaveBeenCalled();

    writeSpy.mockRestore();
  });

  it('migrates legacy bearerAuthKey only once', async () => {
    writeSettings(settingsPath, {
      mcpServers: {},
      users: [],
      systemConfig: {
        routing: {
          enableBearerAuth: true,
          bearerAuthKey: 'legacy-token',
        },
      },
      // bearerKeys is intentionally missing to trigger migration
    });

    const writeSpy = jest.spyOn(fs, 'writeFileSync');

    const dao = new BearerKeyDaoImpl();

    const enabled1 = await dao.findEnabled();
    expect(enabled1).toHaveLength(1);
    expect(enabled1[0].token).toBeUndefined();
    expect(enabled1[0].tokenHash).toBe(hashBearerToken('legacy-token'));
    expect(enabled1[0].enabled).toBe(true);
    expect((await dao.findByToken('legacy-token'))?.id).toBe(enabled1[0].id);

    const enabled2 = await dao.findEnabled();
    expect(enabled2).toHaveLength(1);
    expect(enabled2[0].tokenHash).toBe(hashBearerToken('legacy-token'));

    // One write for the migration, no further writes on subsequent reads.
    expect(writeSpy).toHaveBeenCalledTimes(1);

    writeSpy.mockRestore();
  });

  it('hashes legacy plaintext keys via hashLegacyTokens and updates excludedServers on rename', async () => {
    writeSettings(settingsPath, {
      mcpServers: {},
      users: [],
      systemConfig: { routing: { enableBearerAuth: true, bearerAuthKey: 'old-raw' } },
      bearerKeys: [
        {
          id: 'legacy-1',
          name: 'legacy',
          token: 'raw-secret-123456',
          enabled: true,
          kind: 'system',
          accessType: 'exclude',
          excludedServers: ['old-srv'],
        },
      ],
    });

    const dao = new BearerKeyDaoImpl();
    expect(await dao.hashLegacyTokens()).toBe(1);
    const key = await dao.findById('legacy-1');
    expect(key?.token).toBeUndefined();
    expect(key?.tokenHash).toBe(hashBearerToken('raw-secret-123456'));
    expect((await dao.findByToken('raw-secret-123456'))?.id).toBe('legacy-1');

    expect(await dao.updateServerName('old-srv', 'new-srv')).toBe(1);
    expect((await dao.findById('legacy-1'))?.excludedServers).toEqual(['new-srv']);
  });
});
