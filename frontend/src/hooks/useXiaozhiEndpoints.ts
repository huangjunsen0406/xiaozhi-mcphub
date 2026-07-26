import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiResponse } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/fetchInterceptor';

// 小智端点配置类型定义
export interface XiaozhiEndpoint {
  id: string;
  name: string;
  enabled: boolean;
  webSocketUrl: string;
  description?: string;
  groupId?: string;
  useSmartRouting?: boolean;
  reconnect: {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
  };
  createdAt: string;
  lastConnected?: string;
  status?: 'connected' | 'disconnected' | 'connecting';
}

export interface XiaozhiEndpointStatus {
  endpoint: XiaozhiEndpoint;
  connected: boolean;
  connectionCount: number;
  lastConnected?: string;
}

export interface XiaozhiConfig {
  enabled: boolean;
  endpoints: XiaozhiEndpoint[];
  webSocketUrl?: string; // 向后兼容字段
  reconnect?: any; // 向后兼容字段
}

export interface CreateEndpointData {
  name: string;
  webSocketUrl: string;
  description?: string;
  groupId?: string;
  useSmartRouting?: boolean;
}

export interface UpdateEndpointData extends Partial<Omit<XiaozhiEndpoint, 'id' | 'createdAt'>> {}

export const useXiaozhiEndpoints = () => {
  const { t } = useTranslation();
  const { showToast } = useToast();

  // 状态管理
  const [config, setConfig] = useState<XiaozhiConfig>({
    enabled: false,
    endpoints: [],
  });
  const [endpoints, setEndpoints] = useState<XiaozhiEndpoint[]>([]);
  const [endpointStatuses, setEndpointStatuses] = useState<XiaozhiEndpointStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reconnectingEndpoints, setReconnectingEndpoints] = useState<Set<string>>(new Set());

  // 触发刷新
  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  // 获取小智配置（包含兼容数据）
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<XiaozhiConfig> = await apiGet('/xiaozhi/config');
      
      if (response.success && response.data) {
        setConfig(response.data);
        // 更新端点列表
        if (response.data.endpoints) {
          setEndpoints(response.data.endpoints);
        }
      } else {
        throw new Error(response.message || 'Failed to fetch xiaozhi config');
      }
    } catch (error) {
      console.error('Failed to fetch xiaozhi config:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch xiaozhi config');
      showToast(t('errors.failedToFetchXiaozhiConfig', 'Failed to fetch Xiaozhi configuration'));
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  // 获取所有端点
  const fetchEndpoints = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<XiaozhiEndpoint[]> = await apiGet('/xiaozhi/endpoints');
      
      if (response.success && response.data) {
        setEndpoints(response.data);
      } else {
        throw new Error(response.message || 'Failed to fetch endpoints');
      }
    } catch (error) {
      console.error('Failed to fetch endpoints:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch endpoints');
      showToast(t('errors.failedToFetchEndpoints', 'Failed to fetch endpoints'));
    } finally {
      setLoading(false);
    }
  }, [t, showToast]);

  // 获取所有端点状态
  const fetchEndpointStatuses = useCallback(async () => {
    try {
      const response: ApiResponse<XiaozhiEndpointStatus[]> = await apiGet('/xiaozhi/endpoints/status/all');
      
      if (response.success && response.data) {
        setEndpointStatuses(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch endpoint statuses:', error);
      // 不显示toast，因为状态获取是后台操作
    }
  }, []);

  // 创建端点
  const createEndpoint = useCallback(async (endpointData: CreateEndpointData): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<XiaozhiEndpoint> = await apiPost('/xiaozhi/endpoints', endpointData);
      
      if (response.success && response.data) {
        setEndpoints(prev => [...prev, response.data!]);
        showToast(t('settings.endpointCreated', 'Endpoint created successfully'));
        triggerRefresh();
        return true;
      } else {
        throw new Error(response.message || 'Failed to create endpoint');
      }
    } catch (error) {
      console.error('Failed to create endpoint:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to create endpoint';
      setError(errorMessage);
      showToast(t('errors.failedToCreateEndpoint', 'Failed to create endpoint'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [t, showToast, triggerRefresh]);

  // 更新端点
  const updateEndpoint = useCallback(async (endpointId: string, updateData: UpdateEndpointData): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<XiaozhiEndpoint> = await apiPut(`/xiaozhi/endpoints/${endpointId}`, updateData);
      
      if (response.success && response.data) {
        setEndpoints(prev => prev.map(ep => ep.id === endpointId ? response.data! : ep));
        showToast(t('api.success.endpointUpdated', 'Endpoint updated successfully'));
        triggerRefresh();
        return true;
      } else {
        throw new Error(response.message || 'Failed to update endpoint');
      }
    } catch (error) {
      console.error('Failed to update endpoint:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update endpoint';
      setError(errorMessage);
      showToast(t('errors.failedToUpdateEndpoint', 'Failed to update endpoint'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [t, showToast, triggerRefresh]);

  // 删除端点
  const deleteEndpoint = useCallback(async (endpointId: string): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<any> = await apiDelete(`/xiaozhi/endpoints/${endpointId}`);
      
      if (response.success) {
        setEndpoints(prev => prev.filter(ep => ep.id !== endpointId));
        showToast(t('settings.endpointDeleted', 'Endpoint deleted successfully'));
        triggerRefresh();
        return true;
      } else {
        throw new Error(response.message || 'Failed to delete endpoint');
      }
    } catch (error) {
      console.error('Failed to delete endpoint:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete endpoint';
      setError(errorMessage);
      showToast(t('errors.failedToDeleteEndpoint', 'Failed to delete endpoint'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [t, showToast, triggerRefresh]);

  // 重连端点
  const reconnectEndpoint = useCallback(async (endpointId: string): Promise<boolean> => {
    // 检查是否已在重连中
    if (reconnectingEndpoints.has(endpointId)) {
      return false;
    }

    // 设置重连状态
    setReconnectingEndpoints(prev => new Set(prev).add(endpointId));
    setError(null);

    try {
      const response: ApiResponse<any> = await apiPost(`/xiaozhi/endpoints/${endpointId}/reconnect`, {});
      
      if (response.success) {
        showToast(t('settings.endpointReconnecting', 'Endpoint reconnection initiated'));
        
        // 监听连接状态变化，成功连接后解除重连状态
        const checkConnectionStatus = async () => {
          try {
            const statusResponse: ApiResponse<XiaozhiEndpointStatus[]> = await apiGet('/xiaozhi/endpoints/status/all');
            if (statusResponse.success && statusResponse.data) {
              setEndpointStatuses(statusResponse.data);
              
              const endpointStatus = statusResponse.data.find(status => status.endpoint.id === endpointId);
              if (endpointStatus?.connected) {
                // 连接成功，解除重连状态
                setReconnectingEndpoints(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(endpointId);
                  return newSet;
                });
                return;
              }
            }
          } catch (error) {
            console.error('Failed to check connection status:', error);
          }
          
          // 如果还在重连中，继续检查（最多检查30秒）
          if (reconnectingEndpoints.has(endpointId)) {
            setTimeout(checkConnectionStatus, 2000);
          }
        };

        // 开始检查连接状态
        setTimeout(checkConnectionStatus, 1000);
        
        // 30秒后强制解除重连状态
        setTimeout(() => {
          setReconnectingEndpoints(prev => {
            const newSet = new Set(prev);
            newSet.delete(endpointId);
            return newSet;
          });
        }, 30000);
        
        return true;
      } else {
        throw new Error(response.message || 'Failed to reconnect endpoint');
      }
    } catch (error) {
      console.error('Failed to reconnect endpoint:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to reconnect endpoint';
      setError(errorMessage);
      showToast(t('errors.failedToReconnectEndpoint', 'Failed to reconnect endpoint'));
      
      // 发生错误时立即解除重连状态
      setReconnectingEndpoints(prev => {
        const newSet = new Set(prev);
        newSet.delete(endpointId);
        return newSet;
      });
      
      return false;
    }
  }, [t, showToast, reconnectingEndpoints]);

  // 更新小智总配置（启用/禁用）
  const updateConfig = useCallback(async (configData: Partial<XiaozhiConfig>): Promise<boolean> => {
    setLoading(true);
    setError(null);

    try {
      const response: ApiResponse<any> = await apiPut('/xiaozhi/config', configData);
      
      if (response.success) {
        setConfig(prev => ({ ...prev, ...configData }));
        showToast(t('api.success.xiaozhiConfigUpdated', 'Xiaozhi configuration updated'));
        triggerRefresh();
        return true;
      } else {
        throw new Error(response.message || 'Failed to update config');
      }
    } catch (error) {
      console.error('Failed to update xiaozhi config:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to update config';
      setError(errorMessage);
      showToast(t('errors.failedToUpdateXiaozhiConfig', 'Failed to update Xiaozhi configuration'));
      return false;
    } finally {
      setLoading(false);
    }
  }, [t, showToast, triggerRefresh]);

  // 根据ID获取端点
  const getEndpointById = useCallback((endpointId: string): XiaozhiEndpoint | undefined => {
    return endpoints.find(ep => ep.id === endpointId);
  }, [endpoints]);

  // 获取端点详情（完整URL用于编辑）
  const fetchEndpointDetails = useCallback(async (endpointId: string): Promise<XiaozhiEndpoint | null> => {
    try {
      const response: ApiResponse<XiaozhiEndpoint> = await apiGet(`/xiaozhi/endpoints/${endpointId}`);
      
      if (response.success && response.data) {
        return response.data;
      } else {
        throw new Error(response.message || 'Failed to fetch endpoint details');
      }
    } catch (error) {
      console.error('Failed to fetch endpoint details:', error);
      showToast(t('errors.failedToFetchEndpoints', 'Failed to fetch endpoint details'));
      return null;
    }
  }, [t, showToast]);

  // 根据ID获取端点状态
  const getEndpointStatusById = useCallback((endpointId: string): XiaozhiEndpointStatus | undefined => {
    return endpointStatuses.find(status => status.endpoint.id === endpointId);
  }, [endpointStatuses]);

  // 获取连接的端点数量
  const getConnectedCount = useCallback((): number => {
    return endpointStatuses.filter(status => status.connected).length;
  }, [endpointStatuses]);

  // 获取启用的端点数量
  const getEnabledCount = useCallback((): number => {
    return endpoints.filter(ep => ep.enabled).length;
  }, [endpoints]);

  // 检查端点是否正在重连
  const isEndpointReconnecting = useCallback((endpointId: string): boolean => {
    return reconnectingEndpoints.has(endpointId);
  }, [reconnectingEndpoints]);

  // 初始化和定期刷新
  useEffect(() => {
    fetchConfig();
    fetchEndpoints();
    fetchEndpointStatuses();
  }, [fetchConfig, fetchEndpoints, fetchEndpointStatuses, refreshKey]);

  // 定期刷新端点状态
  useEffect(() => {
    const interval = setInterval(() => {
      fetchEndpointStatuses();
    }, 5000); // 每5秒刷新一次状态

    return () => clearInterval(interval);
  }, [fetchEndpointStatuses]);

  return {
    // 数据
    config,
    endpoints,
    endpointStatuses,
    loading,
    error,

    // 操作方法
    fetchConfig,
    fetchEndpoints,
    fetchEndpointStatuses,
    createEndpoint,
    updateEndpoint,
    deleteEndpoint,
    reconnectEndpoint,
    updateConfig,
    triggerRefresh,

    // 辅助方法
    getEndpointById,
    fetchEndpointDetails,
    getEndpointStatusById,
    getConnectedCount,
    getEnabledCount,
    isEndpointReconnecting,

    // 状态管理
    setError,
  };
};