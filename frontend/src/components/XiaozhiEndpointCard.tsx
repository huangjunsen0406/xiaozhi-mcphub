import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, RefreshCw, Trash2 } from 'lucide-react';
import ConfirmDialog from './ui/ConfirmDialog';
import { StatusDot, DotKind } from './ui/StatusDot';
import { XiaozhiEndpoint, XiaozhiEndpointStatus } from '../hooks/useXiaozhiEndpoints';

interface XiaozhiEndpointCardProps {
  endpoint: XiaozhiEndpoint;
  status?: XiaozhiEndpointStatus;
  isReconnecting?: boolean;
  groupName?: string;
  onEdit: (endpoint: XiaozhiEndpoint) => void;
  onDelete: (endpointId: string) => void;
  onReconnect: (endpointId: string) => void;
  onToggleEnabled: (endpointId: string, enabled: boolean) => void;
}

const XiaozhiEndpointCard: React.FC<XiaozhiEndpointCardProps> = ({
  endpoint,
  status,
  isReconnecting = false,
  groupName,
  onEdit,
  onDelete,
  onReconnect,
  onToggleEnabled,
}) => {
  const { t } = useTranslation();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleDelete = () => {
    onDelete(endpoint.id);
    setShowDeleteDialog(false);
  };

  const statusDot = (): { kind: DotKind; label: string } => {
    if (!endpoint.enabled) {
      return { kind: 'muted', label: t('xiaozhi.status.disabled') };
    }
    if (isReconnecting) {
      return { kind: 'warn', label: t('xiaozhi.reconnect.connecting') };
    }
    if (!status) {
      return { kind: 'muted', label: t('xiaozhi.status.unknown') };
    }
    return status.connected
      ? { kind: 'ok', label: t('xiaozhi.status.connected') }
      : { kind: 'err', label: t('xiaozhi.status.disconnected') };
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('xiaozhi.never');
    return new Date(dateString).toLocaleString();
  };

  const { kind, label } = statusDot();
  const metaLabel = (text: string) => (
    <span style={{ color: 'var(--hub-ink-3)' }}>{text}</span>
  );

  return (
    <div className="hub-card flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div
        className="flex items-start gap-3 px-4 py-3"
        style={{ borderBottom: '1px solid var(--hub-line-2)' }}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="truncate"
              style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.015em' }}
            >
              {endpoint.name}
            </span>
            <StatusDot kind={kind} label={label} />
            {groupName ? (
              <span className="hub-tag" title={groupName}>
                {groupName}
              </span>
            ) : (
              <span className="hub-tag" style={{ color: 'var(--hub-ink-3)' }}>
                {t('xiaozhi.allTools')}
              </span>
            )}
            {endpoint.useSmartRouting && (
              <span className="hub-tag">{t('xiaozhi.form.useSmartRouting')}</span>
            )}
          </div>
          {endpoint.description && (
            <div className="truncate" style={{ fontSize: 12.5, color: 'var(--hub-ink-3)', marginTop: 2 }}>
              {endpoint.description}
            </div>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={endpoint.enabled}
          aria-label={t('xiaozhi.enabled')}
          className={`hub-switch card flex-shrink-0${endpoint.enabled ? ' on' : ''}`}
          style={{ marginTop: 3 }}
          onClick={() => onToggleEnabled(endpoint.id, !endpoint.enabled)}
        />
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-3 space-y-2.5">
        <div>
          <div className="text-[11px] mb-1" style={{ color: 'var(--hub-ink-3)' }}>
            {t('xiaozhi.url')}
          </div>
          <div
            className="hub-mono truncate"
            style={{
              fontSize: 12,
              padding: '5px 8px',
              borderRadius: 6,
              background: 'var(--hub-bg-2)',
              border: '1px solid var(--hub-line)',
              color: 'var(--hub-ink-2)',
            }}
            title={endpoint.webSocketUrl}
          >
            {endpoint.webSocketUrl}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5" style={{ fontSize: 12 }}>
          <div className="min-w-0">
            {metaLabel(t('xiaozhi.created'))}
            <div className="truncate" style={{ color: 'var(--hub-ink-2)' }}>
              {formatDate(endpoint.createdAt)}
            </div>
          </div>
          <div className="min-w-0">
            {metaLabel(t('xiaozhi.lastConnected'))}
            <div className="truncate" style={{ color: 'var(--hub-ink-2)' }}>
              {formatDate(endpoint.lastConnected)}
            </div>
          </div>
          <div className="min-w-0">
            {metaLabel(t('xiaozhi.reconnect.maxAttempts'))}
            <div className="hub-num hub-mono" style={{ color: 'var(--hub-ink-2)' }}>
              {endpoint.reconnect.infiniteReconnect ? '∞' : endpoint.reconnect.maxAttempts}
            </div>
          </div>
          <div className="min-w-0">
            {metaLabel(t('xiaozhi.reconnect.initialDelay'))}
            <div className="hub-num hub-mono" style={{ color: 'var(--hub-ink-2)' }}>
              {endpoint.reconnect.initialDelay}ms
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5"
        style={{ borderTop: '1px solid var(--hub-line-2)' }}
      >
        <div className="flex gap-2">
          <button className="hub-btn sm" onClick={() => onEdit(endpoint)}>
            <Pencil size={12} /> {t('server.edit')}
          </button>
          <button
            className="hub-btn sm"
            onClick={() => onReconnect(endpoint.id)}
            disabled={!endpoint.enabled || isReconnecting}
          >
            <RefreshCw size={12} className={isReconnecting ? 'animate-spin' : undefined} />
            {isReconnecting ? t('xiaozhi.reconnect.connecting') : t('xiaozhi.reconnect.title')}
          </button>
        </div>

        <button
          className="hub-icon-btn sm"
          style={{ color: 'var(--hub-ink-3)' }}
          onClick={() => setShowDeleteDialog(true)}
          aria-label={t('common.delete')}
          title={t('common.delete')}
        >
          <Trash2 size={13} />
        </button>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title={t('xiaozhi.delete.title')}
        message={t('xiaozhi.delete.message')}
        confirmText={t('common.delete')}
        cancelText={t('common.cancel')}
      />
    </div>
  );
};

export default XiaozhiEndpointCard;
