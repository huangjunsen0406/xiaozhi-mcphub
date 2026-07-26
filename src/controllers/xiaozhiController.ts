import { Request, Response } from 'express';
import { xiaozhiClientService } from '../services/xiaozhiClientService.js';
import { xiaozhiEndpointService } from '../services/xiaozhiEndpointService.js';
import { getXiaozhiConfigRepository } from '../db/repositories/index.js';
import { getGroupDao } from '../dao/index.js';
import { XiaozhiEndpoint } from '../types/index.js';

type AuthUser = { username?: string; isAdmin?: boolean };

const getAuthUser = (req: Request): AuthUser => ((req as any).user || {}) as AuthUser;

const isAdminUser = (user: AuthUser): boolean => Boolean(user.isAdmin);

const canAccessEndpoint = (endpoint: XiaozhiEndpoint | undefined, user: AuthUser): boolean => {
  if (!endpoint) return false;
  if (isAdminUser(user)) return true;
  // Legacy endpoints without owner are only visible to admins for write operations;
  // for read, non-admins only see endpoints they own.
  return Boolean(endpoint.owner && endpoint.owner === user.username);
};

const maskEndpoint = (endpoint: XiaozhiEndpoint) => ({
  ...endpoint,
  webSocketUrl: endpoint.webSocketUrl.replace(/token=[^&?]*/g, 'token=***'),
});

const requireAdmin = (req: Request, res: Response): boolean => {
  if (isAdminUser(getAuthUser(req))) return true;
  res.status(403).json({ success: false, message: 'Admin privileges required' });
  return false;
};

