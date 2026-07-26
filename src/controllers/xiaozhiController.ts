import { Request, Response } from 'express';
import { xiaozhiClientService } from '../services/xiaozhiClientService.js';
import { xiaozhiEndpointService } from '../services/xiaozhiEndpointService.js';
// import { XiaozhiConfig } from '../types/index.js';
import { getXiaozhiConfigRepository } from '../db/repositories/index.js';

// 获取小智客户端状态
export const getXiaozhiStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const status = xiaozhiClientService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('获取小智状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取小智状态失败',
    });
  }
};

// 获取小智客户端配置（兼容老API）
export const getXiaozhiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const configRepo = getXiaozhiConfigRepository();
    const dbConfig = await configRepo.getConfig();
    const config = {
      enabled: dbConfig?.enabled ?? false,
      endpoints: xiaozhiEndpointService.getAllEndpoints(),
    };

    // 为了兼容老的前端，如果有端点，返回第一个端点的信息作为单端点模式
    const compatConfig = {
      enabled: config.enabled,
      webSocketUrl: config.endpoints.length > 0 ? 
        config.endpoints[0].webSocketUrl.replace(/token=[^&?]*/g, 'token=***') : '',
      reconnect: config.endpoints.length > 0 ? config.endpoints[0].reconnect : {
        maxAttempts: 10,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
      },
      // 同时返回新的多端点信息
      endpoints: config.endpoints.map(endpoint => ({
        ...endpoint,
        webSocketUrl: endpoint.webSocketUrl.replace(/token=[^&?]*/g, 'token=***')
      }))
    };

    res.json({
      success: true,
      data: compatConfig,
    });
  } catch (error) {
    console.error('获取小智配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取小智配置失败',
    });
  }
};

// 更新小智客户端配置（兼容老API，用于总开关）
export const updateXiaozhiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { enabled } = req.body;
    const configRepo = getXiaozhiConfigRepository();
    const currentEnabled = (await configRepo.getConfig())?.enabled ?? false;
    const targetEnabled = enabled ?? currentEnabled;

    // 验证：如果要启用小智客户端，必须有至少一个端点（从服务读取）
    if (targetEnabled && xiaozhiEndpointService.getAllEndpoints().length === 0) {
      res.status(400).json({
        success: false,
        message: '启用小智客户端时，必须至少配置一个端点',
      });
      return;
    }

    await configRepo.saveConfig({ enabled: targetEnabled });

    // 配置保存成功后，重新加载小智客户端服务配置
    try {
      await xiaozhiClientService.reloadConfig();
      console.log('小智客户端配置已热更新');
    } catch (error) {
      console.error('重新加载小智客户端配置失败:', error);
      // 不影响配置保存的成功响应，只记录错误
    }

    res.json({
      success: true,
      message: '配置更新成功',
    });
  } catch (error) {
    console.error('更新小智配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新小智配置失败',
    });
  }
};

// 重启小智客户端
export const restartXiaozhiClient = async (req: Request, res: Response): Promise<void> => {
  try {
    // 先断开连接
    await xiaozhiClientService.disconnect();
    
    // 重新初始化
    if (xiaozhiClientService.isEnabled()) {
      await xiaozhiClientService.initialize();
      res.json({
        success: true,
        message: '小智客户端重启成功',
      });
    } else {
      res.json({
        success: true,
        message: '小智客户端未启用',
      });
    }
  } catch (error) {
    console.error('重启小智客户端失败:', error);
    res.status(500).json({
      success: false,
      message: `重启小智客户端失败: ${error}`,
    });
  }
};

// 停止小智客户端
export const stopXiaozhiClient = async (req: Request, res: Response): Promise<void> => {
  try {
    await xiaozhiClientService.disconnect();
    res.json({
      success: true,
      message: '小智客户端已停止',
    });
  } catch (error) {
    console.error('停止小智客户端失败:', error);
    res.status(500).json({
      success: false,
      message: `停止小智客户端失败: ${error}`,
    });
  }
};

// 启动小智客户端
export const startXiaozhiClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!xiaozhiClientService.isEnabled()) {
      res.status(400).json({
        success: false,
        message: '小智客户端未启用，请先配置并启用',
      });
      return;
    }

    await xiaozhiClientService.initialize();
    res.json({
      success: true,
      message: '小智客户端启动成功',
    });
  } catch (error) {
    console.error('启动小智客户端失败:', error);
    res.status(500).json({
      success: false,
      message: `启动小智客户端失败: ${error}`,
    });
  }
};

// ===== 多端点管理API =====

