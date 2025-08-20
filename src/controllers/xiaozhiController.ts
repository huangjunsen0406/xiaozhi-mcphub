import { Request, Response } from 'express';
import { xiaozhiClientService } from '../services/xiaozhiClientService.js';
import { loadSettings, saveSettings } from '../config/index.js';
import { XiaozhiConfig } from '../types/index.js';

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

// 获取小智客户端配置
export const getXiaozhiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const settings = loadSettings();
    const config = settings.xiaozhi || {
      enabled: false,
      webSocketUrl: '',
      reconnect: {
        maxAttempts: 10,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
      },
    };

    // 隐藏敏感信息 (URL中的token部分)
    const safeConfig = {
      ...config,
      webSocketUrl: config.webSocketUrl ? config.webSocketUrl.replace(/token=[^&]*/g, 'token=***') : '',
    };

    res.json({
      success: true,
      data: safeConfig,
    });
  } catch (error) {
    console.error('获取小智配置失败:', error);
    res.status(500).json({
      success: false,
      message: '获取小智配置失败',
    });
  }
};

// 更新小智客户端配置
export const updateXiaozhiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const newConfig: Partial<XiaozhiConfig> = req.body;

    const settings = loadSettings();
    const currentConfig = settings.xiaozhi || {
      enabled: false,
      webSocketUrl: '',
      reconnect: {
        maxAttempts: 10,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
      },
    };

    // 如果URL为占位符，保持原有URL
    if (newConfig.webSocketUrl && newConfig.webSocketUrl.includes('token=***')) {
      newConfig.webSocketUrl = currentConfig.webSocketUrl;
    }

    // 合并配置
    const updatedConfig: XiaozhiConfig = {
      enabled: newConfig.enabled ?? currentConfig.enabled,
      webSocketUrl: newConfig.webSocketUrl ?? currentConfig.webSocketUrl,
      reconnect: {
        ...currentConfig.reconnect,
        ...newConfig.reconnect,
      },
    };

    // 验证最终配置：如果要启用小智客户端，必须有 WebSocket URL
    if (updatedConfig.enabled && !updatedConfig.webSocketUrl.trim()) {
      res.status(400).json({
        success: false,
        message: '启用小智客户端时，WebSocket URL为必填项',
      });
      return;
    }

    settings.xiaozhi = updatedConfig;

    if (!saveSettings(settings)) {
      res.status(500).json({
        success: false,
        message: '保存配置失败',
      });
      return;
    }

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