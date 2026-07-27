import { jest } from '@jest/globals';

describe('dbEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.DB_URL;
    delete process.env.DATABASE_URL;
    delete process.env.USE_DB;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('prefers DB_URL over legacy DATABASE_URL', async () => {
    process.env.DB_URL = 'postgres://new/db';
    process.env.DATABASE_URL = 'postgres://legacy/db';

    const { getDatabaseUrlFromEnv } = await import('./dbEnv.js');
    expect(getDatabaseUrlFromEnv()).toBe('postgres://new/db');
  });

  it('falls back to DATABASE_URL and warns once', async () => {
    process.env.DATABASE_URL = '  postgres://legacy/db  ';
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const {
      getDatabaseUrlFromEnv,
      resetDatabaseUrlDeprecationWarningForTests,
    } = await import('./dbEnv.js');
    resetDatabaseUrlDeprecationWarningForTests();

    expect(getDatabaseUrlFromEnv()).toBe('postgres://legacy/db');
    expect(getDatabaseUrlFromEnv()).toBe('postgres://legacy/db');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('DATABASE_URL is deprecated');

    warn.mockRestore();
  });

  it('treats blank values as unset', async () => {
    process.env.DB_URL = '   ';
    process.env.DATABASE_URL = '';

    const { getDatabaseUrlFromEnv, isDatabaseModeEnabled } = await import('./dbEnv.js');
    expect(getDatabaseUrlFromEnv()).toBeUndefined();
    expect(isDatabaseModeEnabled()).toBe(false);
  });

  it('enables DB mode from either URL unless USE_DB overrides', async () => {
    process.env.DATABASE_URL = 'postgres://legacy/db';
    let mod = await import('./dbEnv.js');
    expect(mod.isDatabaseModeEnabled()).toBe(true);

    jest.resetModules();
    process.env = { ...originalEnv, USE_DB: 'false', DATABASE_URL: 'postgres://legacy/db' };
    mod = await import('./dbEnv.js');
    expect(mod.isDatabaseModeEnabled()).toBe(false);

    jest.resetModules();
    process.env = { ...originalEnv, USE_DB: 'true' };
    delete process.env.DB_URL;
    delete process.env.DATABASE_URL;
    mod = await import('./dbEnv.js');
    expect(mod.isDatabaseModeEnabled()).toBe(true);
  });
});
