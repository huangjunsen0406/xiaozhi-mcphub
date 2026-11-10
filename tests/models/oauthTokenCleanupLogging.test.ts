import { TypeORMError } from 'typeorm';

const cleanupExpiredMock = jest.fn(async () => undefined);
const findAllTokensMock = jest.fn(async () => []);

jest.mock('../../src/dao/index.js', () => ({
  getOAuthClientDao: jest.fn(() => ({
    findAll: jest.fn(async () => []),
    findByClientId: jest.fn(async () => null),
    create: jest.fn(async (client) => client),
    update: jest.fn(async () => null),
    delete: jest.fn(async () => false),
  })),
  getOAuthTokenDao: jest.fn(() => ({
    findAll: findAllTokensMock,
    findByAccessToken: jest.fn(async () => null),
    findByRefreshToken: jest.fn(async () => null),
    save: jest.fn(async (token) => token),
    delete: jest.fn(async () => false),
    deleteByUserAndClient: jest.fn(async () => 0),
    cleanupExpired: cleanupExpiredMock,
  })),
}));

type CleanupExpired = () => Promise<void>;

describe('OAuth cleanupExpired logging during a database outage', () => {
  let cleanupExpired: CleanupExpired;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(async () => {
    jest.resetModules();
    cleanupExpiredMock.mockReset();
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // Fresh module instance so the "already warned" flag starts clean.
    ({ cleanupExpired } = (await import('../../src/models/OAuth.js')) as {
      cleanupExpired: CleanupExpired;
    });
  });

  afterEach(() => {
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('warns once per outage instead of dumping a stack on every tick', async () => {
    cleanupExpiredMock.mockRejectedValue(new TypeORMError('Driver not Connected'));

    await cleanupExpired();
    await cleanupExpired();
    await cleanupExpired();

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[OAuth] Skipping persisted token cleanup: database unavailable',
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('warns again after the database comes back and goes away once more', async () => {
    cleanupExpiredMock.mockRejectedValueOnce(new TypeORMError('Driver not Connected'));
    await cleanupExpired();

    cleanupExpiredMock.mockResolvedValueOnce(undefined);
    await cleanupExpired();

    cleanupExpiredMock.mockRejectedValueOnce(new TypeORMError('Driver not Connected'));
    await cleanupExpired();

    expect(warnSpy).toHaveBeenCalledTimes(2);
  });

  it('still reports non-connection failures with the full error', async () => {
    cleanupExpiredMock.mockRejectedValue(new Error('boom'));

    await cleanupExpired();

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to cleanup persisted OAuth tokens:',
      expect.any(Error),
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
