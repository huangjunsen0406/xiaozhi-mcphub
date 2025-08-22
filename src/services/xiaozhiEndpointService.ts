import WebSocket from 'ws';
import { loadSettings, saveSettings } from '../config/index.js';
import { XiaozhiEndpoint, XiaozhiConfig, XiaozhiEndpointStatus } from '../types/index.js';
import { handleListToolsRequest, handleCallToolRequest } from './mcpService.js';
import { getSmartRoutingConfig } from '../utils/smartRouting.js';

interface EndpointConnection {
  ws: WebSocket;
  endpoint: XiaozhiEndpoint;
  reconnectTimer?: NodeJS.Timeout;
  reconnectAttempts: number;
}

export class XiaozhiEndpointService {
  private connections: Map<string, EndpointConnection> = new Map();
  private config: XiaozhiConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    const settings = loadSettings();
    this.config = settings.xiaozhi || { enabled: false, endpoints: [] };
    
    // 如果是老版本配置，自动迁移为多端点
    if ((this.config as any).webSocketUrl && !this.config.endpoints?.length) {
      console.log('检测到老版本小智配置，正在迁移为多端点...');
      const oldConfig = this.config as any;
      this.config = {
        enabled: oldConfig.enabled,
        endpoints: [{
          id: 'migrated-default',
          name: '默认小智端点',
          enabled: true,
          webSocketUrl: oldConfig.webSocketUrl,
          description: '从老版本自动迁移的端点',
          groupId: undefined,
          reconnect: {
            maxAttempts: oldConfig.reconnect?.maxAttempts || 10,
            initialDelay: oldConfig.reconnect?.initialDelay || 2000,
            maxDelay: oldConfig.reconnect?.maxDelay || 60000,
            backoffMultiplier: oldConfig.reconnect?.backoffMultiplier || 2,
          },
          createdAt: new Date().toISOString(),
          status: 'disconnected'
        }],
        loadBalancing: {
          enabled: false,
          strategy: 'round-robin'
        }
      };
      this.saveConfig();
      console.log('小智配置已成功迁移为多端点模式');
    }
  }

  private saveConfig(): void {
    const settings = loadSettings();
    settings.xiaozhi = this.config || undefined;
    saveSettings(settings);
  }

  // 初始化所有启用的端点
  public async initializeEndpoints(): Promise<void> {
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
    // 如果已经存在连接，先断开
    await this.disconnectEndpoint(endpoint.id);

    console.log(`正在连接小智端点: ${endpoint.name} (${endpoint.webSocketUrl})`);

    const ws = new WebSocket(endpoint.webSocketUrl, {
      timeout: 30000,
    });

    const connection: EndpointConnection = {
      ws,
      endpoint: { ...endpoint },
      reconnectAttempts: 0
    };

    this.connections.set(endpoint.id, connection);

    // 设置WebSocket事件处理
    ws.on('open', () => {
      console.log(`小智端点已连接: ${endpoint.name}`);
      this.updateEndpointStatus(endpoint.id, 'connected');
      connection.reconnectAttempts = 0; // 重置重连次数
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
        const smartRoutingConfig = getSmartRoutingConfig();
        let extraParams: any = { sessionId: `xiaozhi-${endpoint.id}` };
        
        if (smartRoutingConfig.enabled) {
          extraParams.group = '$smart';
        } else if (endpoint.groupId && endpoint.groupId.trim() !== '') {
          extraParams.group = endpoint.groupId;
        }
        
        console.log(`小智端点 ${endpoint.name} 请求工具列表，分组: ${endpoint.groupId && endpoint.groupId.trim() !== '' ? endpoint.groupId : '全部'}`);
        console.log(`extraParams:`, JSON.stringify(extraParams, null, 2));
        const response = await handleListToolsRequest(message.params || {}, extraParams);
        
        // 根据端点分组过滤工具
        if (endpoint.groupId && endpoint.groupId.trim() !== '' && response.tools) {
          const filteredResponse = this.filterToolsByGroup(response, endpoint.groupId);
          await this.sendResponse(endpoint.id, message.id, filteredResponse);
        } else {
          await this.sendResponse(endpoint.id, message.id, response);
        }
        return;
      }

      // 处理CallTool请求
      if (message.method === 'tools/call') {
        const smartRoutingConfig = getSmartRoutingConfig();
        const toolName = message.params?.name;
        const isSmartRoutingTool = toolName === 'search_tools' || toolName === 'call_tool';
        
        let extraParams: any = { sessionId: `xiaozhi-${endpoint.id}` };
        
        if (smartRoutingConfig.enabled && isSmartRoutingTool) {
          extraParams.group = '$smart';
        } else if (endpoint.groupId && endpoint.groupId.trim() !== '') {
          extraParams.group = endpoint.groupId;
        }
        
        console.log(`小智端点 ${endpoint.name} 调用工具: ${toolName}`);
        const response = await handleCallToolRequest(message, extraParams);
        await this.sendResponse(endpoint.id, message.id, response);
        return;
      }

      console.warn(`端点 ${endpoint.name} 未处理的消息类型:`, message.method);
    } catch (error) {
      console.error(`处理端点 ${endpoint.name} 消息失败:`, error);
    }
  }

  // 根据分组过滤工具
  private filterToolsByGroup(response: any, groupId: string): any {
    const settings = loadSettings();
    const group = settings.groups?.find(g => g.id === groupId);
    
    if (!group || !response.tools || !Array.isArray(response.tools)) {
      return response;
    }

    // 过滤工具
    const filteredTools = response.tools.filter((tool: any) => {
      return group.servers.some((server: any) => {
        if (typeof server === 'string') return true;
        if (server.tools === 'all') return true;
        if (Array.isArray(server.tools)) {
          return server.tools.includes(tool.name);
        }
        return false;
      });
    });

    return {
      ...response,
      tools: filteredTools
    };
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
    
    if (connection.reconnectAttempts >= endpoint.reconnect.maxAttempts) {
      console.log(`端点 ${endpoint.name} 重连次数已达上限，停止重连`);
      return;
    }

    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer);
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

  // 更新端点状态
  private updateEndpointStatus(endpointId: string, status: 'connected' | 'disconnected' | 'connecting'): void {
    if (!this.config) return;

    const endpointIndex = this.config.endpoints.findIndex(e => e.id === endpointId);
    if (endpointIndex >= 0) {
      this.config.endpoints[endpointIndex].status = status;
      if (status === 'connected') {
        this.config.endpoints[endpointIndex].lastConnected = new Date().toISOString();
      }
      this.saveConfig();
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
      this.config = { enabled: false, endpoints: [] };
    }

    const endpoint: XiaozhiEndpoint = {
      ...endpointData,
      id: `endpoint-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
      status: 'disconnected'
    };

    this.config.endpoints.push(endpoint);
    this.saveConfig();

    // 如果端点已启用且服务已启用，立即连接
    if (endpoint.enabled && this.config.enabled) {
      await this.connectEndpoint(endpoint);
    }

    return endpoint;
  }

  // 公共方法：更新端点
  public async updateEndpoint(endpointId: string, updateData: Partial<XiaozhiEndpoint>): Promise<XiaozhiEndpoint | null> {
    if (!this.config) return null;

    const endpointIndex = this.config.endpoints.findIndex(e => e.id === endpointId);
    if (endpointIndex === -1) return null;

    const oldEndpoint = this.config.endpoints[endpointIndex];
    const updatedEndpoint = { ...oldEndpoint, ...updateData };
    this.config.endpoints[endpointIndex] = updatedEndpoint;
    this.saveConfig();

    // 如果URL或启用状态改变，重新连接
    if (updateData.webSocketUrl || updateData.enabled !== undefined) {
      await this.disconnectEndpoint(endpointId);
      
      if (updatedEndpoint.enabled && this.config.enabled) {
        await this.connectEndpoint(updatedEndpoint);
      }
    }

    return updatedEndpoint;
  }

  // 公共方法：删除端点
  public async deleteEndpoint(endpointId: string): Promise<boolean> {
    if (!this.config) return false;

    const endpointIndex = this.config.endpoints.findIndex(e => e.id === endpointId);
    if (endpointIndex === -1) return false;

    // 断开连接
    await this.disconnectEndpoint(endpointId);

    // 从配置中删除
    this.config.endpoints.splice(endpointIndex, 1);
    this.saveConfig();

    return true;
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
    const oldConfig = this.config ? { ...this.config } : null;
    this.loadConfig();

    // 如果配置发生变化，重新初始化
    if (!oldConfig || oldConfig.enabled !== this.config?.enabled) {
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