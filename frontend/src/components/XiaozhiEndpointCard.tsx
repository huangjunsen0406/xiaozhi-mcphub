import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import ConfirmDialog from './ui/ConfirmDialog';
import { Badge } from './ui/Badge';
import { XiaozhiEndpoint, XiaozhiEndpointStatus } from '../hooks/useXiaozhiEndpoints';

interface XiaozhiEndpointCardProps {
  endpoint: XiaozhiEndpoint;
  status?: XiaozhiEndpointStatus;
  isReconnecting?: boolean;
  onEdit: (endpoint: XiaozhiEndpoint) => void;
  onDelete: (endpointId: string) => void;
  onReconnect: (endpointId: string) => void;
  onToggleEnabled: (endpointId: string, enabled: boolean) => void;
}

const XiaozhiEndpointCard: React.FC<XiaozhiEndpointCardProps> = ({
  endpoint,
  status,
  isReconnecting = false,
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

  const getStatusBadge = () => {
    if (!endpoint.enabled) {
      return <Badge variant="secondary">{t('xiaozhi.status.disabled', 'Disabled')}</Badge>;
    }
    
    if (!status) {
      return <Badge variant="secondary">{t('xiaozhi.status.unknown', 'Unknown')}</Badge>;
    }

    if (status.connected) {
      return <Badge variant="default">{t('xiaozhi.status.connected', 'Connected')}</Badge>;
    } else {
      return <Badge variant="destructive">{t('xiaozhi.status.disconnected', 'Disconnected')}</Badge>;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return t('xiaozhi.never', 'Never');
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="p-6 bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-gray-800 dark:border-gray-700">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {endpoint.name}
            </h3>
            {getStatusBadge()}
          </div>
          
          {endpoint.description && (
            <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
              {endpoint.description}
            </p>
          )}

          <div className="space-y-1 text-sm text-gray-500 dark:text-gray-400">
            <p>
              <span className="font-medium">{t('xiaozhi.url', 'WebSocket URL')}:</span>{' '}
              <span className="px-2 py-1 font-mono text-xs bg-gray-100 rounded dark:bg-gray-700">
                {endpoint.webSocketUrl}
              </span>
            </p>
            
            {endpoint.groupId && (
              <p>
                <span className="font-medium">{t('xiaozhi.group', 'Group')}:</span> {endpoint.groupId}
              </p>
            )}
            
            <p>
              <span className="font-medium">{t('xiaozhi.created', 'Created')}:</span>{' '}
              {formatDate(endpoint.createdAt)}
            </p>
            
            <p>
              <span className="font-medium">{t('xiaozhi.lastConnected', 'Last Connected')}:</span>{' '}
              {formatDate(endpoint.lastConnected)}
            </p>

            <div className="text-xs">
              <p>
                <span className="font-medium">{t('xiaozhi.reconnect.maxAttempts', 'Max Attempts')}:</span>{' '}
                {endpoint.reconnect.maxAttempts}
              </p>
              <p>
                <span className="font-medium">{t('xiaozhi.reconnect.initialDelay', 'Initial Delay')}:</span>{' '}
                {endpoint.reconnect.initialDelay}ms
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 ml-4">
          <div className="flex items-center">
            <span className="mr-2 text-sm text-gray-700 dark:text-gray-300">{t('xiaozhi.enabled', 'Enabled')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={endpoint.enabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${endpoint.enabled ? 'bg-blue-200' : 'bg-gray-100'}`}
              onClick={() => onToggleEnabled(endpoint.id, !endpoint.enabled)}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${endpoint.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(endpoint)}
          >
            {t('server.edit', 'Edit')}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => onReconnect(endpoint.id)}
            disabled={!endpoint.enabled || isReconnecting}
          >
            {isReconnecting 
              ? t('xiaozhi.reconnect.connecting', 'Reconnecting...') 
              : t('xiaozhi.reconnect.title', 'Reconnect')
            }
          </Button>
        </div>

        <Button
          variant="destructive"
          size="sm"
          onClick={() => setShowDeleteDialog(true)}
        >
          {t('common.delete', 'Delete')}
        </Button>
      </div>

      <ConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title={t('xiaozhi.delete.title', 'Delete Endpoint')}
        message={t('xiaozhi.delete.message', 'Are you sure you want to delete this endpoint? This action cannot be undone.')}
        confirmText={t('common.delete', 'Delete')}
        cancelText={t('common.cancel', 'Cancel')}
      />
    </div>
  );
};

export default XiaozhiEndpointCard;