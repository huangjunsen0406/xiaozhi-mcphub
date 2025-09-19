import WebSocket from 'ws';
import { XiaozhiEndpoint, XiaozhiConfig, XiaozhiEndpointStatus } from '../types/index.js';
import { handleListToolsRequest, handleCallToolRequest } from './mcpService.js';
import { getSmartRoutingConfig } from '../utils/smartRouting.js';
import { getXiaozhiConfigRepository, getXiaozhiEndpointRepository } from '../db/repositories/index.js';

interface EndpointConnection {
  ws: WebSocket;
  endpoint: XiaozhiEndpoint;
  reconnectTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
  isInInfiniteReconnectMode?: boolean; // 是否进入无限重连模式
  infiniteRetryCount?: number; // 无限重连的次数
  isInSleepMode?: boolean; // 是否进入休眠模式
}

export class XiaozhiEndpointService {
  private connections: Map<string, EndpointConnection> = new Map();
  private config: XiaozhiConfig | null = null;
  private aggressiveReconnect: boolean;
  private reconnectInterval: number;
  private maxInfiniteRetries: number;
  private sleepThreshold: number;
  private sleepInterval: number;

  constructor() {
    // 延迟加载，避免在数据库初始化前访问仓储
    // 读取环境变量配置
    this.aggressiveReconnect = process.env.XIAOZHI_AGGRESSIVE_RECONNECT === 'true';
    this.reconnectInterval = parseInt(process.env.XIAOZHI_RECONNECT_INTERVAL || '2000', 10);
    this.maxInfiniteRetries = parseInt(process.env.XIAOZHI_MAX_INFINITE_RETRIES || '48', 10); // 默认48次（24小时）
    this.sleepThreshold = parseInt(process.env.XIAOZHI_SLEEP_THRESHOLD || '12', 10); // 默认12次后休眠
    this.sleepInterval = parseInt(process.env.XIAOZHI_SLEEP_INTERVAL || '7200000', 10); // 默认2小时
    
    if (this.aggressiveReconnect) {
      console.log(`小智端点启用快速重连模式，重连间隔：${this.reconnectInterval}ms`);
    }
    console.log(`小智端点重连配置：最大无限重连次数=${this.maxInfiniteRetries}，休眠阈值=${this.sleepThreshold}，休眠间隔=${this.sleepInterval}ms`);
  }

  private async loadConfig(): Promise<void> {
    const configRepo = getXiaozhiConfigRepository();
    const endpointRepo = getXiaozhiEndpointRepository();

    const dbConfig = await configRepo.getConfig();
    const endpoints = await endpointRepo.findAll();

    this.config = {
      enabled: dbConfig?.enabled ?? false,
      endpoints: endpoints.map((ep: any) => ({
        id: ep.id,
        name: ep.name,
        enabled: ep.enabled,
        webSocketUrl: ep.webSocketUrl,
        description: ep.description || '',
        groupId: ep.groupId || undefined,
        useSmartRouting: (ep as any).useSmartRouting || false,
        reconnect: ep.reconnect || {
          maxAttempts: 10,
          infiniteReconnect: true,
          infiniteRetryDelay: 1800000,
          initialDelay: 2000,
          maxDelay: 60000,
          backoffMultiplier: 2,
        },
        createdAt: (ep.createdAt || new Date()).toISOString(),
        lastConnected: ep.lastConnected ? new Date(ep.lastConnected).toISOString() : undefined,
        status: (ep.status as any) || 'disconnected',
      })),
      loadBalancing: dbConfig?.loadBalancing,
    } as XiaozhiConfig;
  }

  // 初始化所有启用的端点
  public async initializeEndpoints(): Promise<void> {
    // 始终从数据库读取最新配置
    await this.loadConfig();
    if (!this.isEnabled()) {
      console.log('小智端点服务未启用');
      return;
    }

    console.log('正在初始化小智端点...');
    
    for (const endpoint of this.config!.endpoints) {
      if (endpoint.enabled) {
        try {
          await this.connectEndpoint(endpoint);
        } catch (error) {
          console.error(`初始化端点 ${endpoint.name} 失败:`, error);
        }
      }
    }
  }

