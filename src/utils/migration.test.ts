import { jest } from '@jest/globals';

// Mocks must be defined before importing the module under test.

const initializeDatabaseMock = jest.fn(async () => undefined);
const createQueryBuilderMock = jest.fn();
const getAppDataSourceMock = jest.fn(() => ({
  createQueryBuilder: createQueryBuilderMock,
}));
jest.mock('../db/connection.js', () => ({
  initializeDatabase: initializeDatabaseMock,
  getAppDataSource: getAppDataSourceMock,
}));

const runLegacySchemaMigrationsMock = jest.fn(async () => ({
  serversCopied: 0,
  serversSkipped: 0,
  endpointOwnersBackfilled: 0,
  groupOwnersBackfilled: 0,
  userAdminColumnAligned: false,
  systemConfigColumnsAligned: false,
  existingUserCount: 0,
  adminUserPresent: false,
}));
jest.mock('./legacySchemaMigration.js', () => ({
  runLegacySchemaMigrations: runLegacySchemaMigrationsMock,
}));

const setDaoFactoryMock = jest.fn();
jest.mock('../dao/DaoFactory.js', () => ({
  setDaoFactory: setDaoFactoryMock,
}));

jest.mock('../dao/DatabaseDaoFactory.js', () => ({
  DatabaseDaoFactory: {
    getInstance: jest.fn(() => ({
      /* noop */
    })),
  },
}));

const loadOriginalSettingsMock = jest.fn(() => ({ users: [] as any[], mcpServers: {} as any }));
const saveSettingsMock = jest.fn(() => true);
jest.mock('../config/index.js', () => ({
  loadOriginalSettings: loadOriginalSettingsMock,
  saveSettings: saveSettingsMock,
}));

const userRepoCountMock = jest.fn<() => Promise<number>>();
jest.mock('../db/repositories/UserRepository.js', () => ({
  UserRepository: jest.fn().mockImplementation(() => ({
    count: userRepoCountMock,
  })),
}));

const bearerKeyCountMock = jest.fn<() => Promise<number>>();
const bearerKeyCreateMock =
  jest.fn<
    (data: {
      name: string;
      token: string;
      enabled: boolean;
      accessType: string;
      allowedGroups: string[];
      allowedServers: string[];
    }) => Promise<unknown>
  >();
jest.mock('../db/repositories/BearerKeyRepository.js', () => ({
  BearerKeyRepository: jest.fn().mockImplementation(() => ({
    count: bearerKeyCountMock,
    create: bearerKeyCreateMock,
  })),
}));

const systemConfigGetMock = jest.fn<() => Promise<any>>();
jest.mock('../db/repositories/SystemConfigRepository.js', () => ({
  SystemConfigRepository: jest.fn().mockImplementation(() => ({
    get: systemConfigGetMock,
  })),
}));

// Stub remaining repos imported by migrateToDatabase so accidental imports don't explode.
jest.mock('../db/repositories/ServerRepository.js', () => ({
  ServerRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../db/repositories/GroupRepository.js', () => ({
  GroupRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../db/repositories/UserConfigRepository.js', () => ({
  UserConfigRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../db/repositories/OAuthClientRepository.js', () => ({
  OAuthClientRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../db/repositories/OAuthTokenRepository.js', () => ({
  OAuthTokenRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../db/repositories/BuiltinPromptRepository.js', () => ({
  BuiltinPromptRepository: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../db/repositories/BuiltinResourceRepository.js', () => ({
  BuiltinResourceRepository: jest.fn().mockImplementation(() => ({})),
}));

function mockOwnerBackfillUpdates(affected = 0) {
  const execute = jest.fn(async () => ({ affected }));
  const where = jest.fn(() => ({ execute }));
  const set = jest.fn(() => ({ where }));
  const update = jest.fn(() => ({ set }));
  createQueryBuilderMock.mockReturnValue({ update });
  return { update, set, where, execute };
}

