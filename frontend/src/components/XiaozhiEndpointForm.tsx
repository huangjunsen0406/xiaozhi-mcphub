import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import { XiaozhiEndpoint, CreateEndpointData, UpdateEndpointData } from '../hooks/useXiaozhiEndpoints';

interface Group {
  id: string;
  name: string;
  description?: string;
}

interface XiaozhiEndpointFormProps {
  endpoint?: XiaozhiEndpoint; // If provided, edit mode; otherwise, create mode
  groups: Group[];
  onSubmit: (data: CreateEndpointData | UpdateEndpointData) => Promise<boolean>;
  onCancel: () => void;
  loading?: boolean;
}

const XiaozhiEndpointForm: React.FC<XiaozhiEndpointFormProps> = ({
  endpoint,
  groups,
  onSubmit,
  onCancel,
  loading = false,
}) => {
  const { t } = useTranslation();
  const isEditMode = !!endpoint;

  const [formData, setFormData] = useState({
    name: endpoint?.name || '',
    webSocketUrl: endpoint?.webSocketUrl || '',
    description: endpoint?.description || '',
    groupId: endpoint?.groupId || '',
    enabled: endpoint?.enabled ?? true,
    useSmartRouting: endpoint?.useSmartRouting ?? false,
    reconnect: {
      maxAttempts: endpoint?.reconnect.maxAttempts || 10,
      initialDelay: endpoint?.reconnect.initialDelay || 2000,
      maxDelay: endpoint?.reconnect.maxDelay || 60000,
      backoffMultiplier: endpoint?.reconnect.backoffMultiplier || 2,
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form when endpoint changes
  useEffect(() => {
    if (endpoint) {
      setFormData({
        name: endpoint.name,
        webSocketUrl: endpoint.webSocketUrl,
        description: endpoint.description || '',
        groupId: endpoint.groupId || '',
        enabled: endpoint.enabled,
        useSmartRouting: endpoint.useSmartRouting ?? false,
        reconnect: endpoint.reconnect,
      });
    }
  }, [endpoint]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('xiaozhi.form.errors.nameRequired', 'Name is required');
    }

    if (!formData.webSocketUrl.trim()) {
      newErrors.webSocketUrl = t('xiaozhi.form.errors.urlRequired', 'WebSocket URL is required');
    } else if (!formData.webSocketUrl.startsWith('ws://') && !formData.webSocketUrl.startsWith('wss://')) {
      newErrors.webSocketUrl = t('xiaozhi.form.errors.urlInvalid', 'WebSocket URL must start with ws:// or wss://');
    }

    if (formData.reconnect.maxAttempts < 1 || formData.reconnect.maxAttempts > 100) {
      newErrors.maxAttempts = t('xiaozhi.form.errors.maxAttemptsRange', 'Max attempts must be between 1 and 100');
    }

    if (formData.reconnect.initialDelay < 100 || formData.reconnect.initialDelay > 60000) {
      newErrors.initialDelay = t('xiaozhi.form.errors.initialDelayRange', 'Initial delay must be between 100ms and 60000ms');
    }

    if (formData.reconnect.maxDelay < formData.reconnect.initialDelay) {
      newErrors.maxDelay = t('xiaozhi.form.errors.maxDelayGreater', 'Max delay must be greater than initial delay');
    }

    if (formData.reconnect.backoffMultiplier < 1 || formData.reconnect.backoffMultiplier > 10) {
      newErrors.backoffMultiplier = t('xiaozhi.form.errors.backoffRange', 'Backoff multiplier must be between 1 and 10');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    const submitData = isEditMode 
      ? {
          ...formData,
          // In edit mode, if WebSocket URL contains masked token, don't include it
          ...(formData.webSocketUrl.includes('token=***') ? { webSocketUrl: undefined } : {}),
        }
      : formData;

    const success = await onSubmit(submitData);
    if (success) {
      if (!isEditMode) {
        // Reset form for create mode
        setFormData({
          name: '',
          webSocketUrl: '',
          description: '',
          groupId: '',
          enabled: true,
          useSmartRouting: false,
          reconnect: {
            maxAttempts: 10,
            initialDelay: 2000,
            maxDelay: 60000,
            backoffMultiplier: 2,
          },
        });
      }
    }
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleReconnectChange = (field: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      reconnect: {
        ...prev.reconnect,
        [field]: value,
      },
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
        {isEditMode 
          ? t('xiaozhi.form.edit.title', 'Edit Endpoint') 
          : t('xiaozhi.form.create.title', 'Create New Endpoint')
        }
      </h3> */}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Basic Information */}
        <div className="space-y-4">
          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.name', 'Name')} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder={t('xiaozhi.form.namePlaceholder', 'Enter endpoint name')}
            />
            {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.url', 'WebSocket URL')} *
            </label>
            <input
              type="url"
              value={formData.webSocketUrl}
              onChange={(e) => handleInputChange('webSocketUrl', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.webSocketUrl ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="wss://api.xiaozhi.me/mcp/?token=..."
            />
            {errors.webSocketUrl && <p className="mt-1 text-sm text-red-600">{errors.webSocketUrl}</p>}
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.description', 'Description')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder={t('xiaozhi.form.descriptionPlaceholder', 'Optional description for this endpoint')}
            />
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.group', 'Group')}
            </label>
            <select
              value={formData.groupId}
              onChange={(e) => handleInputChange('groupId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">{t('xiaozhi.form.noGroup', 'No Group (All Tools)')}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} {group.description && `(${group.description})`}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center">
            <label htmlFor="enabled" className="block mr-3 text-sm text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.enabled', 'Enable this endpoint')}
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={formData.enabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.enabled ? 'bg-blue-200' : 'bg-gray-100'}`}
              onClick={() => handleInputChange('enabled', !formData.enabled)}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

        <div className="flex items-center">
          <label htmlFor="useSmartRouting" className="block mr-3 text-sm text-gray-700 dark:text-gray-300">
            {t('xiaozhi.form.useSmartRouting', 'Use Smart Routing')}
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={formData.useSmartRouting}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${formData.useSmartRouting ? 'bg-blue-200' : 'bg-gray-100'}`}
            onClick={() => handleInputChange('useSmartRouting', !formData.useSmartRouting)}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${formData.useSmartRouting ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>
        </div>

        {/* Reconnection Settings */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900 text-md dark:text-white">
            {t('xiaozhi.form.reconnectSettings', 'Reconnection Settings')}
          </h4>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.maxAttempts', 'Max Attempts')}
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={formData.reconnect.maxAttempts}
              onChange={(e) => handleReconnectChange('maxAttempts', parseInt(e.target.value) || 10)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.maxAttempts ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.maxAttempts && <p className="mt-1 text-sm text-red-600">{errors.maxAttempts}</p>}
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.initialDelay', 'Initial Delay (ms)')}
            </label>
            <input
              type="number"
              min="100"
              max="60000"
              step="100"
              value={formData.reconnect.initialDelay}
              onChange={(e) => handleReconnectChange('initialDelay', parseInt(e.target.value) || 2000)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.initialDelay ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.initialDelay && <p className="mt-1 text-sm text-red-600">{errors.initialDelay}</p>}
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.maxDelay', 'Max Delay (ms)')}
            </label>
            <input
              type="number"
              min="1000"
              max="300000"
              step="1000"
              value={formData.reconnect.maxDelay}
              onChange={(e) => handleReconnectChange('maxDelay', parseInt(e.target.value) || 60000)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.maxDelay ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.maxDelay && <p className="mt-1 text-sm text-red-600">{errors.maxDelay}</p>}
          </div>

          <div>
            <label className="block mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('xiaozhi.form.backoffMultiplier', 'Backoff Multiplier')}
            </label>
            <input
              type="number"
              min="1"
              max="10"
              step="0.1"
              value={formData.reconnect.backoffMultiplier}
              onChange={(e) => handleReconnectChange('backoffMultiplier', parseFloat(e.target.value) || 2)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.backoffMultiplier ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.backoffMultiplier && <p className="mt-1 text-sm text-red-600">{errors.backoffMultiplier}</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-6 space-x-3 border-t border-gray-200 dark:border-gray-700">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={loading}
        >
          {t('common.cancel', 'Cancel')}
        </Button>
        
        <Button
          type="submit"
          disabled={loading}
        >
          {loading 
            ? t('common.saving', 'Saving...') 
            : (isEditMode 
                ? t('common.save', 'Save') 
                : t('common.create', 'Create')
              )
          }
        </Button>
      </div>
    </form>
  );
};

export default XiaozhiEndpointForm;