  // 连接单个端点
  private async connectEndpoint(endpoint: XiaozhiEndpoint): Promise<void> {
    // 在断开前保留旧连接的重连状态，避免计数被重置
    const prevConnection = this.connections.get(endpoint.id);

    // 如果已经存在连接，先断开
    await this.disconnectEndpoint(endpoint.id);

    console.log(`正在连接小智端点: ${endpoint.name} (${endpoint.webSocketUrl})`);

    const ws = new WebSocket(endpoint.webSocketUrl, {
      timeout: 30000,
    });

    const connection: EndpointConnection = {
      ws,
      endpoint: { ...endpoint },
      // 继承旧连接的重连状态，确保日志中的“第N次尝试”累计正确
      reconnectAttempts: prevConnection?.reconnectAttempts ?? 0,
      isInInfiniteReconnectMode: prevConnection?.isInInfiniteReconnectMode ?? false,
      infiniteRetryCount: prevConnection?.infiniteRetryCount ?? 0,
      isInSleepMode: prevConnection?.isInSleepMode ?? false
    };

    this.connections.set(endpoint.id, connection);

    // 设置WebSocket事件处理
    ws.on('open', () => {
      console.log(`小智端点已连接: ${endpoint.name}`);
      this.updateEndpointStatus(endpoint.id, 'connected');
      connection.reconnectAttempts = 0; // 重置重连次数
      connection.isInInfiniteReconnectMode = false; // 重置无限重连模式
      connection.infiniteRetryCount = 0; // 重置无限重连计数
      connection.isInSleepMode = false; // 重置休眠模式

      // 连接建立后立即通知工具列表可能已更新，确保首次连接即可看到工具
      try {
        const notification = {
          jsonrpc: '2.0' as const,
          method: 'notifications/tools/list_changed',
        };
        ws.send(JSON.stringify(notification));
        console.log(`已在连接建立后通知端点 ${endpoint.name} 工具列表更新`);
      } catch (e) {
        console.warn(`在连接建立后通知端点 ${endpoint.name} 工具列表更新失败:`, e);
      }
    });

    ws.on('error', (error) => {
      console.error(`小智端点连接错误 ${endpoint.name}:`, error);
      this.updateEndpointStatus(endpoint.id, 'disconnected');
      this.scheduleReconnect(connection);
    });

    ws.on('close', () => {
      console.log(`小智端点断开: ${endpoint.name}`);
      this.updateEndpointStatus(endpoint.id, 'disconnected');
      this.scheduleReconnect(connection);
    });

    ws.on('message', (data) => {
      this.handleMessage(endpoint, data);
    });
  }

  // 处理端点消息
  private async handleMessage(endpoint: XiaozhiEndpoint, data: WebSocket.RawData): Promise<void> {
    try {
      const message = JSON.parse(data.toString());
      console.log(`收到小智端点 ${endpoint.name} 消息:`, JSON.stringify(message, null, 2));

      // 处理MCP协议初始化请求
      if (message.method === 'initialize') {
        const initResponse = {
          protocolVersion: '2024-11-05',
          serverInfo: {
            name: 'mcphub-xiaozhi-bridge',
            version: '1.0.0',
          },
          capabilities: {
            tools: {},
          },
        };
        await this.sendResponse(endpoint.id, message.id, initResponse);
        return;
      }

      // 处理ping请求
      if (message.method === 'ping') {
        await this.sendResponse(endpoint.id, message.id, {});
        return;
      }

      // 处理ListTools请求 - 根据端点分组过滤
      if (message.method === 'tools/list') {
        const smartRoutingConfig = await getSmartRoutingConfig();
        const extraParams: any = { sessionId: `xiaozhi-${endpoint.id}` };

        // 端点级：仅当全局开启 且 端点选择使用智能路由 时，才切到 $smart
        if (smartRoutingConfig.enabled && (endpoint as any).useSmartRouting) {
          extraParams.group = '$smart';
        } else if (endpoint.groupId && endpoint.groupId.trim() !== '') {
          extraParams.group = endpoint.groupId;
        }

        console.log(`小智端点 ${endpoint.name} 请求工具列表，模式: ${(smartRoutingConfig.enabled && (endpoint as any).useSmartRouting) ? '智能路由' : (endpoint.groupId && endpoint.groupId.trim() !== '' ? `分组(${endpoint.groupId})` : '全部')}`);
        const response = await handleListToolsRequest(message.params || {}, extraParams);
        await this.sendResponse(endpoint.id, message.id, response);
        return;
      }

      // 处理CallTool请求
      if (message.method === 'tools/call') {
        const smartRoutingConfig = await getSmartRoutingConfig();
        const toolName = message.params?.name;
        const isSmartRoutingTool = toolName === 'search_tools' || toolName === 'call_tool';

        const extraParams: any = { sessionId: `xiaozhi-${endpoint.id}` };

        // 端点级：仅当全局开启 且 端点选择使用智能路由 且 调用的是智能路由虚拟工具 时
        if (smartRoutingConfig.enabled && (endpoint as any).useSmartRouting && isSmartRoutingTool) {
          extraParams.group = '$smart';
          // 若端点配置了分组，则把该分组内的服务器名单透传，供向量检索范围过滤
          if (endpoint.groupId && endpoint.groupId.trim() !== '') {
            extraParams.serverNamesScope = await (await import('./groupService.js')).getServersInGroup(endpoint.groupId);
          }
        } else if (endpoint.groupId && endpoint.groupId.trim() !== '') {
          extraParams.group = endpoint.groupId;
        }

        console.log(`小智端点 ${endpoint.name} 调用工具: ${toolName}，模式: ${(smartRoutingConfig.enabled && (endpoint as any).useSmartRouting && isSmartRoutingTool) ? '智能路由' : (endpoint.groupId && endpoint.groupId.trim() !== '' ? `分组(${endpoint.groupId})` : '全部')}`);
        const response = await handleCallToolRequest(message, extraParams);
        await this.sendResponse(endpoint.id, message.id, response);
        return;
      }

      console.warn(`端点 ${endpoint.name} 未处理的消息类型:`, message.method);
    } catch (error) {
      console.error(`处理端点 ${endpoint.name} 消息失败:`, error);
    }
  }


