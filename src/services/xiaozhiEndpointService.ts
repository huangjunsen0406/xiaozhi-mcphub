import WebSocket from 'ws';
import {
  XiaozhiEndpoint,
  XiaozhiConfig,
  XiaozhiEndpointStatus,
  XiaozhiEndpointRuntime,
  XiaozhiHealthSummary,
} from '../types/index.js';
import { handleListToolsRequest, handleCallToolRequest } from './mcpService.js';
import { getSmartRoutingConfig } from '../utils/smartRouting.js';
import {
  getXiaozhiConfigRepository,
  getXiaozhiEndpointRepository,
} from '../db/repositories/index.js';
import { isDatabaseConnected } from '../db/connection.js';
import type XiaozhiEndpointEntity from '../db/entities/XiaozhiEndpoint.js';

const DEFAULT_RECONNECT = {
  maxAttempts: 10,
  infiniteReconnect: true,
  infiniteRetryDelay: 1_800_000,
  initialDelay: 2000,
  maxDelay: 60_000,
  backoffMultiplier: 2,
} as const;

/** Cap simultaneous outbound reconnect attempts across all endpoints. */
const DEFAULT_MAX_CONCURRENT_RECONNECTS = 3;
/** Random jitter factor applied to reconnect delay (0–jitter). */
const DEFAULT_RECONNECT_JITTER_RATIO = 0.2;

interface EndpointConnection {
  ws: WebSocket;
  endpoint: XiaozhiEndpoint;
  reconnectTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
  isInInfiniteReconnectMode: boolean;
  infiniteRetryCount: number;
  isInSleepMode: boolean;
  /** True while a reconnect timer is armed or connect is in flight after schedule. */
  reconnectPending: boolean;
  lastError?: string;
  lastCloseCode?: number;
  lastCloseReason?: string;
  nextReconnectAt?: number;
  connectedAt?: number;
}

const logXiaozhi = (
  level: 'info' | 'warn' | 'error',
  message: string,
  meta?: Record<string, unknown>,
): void => {
  const payload = meta ? { ...meta } : undefined;
  const line = payload ? `${message} ${JSON.stringify(payload)}` : message;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
};

const mapEntityToEndpoint = (ep: XiaozhiEndpointEntity): XiaozhiEndpoint => {
  const reconnect = {
    maxAttempts: ep.reconnect?.maxAttempts ?? DEFAULT_RECONNECT.maxAttempts,
    infiniteReconnect: ep.reconnect?.infiniteReconnect ?? DEFAULT_RECONNECT.infiniteReconnect,
    infiniteRetryDelay: ep.reconnect?.infiniteRetryDelay ?? DEFAULT_RECONNECT.infiniteRetryDelay,
    initialDelay: ep.reconnect?.initialDelay ?? DEFAULT_RECONNECT.initialDelay,
    maxDelay: ep.reconnect?.maxDelay ?? DEFAULT_RECONNECT.maxDelay,
    backoffMultiplier: ep.reconnect?.backoffMultiplier ?? DEFAULT_RECONNECT.backoffMultiplier,
  };

  const status =
    ep.status === 'connected' || ep.status === 'connecting' || ep.status === 'disconnected'
      ? ep.status
      : 'disconnected';

  return {
    id: ep.id,
    name: ep.name,
    enabled: ep.enabled,
    webSocketUrl: ep.webSocketUrl,
    description: ep.description || '',
    groupId: ep.groupId || undefined,
    useSmartRouting: Boolean(ep.useSmartRouting),
    owner: ep.owner || undefined,
    reconnect,
    createdAt: (ep.createdAt || new Date()).toISOString(),
    lastConnected: ep.lastConnected ? new Date(ep.lastConnected).toISOString() : undefined,
    status,
  };
};

