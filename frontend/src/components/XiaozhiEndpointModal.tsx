import React from 'react';
import { useTranslation } from 'react-i18next';
import XiaozhiEndpointForm from './XiaozhiEndpointForm';
import { XiaozhiEndpoint, CreateEndpointData, UpdateEndpointData } from '../hooks/useXiaozhiEndpoints';

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
    <div className="flex fixed inset-0 z-50 justify-center items-center p-4 bg-black/50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="flex-shrink-0 p-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-800 dark:text-white">
              {endpoint 
                ? t('xiaozhi.modal.editTitle', 'Edit Endpoint') 
                : t('xiaozhi.modal.createTitle', 'Create New Endpoint')
              }
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
              disabled={loading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-6">
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