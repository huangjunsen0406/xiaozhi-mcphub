import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import XiaozhiEndpointCard from '../components/XiaozhiEndpointCard';
import XiaozhiEndpointForm from '../components/XiaozhiEndpointForm';
import { useXiaozhiEndpoints, XiaozhiEndpoint } from '../hooks/useXiaozhiEndpoints';
import { ApiResponse } from '@/types';
import { apiGet } from '../utils/fetchInterceptor';

interface Group {
  id: string;
  name: string;
  description?: string;
}

const XiaozhiEndpointsPage: React.FC = () => {
  const { t } = useTranslation();
  const {
    config,
    endpoints,
    endpointStatuses,
    loading,
    error,
    createEndpoint,
    updateEndpoint,
    deleteEndpoint,
    reconnectEndpoint,
    updateConfig,
    fetchEndpointDetails,
    getEndpointStatusById,
    getConnectedCount,
    getEnabledCount,
    isEndpointReconnecting,
  } = useXiaozhiEndpoints();

  const [groups, setGroups] = useState<Group[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<XiaozhiEndpoint | undefined>();

  // Fetch groups for the form dropdown
  useEffect(() => {
    const fetchGroups = async () => {
      try {
        const response: ApiResponse<Group[]> = await apiGet('/groups');
        if (response.success && response.data) {
          setGroups(response.data);
        }
      } catch (error) {
        console.error('Failed to fetch groups:', error);
      }
    };

    fetchGroups();
  }, []);

  const handleCreateNew = () => {
    setEditingEndpoint(undefined);
    setShowForm(true);
  };

  const handleEdit = async (endpoint: XiaozhiEndpoint) => {
    // 获取端点的完整详情（包含真实URL）
    const fullEndpoint = await fetchEndpointDetails(endpoint.id);
    if (fullEndpoint) {
      setEditingEndpoint(fullEndpoint);
      setShowForm(true);
    }
  };

  const handleFormSubmit = async (data: any) => {
    const success = editingEndpoint
      ? await updateEndpoint(editingEndpoint.id, data)
      : await createEndpoint(data);
    
    if (success) {
      setShowForm(false);
      setEditingEndpoint(undefined);
    }
    
    return success;
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setEditingEndpoint(undefined);
  };

  const handleToggleEnabled = async (endpointId: string, enabled: boolean) => {
    await updateEndpoint(endpointId, { enabled });
  };

  const handleToggleService = async (enabled: boolean) => {
    await updateConfig({ enabled });
  };

  if (showForm) {
    return (
      <div className="p-6">
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={handleFormCancel}
            className="mb-4"
          >
            ← {t('common.back', 'Back')}
          </Button>
        </div>

        <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <XiaozhiEndpointForm
            endpoint={editingEndpoint}
            groups={groups}
            onSubmit={handleFormSubmit}
            onCancel={handleFormCancel}
            loading={loading}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('xiaozhi.title', 'Xiaozhi Endpoints')}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {t('xiaozhi.description', 'Manage your Xiaozhi WebSocket endpoints for MCP integration')}
            </p>
          </div>
          
          <Button onClick={handleCreateNew}>
            {t('xiaozhi.addEndpoint', 'Add Endpoint')}
          </Button>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('xiaozhi.status.service', 'Service Status')}
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {config.enabled ? t('xiaozhi.status.enabled', 'Enabled') : t('xiaozhi.status.disabled', 'Disabled')}
                </p>
              </div>
              <label className="inline-flex items-center">
                <input
                  type="checkbox"
                  checked={config.enabled}
                  onChange={(e) => handleToggleService(e.target.checked)}
                  className="form-checkbox h-4 w-4 text-blue-600 transition duration-150 ease-in-out"
                />
              </label>
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('xiaozhi.status.totalEndpoints', 'Total Endpoints')}
            </p>
            <p className="text-2xl font-bold text-blue-600">{endpoints.length}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('xiaozhi.status.enabled', 'Enabled')}
            </p>
            <p className="text-2xl font-bold text-green-600">{getEnabledCount()}</p>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('xiaozhi.status.connected', 'Connected')}
            </p>
            <p className="text-2xl font-bold text-emerald-600">{getConnectedCount()}</p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Endpoints List */}
      <div className="space-y-4">
        {loading && endpoints.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">
              {t('common.loading', 'Loading...')}
            </p>
          </div>
        ) : endpoints.length === 0 ? (
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {t('xiaozhi.empty.title', 'No endpoints configured')}
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                {t('xiaozhi.empty.description', 'Get started by creating your first Xiaozhi endpoint.')}
              </p>
              <Button onClick={handleCreateNew}>
                {t('xiaozhi.addEndpoint', 'Add Endpoint')}
              </Button>
            </div>
          </div>
        ) : (
          endpoints.map((endpoint) => (
            <XiaozhiEndpointCard
              key={endpoint.id}
              endpoint={endpoint}
              status={getEndpointStatusById(endpoint.id)}
              isReconnecting={isEndpointReconnecting(endpoint.id)}
              onEdit={handleEdit}
              onDelete={deleteEndpoint}
              onReconnect={reconnectEndpoint}
              onToggleEnabled={handleToggleEnabled}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default XiaozhiEndpointsPage;