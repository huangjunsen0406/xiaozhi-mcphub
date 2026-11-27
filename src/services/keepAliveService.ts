import { SSEClientTransport, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { ServerInfo, ServerConfig } from '../types/index.js';
import { formatErrorForLogging } from '../utils/serialization.js';

export interface KeepAliveOptions {
  enabled?: boolean;
  intervalMs?: number;
  reconnectServer?: (serverName: string) => Promise<void>;
}

/**
 * Set up keep-alive ping for MCP client connections (SSE or Streamable HTTP).
 * Remote server health checks are opt-in because probes may count as upstream calls.
 */
export const setupClientKeepAlive = async (
  serverInfo: ServerInfo,
  serverConfig: ServerConfig,
  options: KeepAliveOptions = {},
): Promise<void> => {
  // Only set up keep-alive for SSE or Streamable HTTP client transports
  const isSSE = serverInfo.transport instanceof SSEClientTransport;
  const isStreamableHttp = serverInfo.transport instanceof StreamableHTTPClientTransport;
  if (!isSSE && !isStreamableHttp) {
    return;
  }

  // Repeated failed calls must not postpone an already scheduled recovery (#1385).
  if (
    serverInfo.enabled !== false &&
    serverInfo.status === 'disconnected' &&
    serverInfo.recovery?.nextAttemptAt !== undefined &&
    serverInfo.keepAliveIntervalId
  ) {
    return;
  }

  // Clear any existing timer/interval first
  if (serverInfo.keepAliveIntervalId) {
    clearInterval(serverInfo.keepAliveIntervalId as NodeJS.Timeout);
    serverInfo.keepAliveIntervalId = undefined;
  }

  const canRetry = (): boolean =>
    serverInfo.enabled !== false && serverInfo.status === 'disconnected';

  if (serverInfo.enabled === false || serverInfo.status === 'oauth_required') {
    serverInfo.recovery = undefined;
    return;
  }

  // Schedule background exponential backoff recovery when disconnected (#1385).
  if (serverInfo.status === 'disconnected' && options.reconnectServer) {
    const recovery = serverInfo.recovery ?? { attempts: 0 };
    serverInfo.recovery = recovery;
    const ceiling = Math.min(300_000, 10_000 * 2 ** Math.min(recovery.attempts, 5));
    const delay = Math.round(ceiling * (0.5 + Math.random() * 0.5));
    recovery.nextAttemptAt = Date.now() + delay;
    const timer = setTimeout(async () => {
      serverInfo.keepAliveIntervalId = undefined;
      recovery.nextAttemptAt = undefined;
      if (!canRetry()) return;
      recovery.attempts += 1;
      recovery.lastAttemptAt = Date.now();
      try {
        await options.reconnectServer!(serverInfo.name);
      } catch (error) {
        if (canRetry() && serverInfo.recovery === recovery) {
          serverInfo.error = `Reconnect failed: ${formatErrorForLogging(error)}`;
          await setupClientKeepAlive(serverInfo, serverConfig, options);
        }
      }
    }, delay);
    timer.unref?.();
    serverInfo.keepAliveIntervalId = timer;
    return;
  }

  if (serverInfo.status === 'connected') {
    serverInfo.recovery = undefined;
  }

  const enabled = serverConfig.enableKeepAlive === true;
  if (!enabled) {
    return;
  }

  // Default interval: 60 seconds
  const interval = serverConfig.keepAliveInterval || 60000;
  let isChecking = false;

  const isHealthCheckCurrent = (activeClient: NonNullable<ServerInfo['client']>): boolean =>
    serverInfo.client === activeClient &&
    serverInfo.enabled !== false &&
    serverInfo.status !== 'connecting' &&
    serverInfo.status !== 'oauth_required';

  const shouldSkipCheck = (): boolean =>
    serverInfo.enabled === false ||
    serverInfo.status === 'connecting' ||
    serverInfo.status === 'oauth_required';

  const checkRemoteHealth = async (): Promise<void> => {
    const activeClient = serverInfo.client;
    if (shouldSkipCheck() || isChecking) {
      return;
    }

    if ((!activeClient || serverInfo.status === 'disconnected') && options.reconnectServer) {
      isChecking = true;
      try {
        console.log('Keep-alive reconnecting disconnected server', {
          serverName: serverInfo.name,
        });
        await options.reconnectServer(serverInfo.name);
      } catch (error) {
        if (!shouldSkipCheck() && serverInfo.status === 'disconnected') {
          const message = formatErrorForLogging(error);
          const nextError = `Reconnect failed: ${message}`;
          if (serverInfo.error !== nextError) {
            console.warn('Keep-alive reconnect failed', {
              serverName: serverInfo.name,
              error,
            });
          }
          serverInfo.status = 'disconnected';
          serverInfo.error = nextError;
        }
      } finally {
        isChecking = false;
      }
      return;
    }

    if (!activeClient) {
      return;
    }

    isChecking = true;

    try {
      const protocolVersion = (
        activeClient as { getNegotiatedProtocolVersion?: () => string | undefined }
      ).getNegotiatedProtocolVersion?.();
      const timeoutOpts = { ...(serverInfo.options || {}), timeout: 5000 };

      // Modern 2026-07-28 upstreams use network server/discover instead of ping (#1382).
      if (
        protocolVersion === '2026-07-28' &&
        typeof (activeClient as any).discover === 'function'
      ) {
        await (activeClient as any).discover(timeoutOpts);
      } else if (typeof (activeClient as any).ping === 'function') {
        await (activeClient as any).ping(timeoutOpts);
      } else {
        await activeClient.listTools({}, timeoutOpts);
      }

      if (!isHealthCheckCurrent(activeClient)) {
        return;
      }

      if (serverInfo.status !== 'connected') {
        console.log('Keep-alive ping restored server connection', {
          serverName: serverInfo.name,
        });
      }
      serverInfo.status = 'connected';
      serverInfo.error = null;
    } catch (error) {
      if (!isHealthCheckCurrent(activeClient)) {
        return;
      }

      const message = formatErrorForLogging(error);
      const nextError = `Keep-alive failed: ${message}`;
      if (serverInfo.status !== 'disconnected' || serverInfo.error !== nextError) {
        console.warn('Keep-alive ping failed', { serverName: serverInfo.name, error });
      }
      serverInfo.status = 'disconnected';
      serverInfo.error = nextError;
    } finally {
      isChecking = false;
    }
  };

  serverInfo.keepAliveIntervalId = setInterval(async () => {
    await checkRemoteHealth();
  }, interval);

  console.log('Keep-alive enabled for server', {
    serverName: serverInfo.name,
    intervalSeconds: Math.round(interval / 1000),
  });
};

/**
 * Clear keep-alive timer for a server.
 */
export const clearClientKeepAlive = (serverInfo: ServerInfo): void => {
  if (serverInfo.keepAliveIntervalId) {
    clearInterval(serverInfo.keepAliveIntervalId as NodeJS.Timeout);
    serverInfo.keepAliveIntervalId = undefined;
    console.log('Cleared keep-alive interval', { serverName: serverInfo.name });
  }
};