const toRuntime = (connection: EndpointConnection | undefined): XiaozhiEndpointRuntime => {
  if (!connection) {
    return {
      reconnectAttempts: 0,
      infiniteRetryCount: 0,
      isInInfiniteReconnectMode: false,
      isInSleepMode: false,
    };
  }
  return {
    reconnectAttempts: connection.reconnectAttempts,
    infiniteRetryCount: connection.infiniteRetryCount,
    isInInfiniteReconnectMode: connection.isInInfiniteReconnectMode,
    isInSleepMode: connection.isInSleepMode,
    lastError: connection.lastError,
    lastCloseCode: connection.lastCloseCode,
    lastCloseReason: connection.lastCloseReason,
    nextReconnectAt: connection.nextReconnectAt
      ? new Date(connection.nextReconnectAt).toISOString()
      : undefined,
    connectedAt: connection.connectedAt
      ? new Date(connection.connectedAt).toISOString()
      : undefined,
    uptimeSeconds:
      connection.connectedAt && connection.ws.readyState === WebSocket.OPEN
        ? Math.floor((Date.now() - connection.connectedAt) / 1000)
        : undefined,
  };
};

export class XiaozhiEndpointService {
  private connections: Map<string, EndpointConnection> = new Map();
  private config: XiaozhiConfig | null = null;
  private aggressiveReconnect: boolean;
  private reconnectInterval: number;
  private maxInfiniteRetries: number;
  private sleepThreshold: number;
  private sleepInterval: number;
  private maxConcurrentReconnects: number;
  private reconnectJitterRatio: number;
  /** Endpoint ids currently waiting on a reconnect timer (for backpressure). */
  private pendingReconnectIds: Set<string> = new Set();

  constructor() {
    this.aggressiveReconnect = process.env.XIAOZHI_AGGRESSIVE_RECONNECT === 'true';
    this.reconnectInterval = parseInt(process.env.XIAOZHI_RECONNECT_INTERVAL || '2000', 10);
    this.maxInfiniteRetries = parseInt(process.env.XIAOZHI_MAX_INFINITE_RETRIES || '48', 10);
    this.sleepThreshold = parseInt(process.env.XIAOZHI_SLEEP_THRESHOLD || '12', 10);
    this.sleepInterval = parseInt(process.env.XIAOZHI_SLEEP_INTERVAL || '7200000', 10);
    this.maxConcurrentReconnects = parseInt(
      process.env.XIAOZHI_MAX_CONCURRENT_RECONNECTS || String(DEFAULT_MAX_CONCURRENT_RECONNECTS),
      10,
    );
    this.reconnectJitterRatio = Math.min(
      1,
      Math.max(
        0,
        parseFloat(
          process.env.XIAOZHI_RECONNECT_JITTER_RATIO || String(DEFAULT_RECONNECT_JITTER_RATIO),
        ),
      ),
    );

    logXiaozhi('info', 'Xiaozhi endpoint reconnect config', {
      aggressiveReconnect: this.aggressiveReconnect,
      reconnectIntervalMs: this.reconnectInterval,
      maxInfiniteRetries: this.maxInfiniteRetries,
      sleepThreshold: this.sleepThreshold,
      sleepIntervalMs: this.sleepInterval,
      maxConcurrentReconnects: this.maxConcurrentReconnects,
      reconnectJitterRatio: this.reconnectJitterRatio,
    });
  }

  private applyJitter(delayMs: number): number {
    if (this.reconnectJitterRatio <= 0 || delayMs <= 0) return delayMs;
    const jitter = delayMs * this.reconnectJitterRatio * Math.random();
    return Math.floor(delayMs + jitter);
  }

  private async loadConfig(): Promise<void> {
    if (!isDatabaseConnected()) {
      if (this.config === null) {
        logXiaozhi('info', 'Database not enabled (DB_URL unset); Xiaozhi endpoints unavailable');
      }
      this.config = { enabled: false, endpoints: [] };
      return;
    }

    const configRepo = getXiaozhiConfigRepository();
    const endpointRepo = getXiaozhiEndpointRepository();

    const dbConfig = await configRepo.getConfig();
    const endpoints = await endpointRepo.findAll();

    const lb = dbConfig?.loadBalancing;
    this.config = {
      // legacy field kept for admin diagnostics only — not a connection gate
      enabled: dbConfig?.enabled ?? false,
      endpoints: endpoints.map(mapEntityToEndpoint),
      loadBalancing:
        lb && typeof lb.enabled === 'boolean' && typeof lb.strategy === 'string'
          ? {
              enabled: lb.enabled,
              strategy: lb.strategy as 'round-robin' | 'random' | 'least-connections',
            }
          : undefined,
    };
  }

