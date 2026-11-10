import { createIdempotentShutdown } from '../../src/utils/gracefulShutdown.js';

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
};

describe('createIdempotentShutdown', () => {
  it('runs the teardown once even when the signal is delivered repeatedly', async () => {
    const teardown = jest.fn(async () => undefined);
    const shutdown = createIdempotentShutdown(teardown);

    shutdown('SIGTERM');
    shutdown('SIGTERM');
    shutdown('SIGINT');

    await flush();

    expect(teardown).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledWith('SIGTERM');
  });

  it('swallows teardown failures instead of leaving an unhandled rejection', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const shutdown = createIdempotentShutdown(() => {
      throw new Error('pool wedged');
    });

    shutdown('SIGINT');
    await flush();

    expect(errorSpy).toHaveBeenCalledWith('[SHUTDOWN] Graceful shutdown failed', {
      error: expect.any(Error),
    });

    errorSpy.mockRestore();
  });
});