const assertGroupOwnership = async (
  groupId: string | null | undefined,
  user: AuthUser,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> => {
  if (!groupId) return { ok: true };
  if (isAdminUser(user)) return { ok: true };

  const groups = await getGroupDao().findByOwner(user.username || '');
  if (!groups.some((g) => g.id === groupId || g.name === groupId)) {
    return { ok: false, status: 403, message: 'Group not found or not owned by current user' };
  }
  return { ok: true };
};

// 获取小智客户端状态
export const getXiaozhiStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getAuthUser(req);
    const status = xiaozhiClientService.getStatus();
    const endpoints = xiaozhiEndpointService.getEndpointsForUser(
      user.username || '',
      isAdminUser(user),
    );
    const endpointIds = new Set(endpoints.map((e) => e.id));
    const filteredEndpoints = (status.endpoints || []).filter((e: any) => endpointIds.has(e.id));
    const connected = filteredEndpoints.some((e: any) => e.status === 'connected');

    res.json({
      success: true,
      data: {
        enabled: status.enabled,
        connected: isAdminUser(user) ? status.connected : connected,
        endpoints: filteredEndpoints,
      },
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
    const user = getAuthUser(req);
    const configRepo = getXiaozhiConfigRepository();
    const dbConfig = await configRepo.getConfig();
    const endpoints = xiaozhiEndpointService.getEndpointsForUser(
      user.username || '',
      isAdminUser(user),
    );

    // 为了兼容老的前端，如果有端点，返回第一个端点的信息作为单端点模式
    const compatConfig = {
      enabled: dbConfig?.enabled ?? false,
      webSocketUrl:
        endpoints.length > 0
          ? endpoints[0].webSocketUrl.replace(/token=[^&?]*/g, 'token=***')
          : '',
      reconnect:
        endpoints.length > 0
          ? endpoints[0].reconnect
          : {
              maxAttempts: 10,
              initialDelay: 2000,
              maxDelay: 60000,
              backoffMultiplier: 2,
            },
      // 同时返回新的多端点信息
      endpoints: endpoints.map((endpoint) => maskEndpoint(endpoint)),
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

// 更新小智客户端配置（兼容老API，用于总开关）— 仅管理员
export const updateXiaozhiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;

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

// 重启小智客户端 — 仅管理员
export const restartXiaozhiClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;

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

// 停止小智客户端 — 仅管理员
export const stopXiaozhiClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;

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

// 启动小智客户端 — 仅管理员
export const startXiaozhiClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;

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

// 获取所有小智端点（按当前用户过滤）
export const getXiaozhiEndpoints = (req: Request, res: Response): void => {
  try {
    const user = getAuthUser(req);
    const endpoints = xiaozhiEndpointService.getEndpointsForUser(
      user.username || '',
      isAdminUser(user),
    );

    // 隐藏敏感信息 (URL中的token部分)
    const safeEndpoints = endpoints.map((endpoint) => maskEndpoint(endpoint));

    res.json({ success: true, data: safeEndpoints });
  } catch (error) {
    console.error('获取小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 获取单个小智端点详情（用于编辑，返回完整URL）
export const getXiaozhiEndpoint = (req: Request, res: Response): void => {
  try {
    const user = getAuthUser(req);
    const { id } = req.params;
    const endpoint = xiaozhiEndpointService.getEndpointById(id);

    if (!endpoint || !canAccessEndpoint(endpoint, user)) {
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
    const user = getAuthUser(req);
    const { name, webSocketUrl, description, groupId, useSmartRouting } = req.body;

    if (!name || !webSocketUrl) {
      res.status(400).json({
        success: false,
        message: 'Name and webSocketUrl are required',
      });
      return;
    }

    // 验证webSocketUrl格式
    if (!webSocketUrl.startsWith('ws://') && !webSocketUrl.startsWith('wss://')) {
      res.status(400).json({
        success: false,
        message: 'WebSocket URL must start with ws:// or wss://',
      });
      return;
    }

    const groupCheck = await assertGroupOwnership(groupId, user);
    if (!groupCheck.ok) {
      res.status(groupCheck.status).json({ success: false, message: groupCheck.message });
      return;
    }

    const endpoint = await xiaozhiEndpointService.createEndpoint({
      name,
      webSocketUrl,
      description: description || '',
      groupId: groupId || null,
      useSmartRouting: !!useSmartRouting,
      enabled: true,
      owner: user.username || 'admin',
      reconnect: {
        maxAttempts: 10,
        infiniteReconnect: true,
        infiniteRetryDelay: 1800000, // 30分钟
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
      },
    } as any);

    // 隐藏敏感信息返回
    res.json({ success: true, data: maskEndpoint(endpoint) });
  } catch (error) {
    console.error('创建小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 更新小智端点
export const updateXiaozhiEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getAuthUser(req);
    const { id } = req.params;
    const updateData = { ...req.body };

    const existing = xiaozhiEndpointService.getEndpointById(id);
    if (!existing || !canAccessEndpoint(existing, user)) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    // Never allow ownership transfer via API
    delete updateData.owner;
    delete updateData.id;

    // 如果URL为占位符，不更新URL
    if (updateData.webSocketUrl && updateData.webSocketUrl.includes('token=***')) {
      delete updateData.webSocketUrl;
    }

    // 验证webSocketUrl格式（如果有的话）
    if (
      updateData.webSocketUrl &&
      !updateData.webSocketUrl.startsWith('ws://') &&
      !updateData.webSocketUrl.startsWith('wss://')
    ) {
      res.status(400).json({
        success: false,
        message: 'WebSocket URL must start with ws:// or wss://',
      });
      return;
    }

    if (updateData.groupId !== undefined) {
      const groupCheck = await assertGroupOwnership(updateData.groupId, user);
      if (!groupCheck.ok) {
        res.status(groupCheck.status).json({ success: false, message: groupCheck.message });
        return;
      }
    }

    const endpoint = await xiaozhiEndpointService.updateEndpoint(id, updateData);

    if (!endpoint) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    res.json({ success: true, data: maskEndpoint(endpoint) });
  } catch (error) {
    console.error('更新小智端点失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 删除小智端点
export const deleteXiaozhiEndpoint = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getAuthUser(req);
    const { id } = req.params;
    const existing = xiaozhiEndpointService.getEndpointById(id);
    if (!existing || !canAccessEndpoint(existing, user)) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

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
    const user = getAuthUser(req);
    const { id } = req.params;
    const existing = xiaozhiEndpointService.getEndpointById(id);
    if (!existing || !canAccessEndpoint(existing, user)) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

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
    const user = getAuthUser(req);
    const { id } = req.params;
    const existing = xiaozhiEndpointService.getEndpointById(id);
    if (!existing || !canAccessEndpoint(existing, user)) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    const status = xiaozhiEndpointService.getEndpointStatus(id);

    if (!status) {
      res.status(404).json({ success: false, message: 'Endpoint not found' });
      return;
    }

    // 隐藏敏感信息
    const safeStatus = {
      ...status,
      endpoint: maskEndpoint(status.endpoint),
    };

    res.json({ success: true, data: safeStatus });
  } catch (error) {
    console.error('获取小智端点状态失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

// 获取所有小智端点状态（按当前用户过滤）
export const getAllXiaozhiEndpointStatus = (req: Request, res: Response): void => {
  try {
    const user = getAuthUser(req);
    const visibleIds = new Set(
      xiaozhiEndpointService
        .getEndpointsForUser(user.username || '', isAdminUser(user))
        .map((e) => e.id),
    );
    const allStatus = xiaozhiEndpointService
      .getAllEndpointsStatus()
      .filter((status) => visibleIds.has(status.endpoint.id));

    // 隐藏敏感信息
    const safeAllStatus = allStatus.map((status) => ({
      ...status,
      endpoint: maskEndpoint(status.endpoint),
    }));

    res.json({ success: true, data: safeAllStatus });
  } catch (error) {
    console.error('获取所有小智端点状态失败:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};
