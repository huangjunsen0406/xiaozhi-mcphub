const initializeMock = jest.fn(async () => undefined);
const startMock = jest.fn();
const shutdownMock = jest.fn(async () => undefined);
const getAppMock = jest.fn(() => ({}));
const AppServerMock = jest.fn(() => ({
  initialize: initializeMock,
  start: startMock,
  shutdown: shutdownMock,
  getApp: getAppMock,
}));

const initializeDatabaseModeMock = jest.fn(async () => true);
const backfillMissingOwnersInJsonSettingsMock = jest.fn(() => ({
  servers: 0,
  groups: 0,
  xiaozhiEndpoints: 0,
}));
const createFetchWithProxyMock = jest.fn();
const getProxyConfigFromEnvMock = jest.fn(() => ({}));
const isRetryableDbErrorMock = jest.fn(() => false);
const hydrateSystemConfigCacheMock = jest.fn(async () => undefined);
const startHostedEventSubscriberMock = jest.fn();
const stopHostedEventSubscriberMock = jest.fn(async () => undefined);

jest.mock('../src/server.js', () => ({
  __esModule: true,
  default: AppServerMock,
}));

jest.mock('../src/utils/migration.js', () => ({
  initializeDatabaseMode: initializeDatabaseModeMock,
  backfillMissingOwnersInJsonSettings: backfillMissingOwnersInJsonSettingsMock,
}));

jest.mock('../src/services/proxy.js', () => ({
  createFetchWithProxy: createFetchWithProxyMock,
  getProxyConfigFromEnv: getProxyConfigFromEnvMock,
}));

jest.mock('../src/utils/dbRetry.js', () => ({
  isRetryableDbError: isRetryableDbErrorMock,
}));

jest.mock('../src/utils/systemConfigCache.js', () => ({
  hydrateSystemConfigCache: hydrateSystemConfigCacheMock,
}));

jest.mock('../src/services/hostedEventSubscriber.js', () => ({
  startHostedEventSubscriber: startHostedEventSubscriberMock,
  stopHostedEventSubscriber: stopHostedEventSubscriberMock,
}));

describe('index boot', () => {
  beforeEach(() => {
    jest.resetModules();
    initializeMock.mockClear();
    startMock.mockClear();
    shutdownMock.mockClear();
    getAppMock.mockClear();
    AppServerMock.mockClear();
    initializeDatabaseModeMock.mockClear();
    backfillMissingOwnersInJsonSettingsMock.mockClear();
    createFetchWithProxyMock.mockClear();
    getProxyConfigFromEnvMock.mockClear();
    isRetryableDbErrorMock.mockClear();
    hydrateSystemConfigCacheMock.mockClear();
    startHostedEventSubscriberMock.mockReset();
    stopHostedEventSubscriberMock.mockClear();

    getProxyConfigFromEnvMock.mockReturnValue({});
    isRetryableDbErrorMock.mockReturnValue(false);
    hydrateSystemConfigCacheMock.mockResolvedValue(undefined);
    startHostedEventSubscriberMock.mockReturnValue(new Promise(() => undefined));

    delete process.env.USE_DB;
    delete process.env.DB_URL;
    delete process.env.DATABASE_URL;
  });

  it('starts the app without waiting for the hosted Redis subscriber to connect', async () => {
    await import('../src/index.js');

    // boot() is async and may await dynamic imports (dbEnv) + hydrate + initialize.
    // Flush microtasks until start() has run instead of a fixed tick count.
    for (let i = 0; i < 20 && startMock.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }

    expect(hydrateSystemConfigCacheMock).toHaveBeenCalledTimes(1);
    expect(startHostedEventSubscriberMock).toHaveBeenCalledTimes(1);
    expect(initializeMock).toHaveBeenCalledTimes(1);
    expect(startMock).toHaveBeenCalledTimes(1);
    expect(backfillMissingOwnersInJsonSettingsMock).toHaveBeenCalledTimes(1);
    expect(initializeDatabaseModeMock).not.toHaveBeenCalled();
  });

  it('enables database mode when only legacy DATABASE_URL is set', async () => {
    process.env.DATABASE_URL = 'postgres://xiaozhi:pw@db:5432/xiaozhi_mcphub';

    await import('../src/index.js');
    for (let i = 0; i < 20 && startMock.mock.calls.length === 0; i += 1) {
      await Promise.resolve();
    }

    expect(initializeDatabaseModeMock).toHaveBeenCalledTimes(1);
    expect(backfillMissingOwnersInJsonSettingsMock).not.toHaveBeenCalled();
    expect(startMock).toHaveBeenCalledTimes(1);
  });
});
