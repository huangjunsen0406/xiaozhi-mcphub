import React from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import XiaozhiEndpointForm from './XiaozhiEndpointForm';
import {
  XiaozhiEndpoint,
  CreateEndpointData,
  UpdateEndpointData,
} from '../hooks/useXiaozhiEndpoints';

interface Group {
  id: string;
  name: string;
  description?: string;
}

interface XiaozhiEndpointModalProps {
  isOpen: boolean;
  endpoint?: XiaozhiEndpoint; // If provided, edit mode; otherwise, create mode
  groups: Group[];
  onSubmit: (data: CreateEndpointData | UpdateEndpointData) => Promise<boolean>;
  onClose: () => void;
  loading?: boolean;
}

const XiaozhiEndpointModal: React.FC<XiaozhiEndpointModalProps> = ({
  isOpen,
  endpoint,
  groups,
  onSubmit,
  onClose,
  loading = false,
}) => {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const handleSubmit = async (data: CreateEndpointData | UpdateEndpointData) => {
    const success = await onSubmit(data);
    if (success) {
      onClose();
    }
    return success;
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="hub-card p-6 w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-5 flex-shrink-0">
          <h2 className="text-lg font-semibold text-[var(--hub-ink)]">
            {endpoint ? t('xiaozhi.modal.editTitle') : t('xiaozhi.modal.createTitle')}
          </h2>
          <button
            onClick={onClose}
            className="hub-icon-btn"
            aria-label={t('app.closeButton')}
            disabled={loading}
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <XiaozhiEndpointForm
            endpoint={endpoint}
            groups={groups}
            onSubmit={handleSubmit}
            onCancel={onClose}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
};

export default XiaozhiEndpointModal;
