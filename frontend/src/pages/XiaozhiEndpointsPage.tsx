import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/Button';
import XiaozhiEndpointCard from '../components/XiaozhiEndpointCard';
import XiaozhiEndpointModal from '../components/XiaozhiEndpointModal';
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
  const [showModal, setShowModal] = useState(false);
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
    setShowModal(true);
  };

  const handleEdit = async (endpoint: XiaozhiEndpoint) => {
    // 获取端点的完整详情（包含真实URL）
    const fullEndpoint = await fetchEndpointDetails(endpoint.id);
    if (fullEndpoint) {
      setEditingEndpoint(fullEndpoint);
      setShowModal(true);
    }
  };

  const handleFormSubmit = async (data: any) => {
    const success = editingEndpoint
      ? await updateEndpoint(editingEndpoint.id, data)
      : await createEndpoint(data);
    
    return success;
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingEndpoint(undefined);
  };

  const handleToggleEnabled = async (endpointId: string, enabled: boolean) => {
    await updateEndpoint(endpointId, { enabled });
  };

  const handleToggleService = async (enabled: boolean) => {
    await updateConfig({ enabled });
  };


  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {t('xiaozhi.title', 'Xiaozhi Endpoints')}
            </h1>
            <p className="mt-1 text-gray-600 dark:text-gray-400">
              {t('xiaozhi.description', 'Manage your Xiaozhi WebSocket endpoints for MCP integration')}
            </p>
          </div>
          
          <Button onClick={handleCreateNew}>
            {t('xiaozhi.addEndpoint', 'Add Endpoint')}
          </Button>
        </div>

        {/* Status Overview */}
        <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-4">
          <div className="p-4 bg-white border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('xiaozhi.status.service', 'Service Status')}
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {config.enabled ? t('xiaozhi.status.enabled', 'Enabled') : t('xiaozhi.status.disabled', 'Disabled')}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={config.enabled}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${config.enabled ? 'bg-blue-200' : 'bg-gray-100'}`}
                onClick={() => handleToggleService(!config.enabled)}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          </div>

          <div className="p-4 bg-white border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('xiaozhi.status.totalEndpoints', 'Total Endpoints')}
            </p>
            <p className="text-2xl font-bold text-blue-600">{endpoints.length}</p>
          </div>

          <div className="p-4 bg-white border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('xiaozhi.status.enabled', 'Enabled')}
            </p>
            <p className="text-2xl font-bold text-green-600">{getEnabledCount()}</p>
          </div>

          <div className="p-4 bg-white border border-gray-200 rounded-lg dark:bg-gray-800 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('xiaozhi.status.connected', 'Connected')}
            </p>
            <p className="text-2xl font-bold text-emerald-600">{getConnectedCount()}</p>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 mb-6 border border-red-200 rounded-lg bg-red-50 dark:bg-red-900/20 dark:border-red-800">
          <p className="text-red-800 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Endpoints List */}
      <div className="space-y-4">
        {loading && endpoints.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              {t('app.loading', 'Loading...')}
            </p>
          </div>
        ) : endpoints.length === 0 ? (
          <div className="py-12 text-center">
            <div className="max-w-md mx-auto">
              <div className="mb-4">
                <svg
                  className="w-12 h-12 mx-auto text-gray-400"
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
              <h3 className="mb-2 text-lg font-medium text-gray-900 dark:text-white">
                {t('xiaozhi.empty.title', 'No endpoints configured')}
              </h3>
              <p className="mb-4 text-gray-500 dark:text-gray-400">
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

      {/* Modal */}
      <XiaozhiEndpointModal
        isOpen={showModal}
        endpoint={editingEndpoint}
        groups={groups}
        onSubmit={handleFormSubmit}
        onClose={handleModalClose}
        loading={loading}
      />
    </div>
  );
};

export default XiaozhiEndpointsPage;