  // 发送响应到指定端点
  private async sendResponse(endpointId: string, messageId: any, result: any): Promise<void> {
    const connection = this.connections.get(endpointId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`端点 ${endpointId} 未连接`);
    }

    const response = {
      jsonrpc: '2.0' as const,
      id: messageId,
      result,
    };

    connection.ws.send(JSON.stringify(response));
    console.log(`已发送响应到端点 ${connection.endpoint.name}:`, JSON.stringify(response, null, 2));
  }

  // 调度重连
  private scheduleReconnect(connection: EndpointConnection): void {
    const { endpoint } = connection;
    // 若已存在重连定时器，则避免因 error 与 close 双触发而重复调度与重复日志
    if (connection.reconnectTimer) {
      return;
    }
    
    // 如果启用了快速重连模式，直接使用固定间隔重连
    if (this.aggressiveReconnect) {
      console.log(`端点 ${endpoint.name} 将在 ${this.reconnectInterval}ms 后重连（快速重连模式）`);

      connection.reconnectTimer = setTimeout(async () => {
        try {
          await this.connectEndpoint(endpoint);
        } catch (error) {
          console.error(`端点 ${endpoint.name} 重连失败:`, error);
          // 继续调度下次重连
          this.scheduleReconnect(connection);
        }
      }, this.reconnectInterval);
      return;
    }
    
    // 原有的重连逻辑（指数退避）
    // 检查是否已达到快速重连上限
    if (connection.reconnectAttempts >= endpoint.reconnect.maxAttempts) {
      // 如果启用了无限重连，进入无限重连模式
      if (endpoint.reconnect.infiniteReconnect) {
        if (!connection.isInInfiniteReconnectMode) {
          connection.isInInfiniteReconnectMode = true;
          console.log(`端点 ${endpoint.name} 快速重连次数已达上限，进入无限重连模式`);
        }
        this.scheduleInfiniteReconnect(connection);
      } else {
        console.log(`端点 ${endpoint.name} 重连次数已达上限，停止重连`);
      }
      return;
    }

    const delay = Math.min(
      endpoint.reconnect.initialDelay * Math.pow(endpoint.reconnect.backoffMultiplier, connection.reconnectAttempts),
      endpoint.reconnect.maxDelay
    );

    console.log(`端点 ${endpoint.name} 将在 ${delay}ms 后重连 (第${connection.reconnectAttempts + 1}次尝试)`);

    connection.reconnectTimer = setTimeout(async () => {
      connection.reconnectAttempts++;
      try {
        await this.connectEndpoint(endpoint);
      } catch (error) {
        console.error(`端点 ${endpoint.name} 重连失败:`, error);
      }
    }, delay);
  }

  // 无限重连调度
  private scheduleInfiniteReconnect(connection: EndpointConnection): void {
    const { endpoint } = connection;
    
    // 增加无限重连计数
    connection.infiniteRetryCount = (connection.infiniteRetryCount || 0) + 1;
    
    // 检查是否超过最大重连次数
    if (this.maxInfiniteRetries > 0 && connection.infiniteRetryCount > this.maxInfiniteRetries) {
      console.log(`端点 ${endpoint.name} 已达到最大无限重连次数 ${this.maxInfiniteRetries}，停止重连`);
      this.updateEndpointStatus(endpoint.id, 'disconnected');
      return;
    }
    
    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }

    // 确定延迟时间
    let delay: number;
    
    // 检查是否应该进入休眠模式
    if (connection.infiniteRetryCount >= this.sleepThreshold && !connection.isInSleepMode) {
      connection.isInSleepMode = true;
      console.log(`端点 ${endpoint.name} 连续失败 ${this.sleepThreshold} 次，进入休眠模式`);
    }
    
    if (connection.isInSleepMode) {
      delay = this.sleepInterval; // 休眠模式使用更长的间隔
      console.log(`端点 ${endpoint.name} 处于休眠模式，将在 ${Math.round(delay / 60000)}分钟 后重连（第${connection.infiniteRetryCount}次）`);
    } else {
      delay = endpoint.reconnect.infiniteRetryDelay || 1800000; // 正常的30分钟间隔
      console.log(`端点 ${endpoint.name} 将在 ${Math.round(delay / 60000)}分钟 后进行无限重连（第${connection.infiniteRetryCount}次）`);
    }

    connection.reconnectTimer = setTimeout(async () => {
      console.log(`端点 ${endpoint.name} 进行无限重连尝试（第${connection.infiniteRetryCount}/${this.maxInfiniteRetries || '∞'}次）...`);
      try {
        await this.connectEndpoint(endpoint);
      } catch (error) {
        console.error(`端点 ${endpoint.name} 无限重连失败:`, error);
        // 继续调度下次无限重连
        this.scheduleInfiniteReconnect(connection);
      }
    }, delay);
  }

  // 更新端点状态
  private async updateEndpointStatus(endpointId: string, status: 'connected' | 'disconnected' | 'connecting'): Promise<void> {
    const endpointRepo = getXiaozhiEndpointRepository();
    await endpointRepo.updateStatus(endpointId, status, new Date());
    if (this.config) {
      const idx = this.config.endpoints.findIndex(e => e.id === endpointId);
      if (idx >= 0) {
        this.config.endpoints[idx].status = status;
        if (status === 'connected') {
          this.config.endpoints[idx].lastConnected = new Date().toISOString();
        }
      }
    }
  }

  // 断开指定端点
  private async disconnectEndpoint(endpointId: string): Promise<void> {
    const connection = this.connections.get(endpointId);
    if (!connection) return;

    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
    }

    if (connection.ws) {
      connection.ws.removeAllListeners();
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
    }

    this.connections.delete(endpointId);
    this.updateEndpointStatus(endpointId, 'disconnected');
    console.log(`端点 ${connection.endpoint.name} 已断开`);
  }

  // 公共方法：检查是否启用
  public isEnabled(): boolean {
    return this.config?.enabled === true && this.config.endpoints.length > 0;
  }

  // 公共方法：获取所有端点
  public getAllEndpoints(): XiaozhiEndpoint[] {
    return this.config?.endpoints || [];
  }

  // 公共方法：创建端点
  public async createEndpoint(endpointData: Omit<XiaozhiEndpoint, 'id' | 'createdAt' | 'status'>): Promise<XiaozhiEndpoint> {
    if (!this.config) {
      await this.loadConfig();
    }

    const id = `endpoint-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const endpoint: XiaozhiEndpoint = {
      ...endpointData,
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
      groupId: endpoint.groupId || null as any,
      reconnect: endpoint.reconnect,
      useSmartRouting: (endpoint as any).useSmartRouting || false,
      status: endpoint.status,
    } as any);

    this.config!.endpoints.push(endpoint);

    if (endpoint.enabled && this.config!.enabled) {
      await this.connectEndpoint(endpoint);
    }

    return endpoint;
  }

  // 公共方法：更新端点
  public async updateEndpoint(endpointId: string, updateData: Partial<XiaozhiEndpoint>): Promise<XiaozhiEndpoint | null> {
    if (!this.config) {
      await this.loadConfig();
    }

    const repo = getXiaozhiEndpointRepository();
    const updated = await repo.updateById(endpointId, updateData as any);
    if (!updated) return null;

    const index = this.config!.endpoints.findIndex(e => e.id === endpointId);
    if (index >= 0) {
      this.config!.endpoints[index] = {
        ...this.config!.endpoints[index],
        ...updateData,
      } as XiaozhiEndpoint;
    }

    if (updateData.webSocketUrl || updateData.enabled !== undefined) {
      await this.disconnectEndpoint(endpointId);
      const ep = this.config!.endpoints.find(e => e.id === endpointId)!;
      if (ep.enabled && this.config!.enabled) {
        await this.connectEndpoint(ep);
      }
    }

    return this.config!.endpoints.find(e => e.id === endpointId) || null;
  }

  // 公共方法：删除端点
  public async deleteEndpoint(endpointId: string): Promise<boolean> {
    if (!this.config) {
      await this.loadConfig();
    }
    const endpointIndex = this.config!.endpoints.findIndex(e => e.id === endpointId);
    if (endpointIndex === -1) return false;

    await this.disconnectEndpoint(endpointId);
    const repo = getXiaozhiEndpointRepository();
    const ok = await repo.delete(endpointId);
    if (ok) {
      this.config!.endpoints.splice(endpointIndex, 1);
    }
    return ok;
  }

  // 公共方法：重连端点
  public async reconnectEndpoint(endpointId: string): Promise<boolean> {
    if (!this.config) return false;

    const endpoint = this.config.endpoints.find(e => e.id === endpointId);
    if (!endpoint) return false;

    await this.disconnectEndpoint(endpointId);
    
    if (endpoint.enabled && this.config.enabled) {
      await this.connectEndpoint(endpoint);
    }

    return true;
  }

  // 公共方法：获取端点状态
  public getEndpointStatus(endpointId: string): XiaozhiEndpointStatus | null {
    if (!this.config) return null;

    const endpoint = this.config.endpoints.find(e => e.id === endpointId);
    if (!endpoint) return null;

    const connection = this.connections.get(endpointId);
    const connected = connection?.ws?.readyState === WebSocket.OPEN;

    return {
      endpoint,
      connected,
      connectionCount: this.connections.size,
      lastConnected: endpoint.lastConnected,
    };
  }

  // 公共方法：获取所有端点状态
  public getAllEndpointsStatus(): XiaozhiEndpointStatus[] {
    if (!this.config) return [];

    return this.config.endpoints.map(endpoint => ({
      endpoint,
      connected: this.connections.get(endpoint.id)?.ws?.readyState === WebSocket.OPEN || false,
      connectionCount: this.connections.size,
      lastConnected: endpoint.lastConnected,
    }));
  }

  // 公共方法：断开所有连接
  public async disconnect(): Promise<void> {
    console.log('正在断开所有小智端点连接...');
    
    for (const [endpointId] of this.connections) {
      await this.disconnectEndpoint(endpointId);
    }

    console.log('所有小智端点已断开');
  }

  // 公共方法：重新加载配置
  public async reloadConfig(): Promise<void> {
    const oldEnabled = this.config?.enabled;
    await this.loadConfig();
    if (oldEnabled !== this.config?.enabled) {
      console.log('小智端点配置已更改，重新初始化连接...');
      await this.disconnect();
      if (this.isEnabled()) {
        await this.initializeEndpoints();
      }
    }
  }

  // 公共方法：通知工具列表更新
  public async notifyToolsChanged(): Promise<void> {
    console.log('通知所有小智端点工具列表更新...');
    
    for (const connection of this.connections.values()) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        try {
          const notification = {
            jsonrpc: '2.0' as const,
            method: 'notifications/tools/list_changed',
          };

          connection.ws.send(JSON.stringify(notification));
          console.log(`已通知端点 ${connection.endpoint.name} 工具列表更新`);
        } catch (error) {
          console.error(`通知端点 ${connection.endpoint.name} 工具列表更新失败:`, error);
        }
      }
    }
  }
}

// 导出单例实例
export const xiaozhiEndpointService = new XiaozhiEndpointService();