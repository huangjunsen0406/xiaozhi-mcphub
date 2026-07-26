import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';

export interface WebSocketClientTransportOptions {
  /** WebSocket connection timeout in milliseconds */
  timeout?: number;
  /** WebSocket headers for the connection */
  headers?: Record<string, string>;
  /** Auto-reconnect configuration */
  reconnect?: {
    /** Maximum number of reconnection attempts */
    maxAttempts?: number;
    /** Initial delay between reconnection attempts in milliseconds */
    initialDelay?: number;
    /** Maximum delay between reconnection attempts in milliseconds */
    maxDelay?: number;
    /** Backoff multiplier for reconnection delays */
    backoffMultiplier?: number;
  };
}

export class WebSocketClientTransport implements Transport {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly options: WebSocketClientTransportOptions;
  private isConnected = false;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private messageQueue: JSONRPCMessage[] = [];
  private isManuallyClosedClient = false; // 添加手动关闭标志

  // Transport interface callback properties
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;
  setProtocolVersion?: (version: string) => void;

  constructor(url: string, options: WebSocketClientTransportOptions = {}) {
    this.url = url;
    this.options = {
      timeout: 30000,
      reconnect: {
        maxAttempts: 5,
        initialDelay: 1000,
        maxDelay: 60000,
        backoffMultiplier: 2,
      },
      ...options,
    };
  }

  async start(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // 重置手动关闭标志
    this.isManuallyClosedClient = false;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (this.ws) {
          this.ws.terminate();
        }
        reject(new Error(`WebSocket connection timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      this.ws = new WebSocket(this.url, {
        headers: this.options.headers,
      });

      this.ws.on('open', () => {
        clearTimeout(timeout);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log(`WebSocket connected to ${this.url}`);
        
        // Send any queued messages
        this.flushMessageQueue();
        
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as JSONRPCMessage;
          if (this.onmessage) {
            this.onmessage(message);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
          if (this.onerror) {
            this.onerror(error as Error);
          }
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        clearTimeout(timeout);
        this.isConnected = false;
        this.ws = null;
        console.log(`WebSocket disconnected: ${code} ${reason.toString()}`);
        
        if (this.onclose) {
          this.onclose();
        }
        
        // 只有在非手动关闭的情况下才尝试重连
        if (this.shouldReconnect()) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (error: Error) => {
        clearTimeout(timeout);
        console.error('WebSocket error:', error);
        if (this.onerror) {
          this.onerror(error);
        }
        if (!this.isConnected) {
          reject(error);
        }
      });
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.isConnected || !this.ws) {
      // Queue the message if not connected
      this.messageQueue.push(message);
      console.warn('WebSocket not connected, queueing message');
      return;
    }

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(message);
      
      this.ws!.send(data, (error) => {
        if (error) {
          console.error('Failed to send WebSocket message:', error);
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  async close(): Promise<void> {
    console.log(`Closing WebSocket connection to ${this.url}`);
    
    // 设置手动关闭标志
    this.isManuallyClosedClient = true;
    
    // 停止任何重连尝试
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      console.log('Cancelled scheduled reconnection');
    }

    // 重置重连计数器，确保不会再次尝试重连
    this.reconnectAttempts = 0;

    // 关闭 WebSocket 连接
    if (this.ws) {
      // 先设置为未连接状态，避免触发重连
      this.isConnected = false;
      
      // 使用 terminate() 强制关闭，而不是 close()，确保立即断开
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.terminate();
        console.log('WebSocket connection terminated');
      }
      this.ws = null;
    }
    
    // 清空消息队列
    if (this.messageQueue.length > 0) {
      console.log(`Clearing ${this.messageQueue.length} queued messages`);
      this.messageQueue = [];
    }
    
    this.isConnected = false;
    console.log(`WebSocket connection to ${this.url} fully closed`);
  }

  private shouldReconnect(): boolean {
    // 如果是手动关闭，不进行重连
    if (this.isManuallyClosedClient) {
      console.log('Connection was manually closed, skipping reconnection');
      return false;
    }
    
    const { maxAttempts = 5 } = this.options.reconnect || {};
    return this.reconnectAttempts < maxAttempts;
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    const { initialDelay = 1000, maxDelay = 60000, backoffMultiplier = 2 } = this.options.reconnect || {};
    
    const delay = Math.min(
      initialDelay * Math.pow(backoffMultiplier, this.reconnectAttempts),
      maxDelay
    );

    console.log(`Scheduling WebSocket reconnection attempt ${this.reconnectAttempts + 1} in ${delay}ms`);

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      
      try {
        await this.start();
      } catch (error) {
        console.error('WebSocket reconnection failed:', error);
        if (this.shouldReconnect()) {
          this.scheduleReconnect();
        } else {
          console.error('WebSocket reconnection attempts exhausted');
          if (this.onerror) {
            this.onerror(new Error('WebSocket reconnection attempts exhausted'));
          }
        }
      }
    }, delay);
  }

  private flushMessageQueue(): void {
    if (this.messageQueue.length > 0) {
      console.log(`Flushing ${this.messageQueue.length} queued messages`);
      const messages = [...this.messageQueue];
      this.messageQueue = [];
      
      messages.forEach(message => {
        this.send(message).catch(error => {
          console.error('Failed to send queued message:', error);
        });
      });
    }
  }
}