describe('applyLegacyOwnerDefaults', () => {
  it('attributes missing owners to admin and leaves existing owners untouched', async () => {
    const { applyLegacyOwnerDefaults, LEGACY_OWNER } = await import('./migration.js');

    const settings: any = {
      mcpServers: {
        bare: { type: 'stdio', command: 'echo' },
        owned: { type: 'stdio', command: 'echo', owner: 'alice' },
        emptyOwner: { type: 'stdio', command: 'echo', owner: '' },
      },
      groups: [
        { id: '1', name: 'g1', servers: [] },
        { id: '2', name: 'g2', servers: [], owner: 'bob' },
        { id: '3', name: 'g3', servers: [], owner: null },
      ],
      xiaozhi: {
        enabled: true,
        endpoints: [
          { id: 'e1', name: 'ep1', enabled: true, webSocketUrl: 'wss://x' },
          { id: 'e2', name: 'ep2', enabled: true, webSocketUrl: 'wss://y', owner: 'carol' },
        ],
      },
    };

    const result = applyLegacyOwnerDefaults(settings);

    expect(result).toEqual({ servers: 2, groups: 2, xiaozhiEndpoints: 1 });
    expect(settings.mcpServers.bare.owner).toBe(LEGACY_OWNER);
    expect(settings.mcpServers.emptyOwner.owner).toBe(LEGACY_OWNER);
    expect(settings.mcpServers.owned.owner).toBe('alice');
    expect(settings.groups[0].owner).toBe(LEGACY_OWNER);
    expect(settings.groups[1].owner).toBe('bob');
    expect(settings.groups[2].owner).toBe(LEGACY_OWNER);
    expect(settings.xiaozhi.endpoints[0].owner).toBe(LEGACY_OWNER);
    expect(settings.xiaozhi.endpoints[1].owner).toBe('carol');
  });

  it('is a no-op when every resource already has an owner', async () => {
    const { applyLegacyOwnerDefaults } = await import('./migration.js');
    const settings: any = {
      mcpServers: { s: { owner: 'admin' } },
      groups: [{ id: '1', name: 'g', servers: [], owner: 'admin' }],
      xiaozhi: { enabled: false, endpoints: [{ id: 'e', name: 'e', owner: 'admin' }] },
    };

    expect(applyLegacyOwnerDefaults(settings)).toEqual({
      servers: 0,
      groups: 0,
      xiaozhiEndpoints: 0,
    });
  });
});

describe('backfillMissingOwnersInJsonSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists settings when owners are missing', async () => {
    loadOriginalSettingsMock.mockReturnValue({
      mcpServers: { s1: { type: 'stdio', command: 'echo' } as any },
      groups: [{ id: '1', name: 'g1', servers: [] } as any],
      users: [],
    });
    saveSettingsMock.mockReturnValue(true);

    const { backfillMissingOwnersInJsonSettings, LEGACY_OWNER } = await import('./migration.js');
    const result = backfillMissingOwnersInJsonSettings();

    expect(result).toEqual({ servers: 1, groups: 1, xiaozhiEndpoints: 0 });
    expect(saveSettingsMock).toHaveBeenCalledTimes(1);
    const saved = saveSettingsMock.mock.calls[0][0] as any;
    expect(saved.mcpServers.s1.owner).toBe(LEGACY_OWNER);
    expect(saved.groups[0].owner).toBe(LEGACY_OWNER);
  });

  it('does not write when nothing needs updating', async () => {
    loadOriginalSettingsMock.mockReturnValue({
      mcpServers: { s1: { type: 'stdio', command: 'echo', owner: 'admin' } as any },
      groups: [],
      users: [],
    });

    const { backfillMissingOwnersInJsonSettings } = await import('./migration.js');
    const result = backfillMissingOwnersInJsonSettings();

    expect(result).toEqual({ servers: 0, groups: 0, xiaozhiEndpoints: 0 });
    expect(saveSettingsMock).not.toHaveBeenCalled();
  });
});

