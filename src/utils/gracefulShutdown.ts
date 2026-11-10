export type ShutdownHandler = (signal: NodeJS.Signals) => Promise<void> | void;

/**
 * Wrap a shutdown handler so the teardown runs at most once.
 *
 * A single Ctrl-C or `docker stop` easily reaches the process several times: pnpm, tsx
 * and any supervisor in between all forward the signal. Without this guard the teardown
 * body runs concurrently, closing the HTTP server, the MCP clients and the database pool
 * more than once and printing the shutdown banner repeatedly.
 */
export const createIdempotentShutdown = (handler: ShutdownHandler) => {
  let started = false;

  return (signal: NodeJS.Signals): void => {
    if (started) {
      return;
    }
    started = true;

    void Promise.resolve()
      .then(() => handler(signal))
      .catch((error) => {
        console.error('[SHUTDOWN] Graceful shutdown failed', { error });
      });
  };
};
