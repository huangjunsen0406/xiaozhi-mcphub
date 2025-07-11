import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { WebSocketClientTransport } from '../clients/websocket.js';
import { loadSettings } from '../config/index.js';
import { handleListToolsRequest, handleCallToolRequest } from './mcpService.js';
import { XiaozhiConfig } from '../types/index.js';

export class XiaozhiClientService {
  private client: Client | null = null;
  private transport: WebSocketClientTransport | null = null;
  private config: XiaozhiConfig | null = null;
  private isInitialized = false;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    const settings = loadSettings();
    this.config = settings.xiaozhi as XiaozhiConfig;
  }

  // 重新加载配置并根据需要重新连接
  public async reloadConfig(): Promise<void> {
    const oldConfig = { ...this.config };
    this.loadConfig();
    
    // 如果配置发生了变化
    const configChanged = !oldConfig || 
      oldConfig.enabled !== this.config?.enabled ||
      oldConfig.webSocketUrl !== this.config?.webSocketUrl;
    
    if (configChanged) {
      console.log('小智配置已更改，重新初始化连接...');
      
      // 强制断开当前连接
      await this.forceDisconnect();
      
      // 如果新配置启用了小智，重新初始化
      if (this.isEnabled()) {
        await this.initialize();
      }
    }
  }

  public isEnabled(): boolean {
    return this.config?.enabled === true && !!this.config?.webSocketUrl;
  }

  public async initialize(): Promise<void> {
    if (!this.isEnabled()) {
      console.log('小智客户端服务未启用或配置不完整');
      return;
    }

    // 移除这个检查，允许重新初始化
    // if (this.isInitialized) {
    //   console.log('小智客户端服务已初始化');
    //   return;
    // }

    try {
      // 确保先断开任何现有连接
      await this.forceDisconnect();
      
      await this.connect();
      this.isInitialized = true;
      console.log('小智客户端服务初始化成功');
    } catch (error) {
      console.error('小智客户端服务初始化失败:', error);
      throw error;
    }
  }

  private async connect(): Promise<void> {
    if (!this.config) {
      throw new Error('小智配置未加载');
    }

    // 在建立新连接前，确保清理任何现有连接
    await this.forceDisconnect();

    // 使用完整的WebSocket URL
    const url = this.config.webSocketUrl;
    
    console.log(`正在连接到小智端点: ${url}`);

    // 创建WebSocket传输
    this.transport = new WebSocketClientTransport(url, {
      timeout: 30000,
      reconnect: {
        maxAttempts: this.config.reconnect?.maxAttempts || 10,
        initialDelay: this.config.reconnect?.initialDelay || 2000,
        maxDelay: this.config.reconnect?.maxDelay || 60000,
        backoffMultiplier: this.config.reconnect?.backoffMultiplier || 2,
      },
    });

    // 创建MCP客户端
    this.client = new Client(
      {
        name: 'mcphub-xiaozhi-bridge',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // 设置传输事件处理
    this.transport.onclose = () => {
      console.log('小智WebSocket连接已关闭');
      this.isInitialized = false;
    };

    this.transport.onerror = (error: Error) => {
      console.error('小智WebSocket连接错误:', error);
      this.isInitialized = false;
    };

    this.transport.onmessage = async (message) => {
      try {
        await this.handleMessage(message);
      } catch (error) {
        console.error('处理小智消息时出错:', error);
      }
    };

    // 连接到小智端点
    await this.transport.start();
    console.log(`已成功连接到小智端点: ${this.config.webSocketUrl}`);
  }

  private async handleMessage(message: any): Promise<void> {
    console.log('收到小智消息:', JSON.stringify(message, null, 2));

    // 处理MCP协议初始化请求
    if (message.method === 'initialize') {
      try {
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
        await this.sendResponse(message.id, initResponse);
        console.log('已发送初始化响应到小智');
      } catch (error) {
        await this.sendError(message.id, -32603, `初始化失败: ${error}`);
      }
      return;
    }

    // 处理ping请求
    if (message.method === 'ping') {
      try {
        await this.sendResponse(message.id, {});
        console.log('已回复ping到小智');
      } catch (error) {
        await this.sendError(message.id, -32603, `ping回复失败: ${error}`);
      }
      return;
    }

    // 处理ListTools请求
    if (message.method === 'tools/list') {
      try {
        const response = await handleListToolsRequest(message.params || {}, { sessionId: 'xiaozhi' });
        await this.sendResponse(message.id, response);
      } catch (error) {
        await this.sendError(message.id, -32603, `工具列表获取失败: ${error}`);
      }
      return;
    }

    // 处理CallTool请求
    if (message.method === 'tools/call') {
      try {
        const response = await handleCallToolRequest(message, { sessionId: 'xiaozhi' });
        await this.sendResponse(message.id, response);
      } catch (error) {
        await this.sendError(message.id, -32603, `工具调用失败: ${error}`);
      }
      return;
    }

    // 其他消息类型
    console.warn('未处理的消息类型:', message.method);
  }

  private async sendResponse(id: any, result: any): Promise<void> {
    if (!this.transport) {
      throw new Error('WebSocket传输未初始化');
    }

    const response = {
      jsonrpc: '2.0' as const,
      id: id as string | number,
      result: result as { [x: string]: unknown; _meta?: { [x: string]: unknown; } | undefined; },
    };

    await this.transport.send(response);
    console.log('已发送响应到小智:', JSON.stringify(response, null, 2));
  }

  private async sendError(id: any, code: number, message: string): Promise<void> {
    if (!this.transport) {
      throw new Error('WebSocket传输未初始化');
    }

    const error = {
      jsonrpc: '2.0' as const,
      id: id as string | number,
      error: {
        code,
        message,
      },
    };

    await this.transport.send(error);
    console.error('已发送错误响应到小智:', JSON.stringify(error, null, 2));
  }

  // 强制断开连接，确保完全清理
  private async forceDisconnect(): Promise<void> {
    console.log('正在强制断开小智客户端连接...');
    
    if (this.transport) {
      try {
        await this.transport.close();
        console.log('WebSocket传输已关闭');
      } catch (error) {
        console.warn('关闭WebSocket传输时出错:', error);
      }
      this.transport = null;
    }
    
    if (this.client) {
      try {
        this.client.close();
        console.log('MCP客户端已关闭');
      } catch (error) {
        console.warn('关闭MCP客户端时出错:', error);
      }
      this.client = null;
    }

    this.isInitialized = false;
    console.log('小智客户端连接已完全清理');
  }

  public async disconnect(): Promise<void> {
    await this.forceDisconnect();
    console.log('小智客户端服务已断开连接');
  }

  public getStatus(): { enabled: boolean; connected: boolean; webSocketUrl?: string } {
    return {
      enabled: this.isEnabled(),
      connected: this.isInitialized && !!this.transport,
      webSocketUrl: this.config?.webSocketUrl,
    };
  }

  // 通知小智工具列表已更新
  public async notifyToolsChanged(): Promise<void> {
    if (!this.transport || !this.isInitialized) {
      return;
    }

    try {
      const notification = {
        jsonrpc: '2.0' as const,
        method: 'notifications/tools/list_changed',
      };

      await this.transport.send(notification);
      console.log('已通知小智工具列表更新');
    } catch (error) {
      console.error('通知小智工具列表更新失败:', error);
    }
  }
}

// 导出单例实例
export const xiaozhiClientService = new XiaozhiClientService(); 