describe('initializeDatabaseMode legacy bearer auth migration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOwnerBackfillUpdates(0);
    runLegacySchemaMigrationsMock.mockClear();
    runLegacySchemaMigrationsMock.mockResolvedValue({
      serversCopied: 0,
      serversSkipped: 0,
      endpointOwnersBackfilled: 0,
      groupOwnersBackfilled: 0,
      userAdminColumnAligned: false,
      systemConfigColumnsAligned: false,
      existingUserCount: 0,
      adminUserPresent: false,
    });
  });

  it('runs v1.0.x schema migration before DAO switch', async () => {
    userRepoCountMock.mockResolvedValue(1);
    bearerKeyCountMock.mockResolvedValue(1);
    systemConfigGetMock.mockResolvedValue({});

    const { initializeDatabaseMode } = await import('./migration.js');
    const ok = await initializeDatabaseMode();

    expect(ok).toBe(true);
    expect(initializeDatabaseMock).toHaveBeenCalled();
    expect(runLegacySchemaMigrationsMock).toHaveBeenCalledTimes(1);
    expect(runLegacySchemaMigrationsMock.mock.invocationCallOrder[0]).toBeLessThan(
      setDaoFactoryMock.mock.invocationCallOrder[0],
    );
  });

  it('skips legacy migration when bearerKeys table already has data', async () => {
    userRepoCountMock.mockResolvedValue(1);
    bearerKeyCountMock.mockResolvedValue(2);
    systemConfigGetMock.mockResolvedValue({
      routing: { enableBearerAuth: true, bearerAuthKey: 'db-key' },
    });

    const { initializeDatabaseMode } = await import('./migration.js');
    const ok = await initializeDatabaseMode();

    expect(ok).toBe(true);
    expect(initializeDatabaseMock).toHaveBeenCalled();
    expect(runLegacySchemaMigrationsMock).toHaveBeenCalled();
    expect(loadOriginalSettingsMock).not.toHaveBeenCalled();
    expect(systemConfigGetMock).not.toHaveBeenCalled();
    expect(bearerKeyCreateMock).not.toHaveBeenCalled();
    // Owner backfill still runs on every startup
    expect(createQueryBuilderMock).toHaveBeenCalled();
  });

  it('migrates legacy routing bearerAuthKey into bearerKeys when users exist and keys table is empty', async () => {
    userRepoCountMock.mockResolvedValue(3);
    bearerKeyCountMock.mockResolvedValue(0);
    systemConfigGetMock.mockResolvedValue({
      routing: { enableBearerAuth: true, bearerAuthKey: 'db-key' },
    });

    const { initializeDatabaseMode } = await import('./migration.js');
    const ok = await initializeDatabaseMode();

    expect(ok).toBe(true);
    expect(loadOriginalSettingsMock).not.toHaveBeenCalled();
    expect(systemConfigGetMock).toHaveBeenCalledTimes(1);
    expect(bearerKeyCreateMock).toHaveBeenCalledTimes(1);
    expect(bearerKeyCreateMock).toHaveBeenCalledWith({
      name: 'default',
      token: 'db-key',
      enabled: true,
      kind: 'system',
      accessType: 'all',
      allowedGroups: [],
      allowedServers: [],
    });
  });

  it('does not migrate when routing has no bearerAuthKey', async () => {
    userRepoCountMock.mockResolvedValue(1);
    bearerKeyCountMock.mockResolvedValue(0);
    systemConfigGetMock.mockResolvedValue({
      routing: { enableBearerAuth: true, bearerAuthKey: '   ' },
    });

    const { initializeDatabaseMode } = await import('./migration.js');
    const ok = await initializeDatabaseMode();

    expect(ok).toBe(true);
    expect(loadOriginalSettingsMock).not.toHaveBeenCalled();
    expect(systemConfigGetMock).toHaveBeenCalledTimes(1);
    expect(bearerKeyCreateMock).not.toHaveBeenCalled();
  });
});

describe('backfillMissingOwnersInDatabase', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates servers, groups and xiaozhi endpoints with null/empty owner', async () => {
    const setMocks: Array<jest.Mock> = [];
    const execute = jest.fn(async () => ({ affected: 2 }));
    createQueryBuilderMock.mockImplementation(() => {
      const where = jest.fn(() => ({ execute }));
      const set = jest.fn(() => ({ where }));
      setMocks.push(set);
      const update = jest.fn(() => ({ set }));
      return { update };
    });

    const { backfillMissingOwnersInDatabase, LEGACY_OWNER } = await import('./migration.js');
    const result = await backfillMissingOwnersInDatabase();

    // Three entity tables updated
    expect(createQueryBuilderMock).toHaveBeenCalledTimes(3);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ servers: 2, groups: 2, xiaozhiEndpoints: 2 });
    expect(setMocks).toHaveLength(3);
    for (const set of setMocks) {
      expect(set).toHaveBeenCalledWith({ owner: LEGACY_OWNER });
    }
  });
});
