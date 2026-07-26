import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
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

interface XiaozhiEndpointFormProps {
  endpoint?: XiaozhiEndpoint; // If provided, edit mode; otherwise, create mode
  groups: Group[];
  onSubmit: (data: CreateEndpointData | UpdateEndpointData) => Promise<boolean>;
  onCancel: () => void;
  loading?: boolean;
}

const LABEL_CLASS = 'block text-sm font-medium mb-1.5 text-[var(--hub-ink-2)]';

const FieldError: React.FC<{ message?: string }> = ({ message }) =>
  message ? <p className="mt-1 text-sm text-red-600">{message}</p> : null;

const Toggle: React.FC<{
  checked: boolean;
  label: string;
  onChange: () => void;
}> = ({ checked, label, onChange }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm text-[var(--hub-ink-2)]">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`hub-switch flex-shrink-0${checked ? ' on' : ''}`}
      onClick={onChange}
    />
  </div>
);

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
      newErrors.name = t('xiaozhi.form.errors.nameRequired');
    }

    if (!formData.webSocketUrl.trim()) {
      newErrors.webSocketUrl = t('xiaozhi.form.errors.urlRequired');
    } else if (
      !formData.webSocketUrl.startsWith('ws://') &&
      !formData.webSocketUrl.startsWith('wss://')
    ) {
      newErrors.webSocketUrl = t('xiaozhi.form.errors.urlInvalid');
    }

    if (formData.reconnect.maxAttempts < 1 || formData.reconnect.maxAttempts > 100) {
      newErrors.maxAttempts = t('xiaozhi.form.errors.maxAttemptsRange');
    }

    if (formData.reconnect.initialDelay < 100 || formData.reconnect.initialDelay > 60000) {
      newErrors.initialDelay = t('xiaozhi.form.errors.initialDelayRange');
    }

    if (formData.reconnect.maxDelay < formData.reconnect.initialDelay) {
      newErrors.maxDelay = t('xiaozhi.form.errors.maxDelayGreater');
    }

    if (formData.reconnect.backoffMultiplier < 1 || formData.reconnect.backoffMultiplier > 10) {
      newErrors.backoffMultiplier = t('xiaozhi.form.errors.backoffRange');
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
    if (success && !isEditMode) {
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
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const handleReconnectChange = (field: string, value: number) => {
    setFormData((prev) => ({
      ...prev,
      reconnect: {
        ...prev.reconnect,
        [field]: value,
      },
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: '',
      }));
    }
  };

  const inputClass = (hasError?: string) =>
    `w-full py-2 px-3 form-input${hasError ? ' border-red-500' : ''}`;

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {/* Basic Information */}
        <div className="space-y-4">
          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-name">
              {t('xiaozhi.form.name')} *
            </label>
            <input
              type="text"
              id="xiaozhi-name"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              className={inputClass(errors.name)}
              placeholder={t('xiaozhi.form.namePlaceholder')}
            />
            <FieldError message={errors.name} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-url">
              {t('xiaozhi.form.url')} *
            </label>
            <input
              type="url"
              id="xiaozhi-url"
              value={formData.webSocketUrl}
              onChange={(e) => handleInputChange('webSocketUrl', e.target.value)}
              className={`${inputClass(errors.webSocketUrl)} hub-mono text-[12.5px]`}
              placeholder="wss://api.xiaozhi.me/mcp/?token=..."
            />
            <FieldError message={errors.webSocketUrl} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-description">
              {t('xiaozhi.form.description')}
            </label>
            <textarea
              id="xiaozhi-description"
              value={formData.description}
              onChange={(e) => handleInputChange('description', e.target.value)}
              rows={3}
              className={inputClass()}
              placeholder={t('xiaozhi.form.descriptionPlaceholder')}
            />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-group">
              {t('xiaozhi.form.group')}
            </label>
            <select
              id="xiaozhi-group"
              value={formData.groupId}
              onChange={(e) => handleInputChange('groupId', e.target.value)}
              className={inputClass()}
            >
              <option value="">{t('xiaozhi.form.noGroup')}</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name} {group.description && `(${group.description})`}
                </option>
              ))}
            </select>
          </div>

          <div
            className="space-y-3 pt-1"
            style={{ borderTop: '1px solid var(--hub-line-2)', paddingTop: 12 }}
          >
            <Toggle
              checked={formData.enabled}
              label={t('xiaozhi.form.enabled')}
              onChange={() => handleInputChange('enabled', !formData.enabled)}
            />
            <Toggle
              checked={formData.useSmartRouting}
              label={t('xiaozhi.form.useSmartRouting')}
              onChange={() => handleInputChange('useSmartRouting', !formData.useSmartRouting)}
            />
          </div>
        </div>

        {/* Reconnection Settings */}
        <div className="space-y-4">
          <h4 className="hub-card-title" style={{ fontSize: 13.5 }}>
            {t('xiaozhi.form.reconnectSettings')}
          </h4>

          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-max-attempts">
              {t('xiaozhi.form.maxAttempts')}
            </label>
            <input
              type="number"
              id="xiaozhi-max-attempts"
              min="1"
              max="100"
              value={formData.reconnect.maxAttempts}
              onChange={(e) => handleReconnectChange('maxAttempts', parseInt(e.target.value) || 10)}
              className={inputClass(errors.maxAttempts)}
            />
            <FieldError message={errors.maxAttempts} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-initial-delay">
              {t('xiaozhi.form.initialDelay')}
            </label>
            <input
              type="number"
              id="xiaozhi-initial-delay"
              min="100"
              max="60000"
              step="100"
              value={formData.reconnect.initialDelay}
              onChange={(e) =>
                handleReconnectChange('initialDelay', parseInt(e.target.value) || 2000)
              }
              className={inputClass(errors.initialDelay)}
            />
            <FieldError message={errors.initialDelay} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-max-delay">
              {t('xiaozhi.form.maxDelay')}
            </label>
            <input
              type="number"
              id="xiaozhi-max-delay"
              min="1000"
              max="300000"
              step="1000"
              value={formData.reconnect.maxDelay}
              onChange={(e) => handleReconnectChange('maxDelay', parseInt(e.target.value) || 60000)}
              className={inputClass(errors.maxDelay)}
            />
            <FieldError message={errors.maxDelay} />
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="xiaozhi-backoff">
              {t('xiaozhi.form.backoffMultiplier')}
            </label>
            <input
              type="number"
              id="xiaozhi-backoff"
              min="1"
              max="10"
              step="0.1"
              value={formData.reconnect.backoffMultiplier}
              onChange={(e) =>
                handleReconnectChange('backoffMultiplier', parseFloat(e.target.value) || 2)
              }
              className={inputClass(errors.backoffMultiplier)}
            />
            <FieldError message={errors.backoffMultiplier} />
          </div>
        </div>
      </div>

      <div
        className="flex justify-end gap-2 mt-6 pt-4"
        style={{ borderTop: '1px solid var(--hub-line-2)' }}
      >
        <button type="button" className="hub-btn" onClick={onCancel} disabled={loading}>
          {t('common.cancel')}
        </button>
        <button type="submit" className="hub-btn primary" disabled={loading}>
          {loading ? t('common.saving') : isEditMode ? t('common.save') : t('common.create')}
        </button>
      </div>
    </form>
  );
};

export default XiaozhiEndpointForm;
