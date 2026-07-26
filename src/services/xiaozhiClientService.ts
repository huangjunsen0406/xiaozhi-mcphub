import { xiaozhiEndpointService } from './xiaozhiEndpointService.js';

// 兼容性包装器 - 保持现有API不变，内部委托给新的端点服务
export class XiaozhiClientService {
  public async reloadConfig(): Promise<void> {
    await xiaozhiEndpointService.reloadConfig();
  }

  public isEnabled(): boolean {
    return xiaozhiEndpointService.isEnabled();
  }

  public async initialize(): Promise<void> {
    await xiaozhiEndpointService.initializeEndpoints();
  }

  public async disconnect(): Promise<void> {
    await xiaozhiEndpointService.disconnect();
  }

  public getStatus(): { enabled: boolean; connected: boolean; endpoints?: any[] } {
    const allStatus = xiaozhiEndpointService.getAllEndpointsStatus();
    const hasConnected = allStatus.some(s => s.connected);
    
    return {
      enabled: xiaozhiEndpointService.isEnabled(),
      connected: hasConnected,
      endpoints: allStatus.map(s => ({
        id: s.endpoint.id,
        name: s.endpoint.name,
        status: s.connected ? 'connected' : 'disconnected',
        webSocketUrl: s.endpoint.webSocketUrl
      }))
    };
  }

  public async notifyToolsChanged(): Promise<void> {
    await xiaozhiEndpointService.notifyToolsChanged();
  }
}

// 保持向后兼容的单例实例
export const xiaozhiClientService = new XiaozhiClientService();