import { Request, Response } from 'express';
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
  // Legacy endpoints without owner are admin-only (not shared with all users).
  // Non-admins only see/mutate endpoints they own.
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
    const status = xiaozhiEndpointService.getAggregateStatus();
    const endpoints = xiaozhiEndpointService.getEndpointsForUser(
      user.username || '',
      isAdminUser(user),
    );
    const endpointIds = new Set(endpoints.map((e) => e.id));
    const filteredEndpoints = (status.endpoints || []).filter((e) => endpointIds.has(e.id));
    const connected = filteredEndpoints.some((e) => e.status === 'connected');
    // Per-user "enabled" = any of their endpoints is enabled (no shared master switch)
    const enabled = xiaozhiEndpointService.isEnabledForUser(
      user.username || '',
      isAdminUser(user),
    );

    res.json({
      success: true,
      data: {
        enabled,
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

// Legacy single-endpoint config shape (deprecated; prefer /xiaozhi/endpoints).
export const getXiaozhiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getAuthUser(req);
    const configRepo = getXiaozhiConfigRepository();
    const dbConfig = await configRepo.getConfig();
    const endpoints = xiaozhiEndpointService.getEndpointsForUser(
      user.username || '',
      isAdminUser(user),
    );

    // Compat shape: "enabled" now means the user has any enabled endpoint.
    // Global xiaozhi_config.enabled is no longer a connection gate.
    const compatConfig = {
      enabled: endpoints.some((ep) => ep.enabled),
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
      // Expose legacy global flag for admin diagnostics only (not used for gating)
      legacyGlobalEnabled: dbConfig?.enabled ?? false,
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

/**
 * Legacy "master switch" API — now batch-toggles the caller's own endpoints.
 * There is no shared instance-wide gate; each endpoint.enabled is authoritative.
 * Admins may still write the legacy global flag for diagnostics, but it does not
 * control connections.
 */
export const updateXiaozhiConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = getAuthUser(req);
    if (!user.username) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'enabled (boolean) is required',
      });
      return;
    }

    const ownEndpoints = xiaozhiEndpointService.getEndpointsForUser(
      user.username,
      isAdminUser(user),
    );

    if (enabled && ownEndpoints.length === 0) {
      res.status(400).json({
        success: false,
        message: '没有可启用的端点，请先添加至少一个端点',
      });
      return;
    }

    // Batch update only the caller's visible endpoints
    for (const ep of ownEndpoints) {
      if (ep.enabled !== enabled) {
        await xiaozhiEndpointService.updateEndpoint(ep.id, { enabled });
      }
    }

    // Keep legacy global flag in sync for admin-only diagnostics (non-gating).
    if (isAdminUser(user)) {
      const configRepo = getXiaozhiConfigRepository();
      await configRepo.saveConfig({ enabled });
    }

    res.json({
      success: true,
      message: enabled ? '已启用我的全部端点' : '已停用我的全部端点',
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
    await xiaozhiEndpointService.disconnect();

    // 重新初始化
    if (xiaozhiEndpointService.isEnabled()) {
      await xiaozhiEndpointService.initializeEndpoints();
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

    await xiaozhiEndpointService.disconnect();
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

// 启动小智客户端 — 仅管理员（连接所有 endpoint.enabled 的端点）
export const startXiaozhiClient = async (req: Request, res: Response): Promise<void> => {
  try {
    if (!requireAdmin(req, res)) return;

    await xiaozhiEndpointService.initializeEndpoints();
    res.json({
      success: true,
      message: '小智客户端启动成功（已连接所有启用的端点）',
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