  public async initializeEndpoints(): Promise<void> {
    await this.loadConfig();

    const enabledEndpoints = (this.config?.endpoints || []).filter((ep) => ep.enabled);
    if (enabledEndpoints.length === 0) {
      logXiaozhi('info', 'No enabled Xiaozhi endpoints; skip connect');
      return;
    }

    logXiaozhi('info', 'Initializing Xiaozhi endpoints', {
      enabledCount: enabledEndpoints.length,
    });

    // Stagger initial connects slightly to avoid thundering herd on boot.
    for (let i = 0; i < enabledEndpoints.length; i++) {
      const endpoint = enabledEndpoints[i];
      try {
        if (i > 0 && this.maxConcurrentReconnects > 0) {
          await new Promise((r) => setTimeout(r, 50 * i));
        }
        await this.connectEndpoint(endpoint);
      } catch (error) {
        logXiaozhi('error', 'Failed to initialize endpoint', {
          endpointId: endpoint.id,
          name: endpoint.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async connectEndpoint(endpoint: XiaozhiEndpoint): Promise<void> {
    const prevConnection = this.connections.get(endpoint.id);
    await this.disconnectEndpoint(endpoint.id, { clearReconnectState: false });

    logXiaozhi('info', 'Connecting Xiaozhi endpoint', {
      endpointId: endpoint.id,
      name: endpoint.name,
      owner: endpoint.owner,
    });

    const ws = new WebSocket(endpoint.webSocketUrl, {
      handshakeTimeout: 30_000,
    } as WebSocket.ClientOptions);

    const connection: EndpointConnection = {
      ws,
      endpoint: { ...endpoint },
      reconnectAttempts: prevConnection?.reconnectAttempts ?? 0,
      isInInfiniteReconnectMode: prevConnection?.isInInfiniteReconnectMode ?? false,
      infiniteRetryCount: prevConnection?.infiniteRetryCount ?? 0,
      isInSleepMode: prevConnection?.isInSleepMode ?? false,
      reconnectPending: false,
      lastError: prevConnection?.lastError,
      lastCloseCode: prevConnection?.lastCloseCode,
      lastCloseReason: prevConnection?.lastCloseReason,
    };

    this.connections.set(endpoint.id, connection);
    this.pendingReconnectIds.delete(endpoint.id);
    void this.updateEndpointStatus(endpoint.id, 'connecting');

    ws.on('open', () => {
      logXiaozhi('info', 'Xiaozhi endpoint connected', {
        endpointId: endpoint.id,
        name: endpoint.name,
        owner: endpoint.owner,
      });
      connection.reconnectAttempts = 0;
      connection.isInInfiniteReconnectMode = false;
      connection.infiniteRetryCount = 0;
      connection.isInSleepMode = false;
      connection.reconnectPending = false;
      connection.lastError = undefined;
      connection.lastCloseCode = undefined;
      connection.lastCloseReason = undefined;
      connection.nextReconnectAt = undefined;
      connection.connectedAt = Date.now();
      this.pendingReconnectIds.delete(endpoint.id);
      void this.updateEndpointStatus(endpoint.id, 'connected');

      try {
        ws.send(
          JSON.stringify({
            jsonrpc: '2.0' as const,
            method: 'notifications/tools/list_changed',
          }),
        );
      } catch (e) {
        logXiaozhi('warn', 'Failed to notify tools/list_changed on connect', {
          endpointId: endpoint.id,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });

    ws.on('error', (error) => {
      const message = error instanceof Error ? error.message : String(error);
      connection.lastError = message;
      logXiaozhi('error', 'Xiaozhi endpoint socket error', {
        endpointId: endpoint.id,
        name: endpoint.name,
        error: message,
      });
      void this.updateEndpointStatus(endpoint.id, 'disconnected');
      this.scheduleReconnect(connection);
    });

    ws.on('close', (code, reasonBuf) => {
      const reason = reasonBuf?.toString() || '';
      connection.lastCloseCode = code;
      connection.lastCloseReason = reason || undefined;
      if (!connection.lastError) {
        connection.lastError = reason ? `closed ${code}: ${reason}` : `closed ${code}`;
      }
      connection.connectedAt = undefined;
      logXiaozhi('info', 'Xiaozhi endpoint disconnected', {
        endpointId: endpoint.id,
        name: endpoint.name,
        code,
        reason: reason || undefined,
      });
      void this.updateEndpointStatus(endpoint.id, 'disconnected');
      this.scheduleReconnect(connection);
    });

    ws.on('message', (data) => {
      void this.handleMessage(endpoint, data);
    });
  }

  private async handleMessage(
    endpoint: XiaozhiEndpoint,
    data: WebSocket.RawData,
  ): Promise<void> {
    try {
      const message = JSON.parse(data.toString()) as {
        method?: string;
        id?: unknown;
        params?: Record<string, unknown>;
      };

      if (message.method === 'initialize') {
        await this.sendResponse(endpoint.id, message.id, {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'mcphub-xiaozhi-bridge',
            version: '1.1.1',
          },
          capabilities: {
            tools: {},
          },
        });
        return;
      }

      if (message.method === 'ping') {
        await this.sendResponse(endpoint.id, message.id, {});
        return;
      }

      if (message.method === 'tools/list') {
        const smartRoutingConfig = await getSmartRoutingConfig(endpoint.owner);
        const extraParams: { sessionId: string; group?: string } = {
          sessionId: `xiaozhi-${endpoint.id}`,
        };

        if (smartRoutingConfig.enabled && endpoint.useSmartRouting) {
          extraParams.group =
            endpoint.groupId && endpoint.groupId.trim() !== ''
              ? `$smart/${endpoint.groupId}`
              : '$smart';
        } else if (endpoint.groupId && endpoint.groupId.trim() !== '') {
          extraParams.group = endpoint.groupId;
        }

        const mode =
          smartRoutingConfig.enabled && endpoint.useSmartRouting
            ? 'smart'
            : endpoint.groupId
              ? `group:${endpoint.groupId}`
              : 'all';
        logXiaozhi('info', 'tools/list', {
          endpointId: endpoint.id,
          name: endpoint.name,
          mode,
        });

        const response = await handleListToolsRequest(message.params || {}, extraParams);
        await this.sendResponse(endpoint.id, message.id, response);
        return;
      }

      if (message.method === 'tools/call') {
        const smartRoutingConfig = await getSmartRoutingConfig(endpoint.owner);
        const toolName =
          typeof message.params?.name === 'string' ? message.params.name : undefined;
        const isSmartRoutingTool = toolName === 'search_tools' || toolName === 'call_tool';
        const extraParams: { sessionId: string; group?: string } = {
          sessionId: `xiaozhi-${endpoint.id}`,
        };

        if (smartRoutingConfig.enabled && endpoint.useSmartRouting && isSmartRoutingTool) {
          extraParams.group =
            endpoint.groupId && endpoint.groupId.trim() !== ''
              ? `$smart/${endpoint.groupId}`
              : '$smart';
        } else if (endpoint.groupId && endpoint.groupId.trim() !== '') {
          extraParams.group = endpoint.groupId;
        }

        logXiaozhi('info', 'tools/call', {
          endpointId: endpoint.id,
          name: endpoint.name,
          toolName,
        });

        const response = await handleCallToolRequest(message, extraParams);
        await this.sendResponse(endpoint.id, message.id, response);
        return;
      }

      logXiaozhi('warn', 'Unhandled Xiaozhi message method', {
        endpointId: endpoint.id,
        method: message.method,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const connection = this.connections.get(endpoint.id);
      if (connection) connection.lastError = message;
      logXiaozhi('error', 'Failed handling Xiaozhi message', {
        endpointId: endpoint.id,
        name: endpoint.name,
        error: message,
      });
    }
  }

  private async sendResponse(
    endpointId: string,
    messageId: unknown,
    result: unknown,
  ): Promise<void> {
    const connection = this.connections.get(endpointId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Endpoint ${endpointId} is not connected`);
    }

    connection.ws.send(
      JSON.stringify({
        jsonrpc: '2.0' as const,
        id: messageId,
        result,
      }),
    );
  }

  private scheduleReconnect(connection: EndpointConnection): void {
    const { endpoint } = connection;
    if (!endpoint.enabled) {
      return;
    }
    if (connection.reconnectTimer) {
      return;
    }

    // Backpressure: if too many reconnects are already pending, defer.
    if (
      this.maxConcurrentReconnects > 0 &&
      this.pendingReconnectIds.size >= this.maxConcurrentReconnects &&
      !this.pendingReconnectIds.has(endpoint.id)
    ) {
      const deferMs = this.applyJitter(Math.max(this.reconnectInterval, 1000));
      connection.nextReconnectAt = Date.now() + deferMs;
      logXiaozhi('info', 'Deferring reconnect (concurrency cap)', {
        endpointId: endpoint.id,
        name: endpoint.name,
        pending: this.pendingReconnectIds.size,
        maxConcurrentReconnects: this.maxConcurrentReconnects,
        deferMs,
      });
      connection.reconnectTimer = setTimeout(() => {
        connection.reconnectTimer = undefined;
        this.scheduleReconnect(connection);
      }, deferMs);
      return;
    }

    if (this.aggressiveReconnect) {
      const delay = this.applyJitter(this.reconnectInterval);
      connection.nextReconnectAt = Date.now() + delay;
      connection.reconnectPending = true;
      this.pendingReconnectIds.add(endpoint.id);
      logXiaozhi('info', 'Scheduling aggressive reconnect', {
        endpointId: endpoint.id,
        name: endpoint.name,
        delayMs: delay,
        attempt: connection.reconnectAttempts + 1,
      });

      connection.reconnectTimer = setTimeout(async () => {
        connection.reconnectTimer = undefined;
        connection.reconnectAttempts++;
        try {
          await this.connectEndpoint(endpoint);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          connection.lastError = message;
          this.pendingReconnectIds.delete(endpoint.id);
          logXiaozhi('error', 'Aggressive reconnect failed', {
            endpointId: endpoint.id,
            error: message,
          });
          this.scheduleReconnect(connection);
        }
      }, delay);
      return;
    }

    if (connection.reconnectAttempts >= endpoint.reconnect.maxAttempts) {
      if (endpoint.reconnect.infiniteReconnect) {
        if (!connection.isInInfiniteReconnectMode) {
          connection.isInInfiniteReconnectMode = true;
          logXiaozhi('info', 'Entering infinite reconnect mode', {
            endpointId: endpoint.id,
            name: endpoint.name,
          });
        }
        this.scheduleInfiniteReconnect(connection);
      } else {
        logXiaozhi('info', 'Reconnect attempts exhausted', {
          endpointId: endpoint.id,
          name: endpoint.name,
          maxAttempts: endpoint.reconnect.maxAttempts,
        });
      }
      return;
    }

    const baseDelay = Math.min(
      endpoint.reconnect.initialDelay *
        Math.pow(endpoint.reconnect.backoffMultiplier, connection.reconnectAttempts),
      endpoint.reconnect.maxDelay,
    );
    const delay = this.applyJitter(baseDelay);
    connection.nextReconnectAt = Date.now() + delay;
    connection.reconnectPending = true;
    this.pendingReconnectIds.add(endpoint.id);

    logXiaozhi('info', 'Scheduling reconnect', {
      endpointId: endpoint.id,
      name: endpoint.name,
      delayMs: delay,
      attempt: connection.reconnectAttempts + 1,
      maxAttempts: endpoint.reconnect.maxAttempts,
    });

    connection.reconnectTimer = setTimeout(async () => {
      connection.reconnectTimer = undefined;
      connection.reconnectAttempts++;
      try {
        await this.connectEndpoint(endpoint);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        connection.lastError = message;
        this.pendingReconnectIds.delete(endpoint.id);
        logXiaozhi('error', 'Reconnect failed', {
          endpointId: endpoint.id,
          error: message,
        });
      }
    }, delay);
  }

  private scheduleInfiniteReconnect(connection: EndpointConnection): void {
    const { endpoint } = connection;
    if (!endpoint.enabled) return;

    connection.infiniteRetryCount = (connection.infiniteRetryCount || 0) + 1;

    if (this.maxInfiniteRetries > 0 && connection.infiniteRetryCount > this.maxInfiniteRetries) {
      logXiaozhi('info', 'Max infinite reconnects reached; stopping', {
        endpointId: endpoint.id,
        name: endpoint.name,
        maxInfiniteRetries: this.maxInfiniteRetries,
      });
      void this.updateEndpointStatus(endpoint.id, 'disconnected');
      return;
    }

    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = undefined;
    }

    if (connection.infiniteRetryCount >= this.sleepThreshold && !connection.isInSleepMode) {
      connection.isInSleepMode = true;
      logXiaozhi('info', 'Entering sleep reconnect mode', {
        endpointId: endpoint.id,
        name: endpoint.name,
        sleepThreshold: this.sleepThreshold,
      });
    }

    const baseDelay = connection.isInSleepMode
      ? this.sleepInterval
      : endpoint.reconnect.infiniteRetryDelay || DEFAULT_RECONNECT.infiniteRetryDelay;
    const delay = this.applyJitter(baseDelay);
    connection.nextReconnectAt = Date.now() + delay;
    connection.reconnectPending = true;
    this.pendingReconnectIds.add(endpoint.id);

    logXiaozhi('info', 'Scheduling infinite reconnect', {
      endpointId: endpoint.id,
      name: endpoint.name,
      delayMs: delay,
      infiniteRetryCount: connection.infiniteRetryCount,
      sleepMode: connection.isInSleepMode,
    });

    connection.reconnectTimer = setTimeout(async () => {
      connection.reconnectTimer = undefined;
      try {
        await this.connectEndpoint(endpoint);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        connection.lastError = message;
        this.pendingReconnectIds.delete(endpoint.id);
        logXiaozhi('error', 'Infinite reconnect failed', {
          endpointId: endpoint.id,
          error: message,
        });
        this.scheduleInfiniteReconnect(connection);
      }
    }, delay);
  }

  private async updateEndpointStatus(
    endpointId: string,
    status: 'connected' | 'disconnected' | 'connecting',
  ): Promise<void> {
    try {
      const endpointRepo = getXiaozhiEndpointRepository();
      await endpointRepo.updateStatus(endpointId, status, new Date());
    } catch (error) {
      logXiaozhi('warn', 'Failed to persist endpoint status', {
        endpointId,
        status,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (this.config) {
      const idx = this.config.endpoints.findIndex((e) => e.id === endpointId);
      if (idx >= 0) {
        this.config.endpoints[idx].status = status;
        if (status === 'connected') {
          this.config.endpoints[idx].lastConnected = new Date().toISOString();
        }
      }
    }
  }

  /**
   * @param clearReconnectState when true (delete/disable), drop reconnect counters;
   *        when false (reconnect path), preserve attempt counters across socket churn.
   */
  private async disconnectEndpoint(
    endpointId: string,
    options: { clearReconnectState?: boolean } = {},
  ): Promise<void> {
    const { clearReconnectState = true } = options;
    const connection = this.connections.get(endpointId);
    if (!connection) return;

    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
      connection.reconnectTimer = undefined;
    }
    this.pendingReconnectIds.delete(endpointId);

    if (connection.ws) {
      connection.ws.removeAllListeners();
      if (
        connection.ws.readyState === WebSocket.OPEN ||
        connection.ws.readyState === WebSocket.CONNECTING
      ) {
        try {
          connection.ws.close();
        } catch {
          /* ignore */
        }
      }
    }

    this.connections.delete(endpointId);
    if (clearReconnectState) {
      void this.updateEndpointStatus(endpointId, 'disconnected');
    }
    logXiaozhi('info', 'Endpoint socket torn down', {
      endpointId,
      name: connection.endpoint.name,
      clearReconnectState,
    });
  }

  /** True if any endpoint row is enabled (not the legacy global flag). */
  public isEnabled(): boolean {
    return (this.config?.endpoints || []).some((ep) => ep.enabled);
  }

  public isEnabledForUser(username: string, isAdmin: boolean): boolean {
    return this.getEndpointsForUser(username, isAdmin).some((ep) => ep.enabled);
  }

  public getAllEndpoints(): XiaozhiEndpoint[] {
    return this.config?.endpoints || [];
  }

  public getEndpointsForUser(username: string, isAdmin: boolean): XiaozhiEndpoint[] {
    const all = this.getAllEndpoints();
    if (isAdmin) return all;
    return all.filter((ep) => ep.owner === username);
  }

  public getEndpointById(endpointId: string): XiaozhiEndpoint | undefined {
    return this.getAllEndpoints().find((ep) => ep.id === endpointId);
  }

  public async createEndpoint(
    endpointData: Omit<XiaozhiEndpoint, 'id' | 'createdAt' | 'status'>,
  ): Promise<XiaozhiEndpoint> {
    if (!this.config) {
      await this.loadConfig();
    }

    const id = `endpoint-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const endpoint: XiaozhiEndpoint = {
      ...endpointData,
      useSmartRouting: Boolean(endpointData.useSmartRouting),
      reconnect: {
        ...DEFAULT_RECONNECT,
        ...endpointData.reconnect,
      },
      id,
      createdAt: new Date().toISOString(),
      status: 'disconnected',
    };

    const repo = getXiaozhiEndpointRepository();
    await repo.save({
      id,
      name: endpoint.name,
      enabled: endpoint.enabled,
      webSocketUrl: endpoint.webSocketUrl,
      description: endpoint.description || '',
      groupId: endpoint.groupId ?? null,
      reconnect: endpoint.reconnect,
      useSmartRouting: endpoint.useSmartRouting ?? false,
      owner: endpoint.owner ?? null,
      status: endpoint.status ?? 'disconnected',
    } as XiaozhiEndpointEntity);

    this.config!.endpoints.push(endpoint);

    if (endpoint.enabled) {
      await this.connectEndpoint(endpoint);
    }

    return endpoint;
  }

  public async updateEndpoint(
    endpointId: string,
    updateData: Partial<XiaozhiEndpoint>,
  ): Promise<XiaozhiEndpoint | null> {
    if (!this.config) {
      await this.loadConfig();
    }

    const repo = getXiaozhiEndpointRepository();
    const patch: Partial<XiaozhiEndpointEntity> = {};
    if (updateData.name !== undefined) patch.name = updateData.name;
    if (updateData.enabled !== undefined) patch.enabled = updateData.enabled;
    if (updateData.webSocketUrl !== undefined) patch.webSocketUrl = updateData.webSocketUrl;
    if (updateData.description !== undefined) patch.description = updateData.description;
    if (updateData.groupId !== undefined) patch.groupId = updateData.groupId ?? (null as unknown as string);
    if (updateData.useSmartRouting !== undefined) patch.useSmartRouting = updateData.useSmartRouting;
    if (updateData.reconnect !== undefined) patch.reconnect = updateData.reconnect;
    if (updateData.owner !== undefined) patch.owner = updateData.owner ?? (null as unknown as string);
    if (updateData.status !== undefined) patch.status = updateData.status;

    const updated = await repo.updateById(endpointId, patch);
    if (!updated) return null;

    const index = this.config!.endpoints.findIndex((e) => e.id === endpointId);
    if (index >= 0) {
      this.config!.endpoints[index] = {
        ...this.config!.endpoints[index],
        ...updateData,
        useSmartRouting:
          updateData.useSmartRouting !== undefined
            ? updateData.useSmartRouting
            : this.config!.endpoints[index].useSmartRouting,
      };
    }

    if (updateData.webSocketUrl || updateData.enabled !== undefined) {
      await this.disconnectEndpoint(endpointId);
      const ep = this.config!.endpoints.find((e) => e.id === endpointId);
      if (ep?.enabled) {
        await this.connectEndpoint(ep);
      }
    }

    return this.config!.endpoints.find((e) => e.id === endpointId) || null;
  }

  public async deleteEndpoint(endpointId: string): Promise<boolean> {
    if (!this.config) {
      await this.loadConfig();
    }
    const endpointIndex = this.config!.endpoints.findIndex((e) => e.id === endpointId);
    if (endpointIndex === -1) return false;

    await this.disconnectEndpoint(endpointId);
    const repo = getXiaozhiEndpointRepository();
    const ok = await repo.delete(endpointId);
    if (ok) {
      this.config!.endpoints.splice(endpointIndex, 1);
    }
    return ok;
  }

  public async reconnectEndpoint(endpointId: string): Promise<boolean> {
    if (!this.config) return false;

    const endpoint = this.config.endpoints.find((e) => e.id === endpointId);
    if (!endpoint) return false;

    // Manual reconnect resets attempt counters.
    await this.disconnectEndpoint(endpointId, { clearReconnectState: true });

    if (endpoint.enabled) {
      await this.connectEndpoint(endpoint);
    }

    return true;
  }

  public getEndpointStatus(endpointId: string): XiaozhiEndpointStatus | null {
    if (!this.config) return null;

    const endpoint = this.config.endpoints.find((e) => e.id === endpointId);
    if (!endpoint) return null;

    const connection = this.connections.get(endpointId);
    const connected = connection?.ws?.readyState === WebSocket.OPEN;

    return {
      endpoint,
      connected,
      connectionCount: this.connections.size,
      lastConnected: endpoint.lastConnected,
      error: connection?.lastError,
      runtime: toRuntime(connection),
    };
  }

  public getAllEndpointsStatus(): XiaozhiEndpointStatus[] {
    if (!this.config) return [];

    return this.config.endpoints.map((endpoint) => {
      const connection = this.connections.get(endpoint.id);
      return {
        endpoint,
        connected: connection?.ws?.readyState === WebSocket.OPEN || false,
        connectionCount: this.connections.size,
        lastConnected: endpoint.lastConnected,
        error: connection?.lastError,
        runtime: toRuntime(connection),
      };
    });
  }

  /**
   * Aggregate status previously exposed via XiaozhiClientService.getStatus().
   */
  public getAggregateStatus(): {
    enabled: boolean;
    connected: boolean;
    endpoints: Array<{
      id: string;
      name: string;
      status: string;
      webSocketUrl: string;
      owner?: string;
      error?: string;
    }>;
  } {
    const allStatus = this.getAllEndpointsStatus();
    return {
      enabled: this.isEnabled(),
      connected: allStatus.some((s) => s.connected),
      endpoints: allStatus.map((s) => ({
        id: s.endpoint.id,
        name: s.endpoint.name,
        status: s.connected ? 'connected' : s.endpoint.status || 'disconnected',
        webSocketUrl: s.endpoint.webSocketUrl,
        owner: s.endpoint.owner,
        error: s.error,
      })),
    };
  }

  /** Snapshot for /health — never throws. */
  public getHealthSummary(): XiaozhiHealthSummary {
    try {
      const endpoints = this.config?.endpoints || [];
      const enabled = endpoints.filter((e) => e.enabled);
      let connected = 0;
      for (const ep of enabled) {
        if (this.connections.get(ep.id)?.ws.readyState === WebSocket.OPEN) {
          connected++;
        }
      }
      return {
        available: isDatabaseConnected(),
        enabledTotal: enabled.length,
        connected,
        disconnected: Math.max(0, enabled.length - connected),
        pendingReconnects: this.pendingReconnectIds.size,
      };
    } catch {
      return {
        available: false,
        enabledTotal: 0,
        connected: 0,
        disconnected: 0,
        pendingReconnects: 0,
      };
    }
  }

  public async disconnect(): Promise<void> {
    logXiaozhi('info', 'Disconnecting all Xiaozhi endpoints');
    for (const [endpointId] of this.connections) {
      await this.disconnectEndpoint(endpointId);
    }
  }

  public async reloadConfig(): Promise<void> {
    await this.loadConfig();
    logXiaozhi('info', 'Xiaozhi config reloaded; rebuilding connections from endpoint.enabled');
    await this.disconnect();
    await this.initializeEndpoints();
  }

  public async notifyToolsChanged(): Promise<void> {
    logXiaozhi('info', 'Notifying Xiaozhi endpoints of tools/list_changed', {
      sockets: this.connections.size,
    });

    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          connection.ws.send(
            JSON.stringify({
              jsonrpc: '2.0' as const,
              method: 'notifications/tools/list_changed',
            }),
          );
        } catch (error) {
          logXiaozhi('error', 'tools/list_changed notify failed', {
            endpointId: connection.endpoint.id,
            name: connection.endpoint.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }
}

export const xiaozhiEndpointService = new XiaozhiEndpointService();
