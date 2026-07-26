import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, AlertCircle, X, Bot } from 'lucide-react';
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

const Stat: React.FC<{
  label: string;
  value: React.ReactNode;
  tone?: 'ok' | 'warn' | 'err' | 'muted' | 'default';
}> = ({ label, value, tone = 'default' }) => {
  const toneColor =
    tone === 'ok'
      ? 'oklch(0.4 0.13 145)'
      : tone === 'warn'
        ? 'oklch(0.45 0.13 80)'
        : tone === 'err'
          ? 'oklch(0.45 0.18 25)'
          : tone === 'muted'
            ? 'var(--hub-ink-3)'
            : 'var(--hub-ink)';
  return (
    <div className="hub-card" style={{ padding: '14px 16px' }}>
      <div className="text-[12px]" style={{ color: 'var(--hub-ink-3)' }}>
        {label}
      </div>
      <div
        className="hub-num"
        style={{
          fontSize: 26,
          fontWeight: 500,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          marginTop: 8,
          color: toneColor,
        }}
      >
        {value}
      </div>
    </div>
  );
};

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
  const [dismissedError, setDismissedError] = useState<string | null>(null);

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
    return editingEndpoint
      ? await updateEndpoint(editingEndpoint.id, data)
      : await createEndpoint(data);
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

  const groupNameById = (id?: string) => groups.find((g) => g.id === id)?.name;
  const visibleError = error && error !== dismissedError ? error : null;
  const showSkeleton = loading && endpoints.length === 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="hub-h1">{t('xiaozhi.title')}</h1>
          <p className="hub-sub">
            <span className="hub-num">{endpoints.length}</span> {t('xiaozhi.endpointsUnit')}
            {'  ·  '}
            {t('xiaozhi.status.connected')} · <span className="hub-num">{getConnectedCount()}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-[13px]" style={{ color: 'var(--hub-ink-2)' }}>
              {t('xiaozhi.status.service')}
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={config.enabled}
              aria-label={t('xiaozhi.status.service')}
              className={`hub-switch${config.enabled ? ' on' : ''}`}
              onClick={() => handleToggleService(!config.enabled)}
            />
          </label>
          <button className="hub-btn primary" onClick={handleCreateNew}>
            <Plus size={13} /> {t('xiaozhi.addEndpoint')}
          </button>
        </div>
      </div>

      {/* Error */}
      {visibleError && (
        <div
          className="hub-card flex items-center justify-between gap-3 mb-4"
          style={{
            padding: '10px 14px',
            borderColor: 'oklch(0.85 0.1 25)',
            background: 'oklch(0.97 0.03 25)',
            color: 'oklch(0.4 0.18 25)',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span className="truncate text-[13px]">{visibleError}</span>
          </div>
          <button
            className="hub-icon-btn sm"
            onClick={() => setDismissedError(error)}
            aria-label={t('app.closeButton')}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Stat row */}
      {showSkeleton ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="hub-card animate-pulse"
              style={{ padding: '14px 16px', height: 78 }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat
            label={t('xiaozhi.status.service')}
            value={config.enabled ? t('xiaozhi.status.enabled') : t('xiaozhi.status.disabled')}
            tone={config.enabled ? 'ok' : 'muted'}
          />
          <Stat label={t('xiaozhi.status.totalEndpoints')} value={endpoints.length} />
          <Stat label={t('xiaozhi.status.enabled')} value={getEnabledCount()} />
          <Stat
            label={t('xiaozhi.status.connected')}
            value={getConnectedCount()}
            tone={getConnectedCount() > 0 ? 'ok' : 'muted'}
          />
        </div>
      )}

      {/* Endpoints */}
      {showSkeleton ? (
        <div className="hub-card p-6 text-center" style={{ color: 'var(--hub-ink-3)' }}>
          {t('app.loading')}
        </div>
      ) : endpoints.length === 0 ? (
        <div className="hub-card p-10 text-center">
          <Bot size={28} className="mx-auto mb-3" style={{ color: 'var(--hub-ink-3)' }} />
          <h3 className="hub-card-title" style={{ fontSize: 14, marginBottom: 4 }}>
            {t('xiaozhi.empty.title')}
          </h3>
          <p className="hub-sub" style={{ marginBottom: 14 }}>
            {t('xiaozhi.empty.description')}
          </p>
          <button className="hub-btn primary mx-auto" onClick={handleCreateNew}>
            <Plus size={13} /> {t('xiaozhi.addEndpoint')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
          {endpoints.map((endpoint) => (
            <XiaozhiEndpointCard
              key={endpoint.id}
              endpoint={endpoint}
              status={getEndpointStatusById(endpoint.id)}
              isReconnecting={isEndpointReconnecting(endpoint.id)}
              groupName={groupNameById(endpoint.groupId)}
              onEdit={handleEdit}
              onDelete={deleteEndpoint}
              onReconnect={reconnectEndpoint}
              onToggleEnabled={handleToggleEnabled}
            />
          ))}
        </div>
      )}

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