// 获取所有小智端点
export const getXiaozhiEndpoints = (req: Request, res: Response): void => {
  try {
    const endpoints = xiaozhiEndpointService.getAllEndpoints();
    
    // 隐藏敏感信息 (URL中的token部分)
    const safeEndpoints = endpoints.map(endpoint => ({
      ...endpoint,
      webSocketUrl: endpoint.webSocketUrl.replace(/token=[^&?]*/g, 'token=***')
    }));
    
    res.json({ success: true, data: safeEndpoints });
  } catch (error) {
    console.error('获取小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 获取单个小智端点详情（用于编辑，返回完整URL）
export const getXiaozhiEndpoint = (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const endpoints = xiaozhiEndpointService.getAllEndpoints();
    const endpoint = endpoints.find(ep => ep.id === id);
    
    if (!endpoint) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }
    
    // 返回完整的端点信息，不掩码URL
    res.json({ success: true, data: endpoint });
  } catch (error) {
    console.error('获取小智端点详情失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 创建小智端点
export const createXiaozhiEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, webSocketUrl, description, groupId, useSmartRouting } = req.body;

    if (!name || !webSocketUrl) {
      res.status(400).json({ 
        success: false, 
        message: 'Name and webSocketUrl are required' 
      });
      return;
    }

    // 验证webSocketUrl格式
    if (!webSocketUrl.startsWith('ws://') && !webSocketUrl.startsWith('wss://')) {
      res.status(400).json({
        success: false,
        message: 'WebSocket URL must start with ws:// or wss://'
      });
      return;
    }

    const endpoint = await xiaozhiEndpointService.createEndpoint({
      name,
      webSocketUrl,
      description: description || '',
      groupId: groupId || null,
      useSmartRouting: !!useSmartRouting,
      enabled: true,
      reconnect: {
        maxAttempts: 10,
        infiniteReconnect: true,
        infiniteRetryDelay: 1800000, // 30分钟
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
      }
    });

    // 隐藏敏感信息返回
    const safeEndpoint = {
      ...endpoint,
      webSocketUrl: endpoint.webSocketUrl.replace(/token=[^&?]*/g, 'token=***')
    };

    res.json({ success: true, data: safeEndpoint });
  } catch (error) {
    console.error('创建小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 更新小智端点
export const updateXiaozhiEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // 如果URL为占位符，不更新URL
    if (updateData.webSocketUrl && updateData.webSocketUrl.includes('token=***')) {
      delete updateData.webSocketUrl;
    }

    // 验证webSocketUrl格式（如果有的话）
    if (updateData.webSocketUrl && !updateData.webSocketUrl.startsWith('ws://') && !updateData.webSocketUrl.startsWith('wss://')) {
      res.status(400).json({
        success: false,
        message: 'WebSocket URL must start with ws:// or wss://'
      });
      return;
    }

    const endpoint = await xiaozhiEndpointService.updateEndpoint(id, updateData);

    if (!endpoint) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    // 隐藏敏感信息返回
    const safeEndpoint = {
      ...endpoint,
      webSocketUrl: endpoint.webSocketUrl.replace(/token=[^&?]*/g, 'token=***')
    };

    res.json({ success: true, data: safeEndpoint });
  } catch (error) {
    console.error('更新小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 删除小智端点
export const deleteXiaozhiEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const success = await xiaozhiEndpointService.deleteEndpoint(id);

    if (!success) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    res.json({ success: true, message: 'Endpoint deleted successfully' });
  } catch (error) {
    console.error('删除小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 重连小智端点
export const reconnectXiaozhiEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const success = await xiaozhiEndpointService.reconnectEndpoint(id);

    if (!success) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    res.json({ success: true, message: 'Endpoint reconnection initiated' });
  } catch (error) {
    console.error('重连小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 获取小智端点状态
export const getXiaozhiEndpointStatus = (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const status = xiaozhiEndpointService.getEndpointStatus(id);

    if (!status) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    // 隐藏敏感信息
    const safeStatus = {
      ...status,
      endpoint: {
        ...status.endpoint,
        webSocketUrl: status.endpoint.webSocketUrl.replace(/token=[^&?]*/g, 'token=***')
      }
    };

    res.json({ success: true, data: safeStatus });
  } catch (error) {
    console.error('获取小智端点状态失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 获取所有小智端点状态
export const getAllXiaozhiEndpointStatus = (req: Request, res: Response): void => {
  try {
    const allStatus = xiaozhiEndpointService.getAllEndpointsStatus();
    
    // 隐藏敏感信息
    const safeAllStatus = allStatus.map(status => ({
      ...status,
      endpoint: {
        ...status.endpoint,
        webSocketUrl: status.endpoint.webSocketUrl.replace(/token=[^&?]*/g, 'token=***')
      }
    }));

    res.json({ success: true, data: safeAllStatus });
  } catch (error) {
    console.error('获取所有小智端点状态失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};