import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import ChangePasswordForm from '@/components/ChangePasswordForm';
import { Switch } from '@/components/ui/ToggleGroup';
import { useSettingsData } from '@/hooks/useSettingsData';
import { useToast } from '@/contexts/ToastContext';
import { generateRandomKey } from '@/utils/key';
import { getApiUrl } from '@/utils/runtime';

const SettingsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);

  // Update current language when it changes
  useEffect(() => {
    setCurrentLanguage(i18n.language);
  }, [i18n.language]);

  const [installConfig, setInstallConfig] = useState<{
    pythonIndexUrl: string;
    npmRegistry: string;
  }>({
    pythonIndexUrl: '',
    npmRegistry: '',
  });

  const [tempSmartRoutingConfig, setTempSmartRoutingConfig] = useState<{
    dbUrl: string;
    openaiApiBaseUrl: string;
    openaiApiKey: string;
    openaiApiEmbeddingModel: string;
  }>({
    dbUrl: '',
    openaiApiBaseUrl: '',
    openaiApiKey: '',
    openaiApiEmbeddingModel: '',
  });

  const {
    routingConfig,
    tempRoutingConfig,
    setTempRoutingConfig,
    installConfig: savedInstallConfig,
    smartRoutingConfig,
    xiaozhiConfig,
    loading,
    updateRoutingConfig,
    updateRoutingConfigBatch,
    updateInstallConfig,
    updateSmartRoutingConfig,
    updateSmartRoutingConfigBatch,
    updateXiaozhiConfig
  } = useSettingsData();

  // Update local installConfig when savedInstallConfig changes
  useEffect(() => {
    if (savedInstallConfig) {
      setInstallConfig(savedInstallConfig);
    }
  }, [savedInstallConfig]);

  // Update local tempSmartRoutingConfig when smartRoutingConfig changes
  useEffect(() => {
    if (smartRoutingConfig) {
      setTempSmartRoutingConfig({
        dbUrl: smartRoutingConfig.dbUrl || '',
        openaiApiBaseUrl: smartRoutingConfig.openaiApiBaseUrl || '',
        openaiApiKey: smartRoutingConfig.openaiApiKey || '',
        openaiApiEmbeddingModel: smartRoutingConfig.openaiApiEmbeddingModel || '',
      });
    }
  }, [smartRoutingConfig]);

  const [sectionsVisible, setSectionsVisible] = useState({
    routingConfig: false,
    installConfig: false,
    smartRoutingConfig: false,
    xiaozhiConfig: false,
    password: false
  });

  const toggleSection = (section: 'routingConfig' | 'installConfig' | 'smartRoutingConfig' | 'xiaozhiConfig' | 'password') => {
    setSectionsVisible(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleRoutingConfigChange = async (key: 'enableGlobalRoute' | 'enableGroupNameRoute' | 'enableBearerAuth' | 'bearerAuthKey' | 'skipAuth', value: boolean | string) => {
    // If enableBearerAuth is turned on and there's no key, generate one first
    if (key === 'enableBearerAuth' && value === true) {
      if (!tempRoutingConfig.bearerAuthKey && !routingConfig.bearerAuthKey) {
        const newKey = generateRandomKey();
        handleBearerAuthKeyChange(newKey);

        // Update both enableBearerAuth and bearerAuthKey in a single call
        const success = await updateRoutingConfigBatch({
          enableBearerAuth: true,
          bearerAuthKey: newKey
        });

        if (success) {
          // Update tempRoutingConfig to reflect the saved values
          setTempRoutingConfig(prev => ({
            ...prev,
            bearerAuthKey: newKey
          }));
        }
        return;
      }
    }

    await updateRoutingConfig(key, value);
  };

  const handleBearerAuthKeyChange = (value: string) => {
    setTempRoutingConfig(prev => ({
      ...prev,
      bearerAuthKey: value
    }));
  };

  const saveBearerAuthKey = async () => {
    await updateRoutingConfig('bearerAuthKey', tempRoutingConfig.bearerAuthKey);
  };

  const handleInstallConfigChange = (key: 'pythonIndexUrl' | 'npmRegistry', value: string) => {
    setInstallConfig({
      ...installConfig,
      [key]: value
    });
  };

  const saveInstallConfig = async (key: 'pythonIndexUrl' | 'npmRegistry') => {
    await updateInstallConfig(key, installConfig[key]);
  };

  const handleSmartRoutingConfigChange = (key: 'dbUrl' | 'openaiApiBaseUrl' | 'openaiApiKey' | 'openaiApiEmbeddingModel', value: string) => {
    setTempSmartRoutingConfig({
      ...tempSmartRoutingConfig,
      [key]: value
    });
  };

  const saveSmartRoutingConfig = async (key: 'dbUrl' | 'openaiApiBaseUrl' | 'openaiApiKey' | 'openaiApiEmbeddingModel') => {
    await updateSmartRoutingConfig(key, tempSmartRoutingConfig[key]);
  };

  const handleSmartRoutingEnabledChange = async (value: boolean) => {
    // If enabling Smart Routing, validate required fields and save any unsaved changes
    if (value) {
      const currentDbUrl = tempSmartRoutingConfig.dbUrl || smartRoutingConfig.dbUrl;
      const currentOpenaiApiKey = tempSmartRoutingConfig.openaiApiKey || smartRoutingConfig.openaiApiKey;

      if (!currentDbUrl || !currentOpenaiApiKey) {
        const missingFields = [];
        if (!currentDbUrl) missingFields.push(t('settings.dbUrl'));
        if (!currentOpenaiApiKey) missingFields.push(t('settings.openaiApiKey'));

        showToast(t('settings.smartRoutingValidationError', {
          fields: missingFields.join(', ')
        }));
        return;
      }

      // Prepare updates object with unsaved changes and enabled status
      const updates: any = { enabled: value };

      // Check for unsaved changes and include them in the batch update
      if (tempSmartRoutingConfig.dbUrl !== smartRoutingConfig.dbUrl) {
        updates.dbUrl = tempSmartRoutingConfig.dbUrl;
      }
      if (tempSmartRoutingConfig.openaiApiBaseUrl !== smartRoutingConfig.openaiApiBaseUrl) {
        updates.openaiApiBaseUrl = tempSmartRoutingConfig.openaiApiBaseUrl;
      }
      if (tempSmartRoutingConfig.openaiApiKey !== smartRoutingConfig.openaiApiKey) {
        updates.openaiApiKey = tempSmartRoutingConfig.openaiApiKey;
      }
      if (tempSmartRoutingConfig.openaiApiEmbeddingModel !== smartRoutingConfig.openaiApiEmbeddingModel) {
        updates.openaiApiEmbeddingModel = tempSmartRoutingConfig.openaiApiEmbeddingModel;
      }

      // Save all changes in a single batch update
      await updateSmartRoutingConfigBatch(updates);
    } else {
      // If disabling, just update the enabled status
      await updateSmartRoutingConfig('enabled', value);
    }
  };

  const handlePasswordChangeSuccess = () => {
    setTimeout(() => {
      navigate('/');
    }, 2000);
  };

  const handleLanguageChange = (lang: string) => {
    localStorage.setItem('i18nextLng', lang);
    window.location.reload();
  };

  // Xiaozhi configuration handlers
  const [tempXiaozhiUrl, setTempXiaozhiUrl] = useState('');

  // Update tempXiaozhiUrl when xiaozhiConfig changes
  useEffect(() => {
    if (xiaozhiConfig) {
      setTempXiaozhiUrl(xiaozhiConfig.webSocketUrl);
    }
  }, [xiaozhiConfig]);

  const handleXiaozhiEnabledChange = async (value: boolean) => {
    if (value) {
      // 如果要启用，先检查是否有URL配置
      const hasUrl = tempXiaozhiUrl.trim() || xiaozhiConfig.webSocketUrl.trim();
      if (!hasUrl) {
        showToast(t('settings.xiaozhiValidationError'));
        return;
      }
      
      // 如果输入框有未保存的内容，先保存
      if (tempXiaozhiUrl.trim() && tempXiaozhiUrl !== xiaozhiConfig.webSocketUrl) {
        const urlSaved = await updateXiaozhiConfig('webSocketUrl', tempXiaozhiUrl);
        if (!urlSaved) {
          return; // 如果URL保存失败，不继续启用
        }
      }
    }

    await updateXiaozhiConfig('enabled', value);
  };

  const handleXiaozhiUrlChange = (value: string) => {
    setTempXiaozhiUrl(value);
  };

  /**
   * 检查URL格式是否有效
   */
  const isValidUrl = (url: string): boolean => {
    if (!url.trim()) return true; // 空URL视为有效（未填写状态）
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const saveXiaozhiUrl = async () => {
    // 直接保存用户输入的URL，不做修改
    const success = await updateXiaozhiConfig('webSocketUrl', tempXiaozhiUrl);
    
    // 如果保存成功且小智客户端已启用，则重启连接以使用新URL
    if (success && xiaozhiConfig.enabled) {
      try {
        const token = localStorage.getItem('mcphub_token');
        await fetch(getApiUrl('/xiaozhi/restart'), {
          method: 'POST',
          headers: {
            'x-auth-token': token || '',
          },
        });
        showToast(t('settings.xiaozhiReconnected'));
      } catch (error) {
        console.error('重启小智客户端失败:', error);
        showToast(t('settings.xiaozhiReconnectFailed'));
      }
    }
  };

  return (
    <div className="container mx-auto">
      <h1 className="mb-8 text-2xl font-bold text-gray-900">{t('pages.settings.title')}</h1>

      {/* Language Settings */}
      <div className="px-6 py-4 mb-6 bg-white rounded-lg shadow page-card">
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-gray-800">{t('pages.settings.language')}</h2>
          <div className="flex space-x-3">
            <button
              className={`px-3 py-1.5 rounded-md transition-all duration-200 text-sm ${currentLanguage.startsWith('en')
                ? 'bg-blue-500 text-white btn-primary'
                : 'bg-blue-100 text-blue-800 hover:bg-blue-200 btn-secondary'
                }`}
              onClick={() => handleLanguageChange('en')}
            >
              English
            </button>
            <button
              className={`px-3 py-1.5 rounded-md transition-all duration-200 text-sm ${currentLanguage.startsWith('zh')
                ? 'bg-blue-500 text-white btn-primary'
                : 'bg-blue-100 text-blue-800 hover:bg-blue-200 btn-secondary'
                }`}
              onClick={() => handleLanguageChange('zh')}
            >
              中文
            </button>
          </div>
        </div>
      </div>

      {/* Smart Routing Configuration Settings */}
      <div className="px-6 py-4 mb-6 bg-white rounded-lg shadow page-card">
        <div
          className="flex justify-between items-center transition-colors duration-200 cursor-pointer hover:text-blue-600"
          onClick={() => toggleSection('smartRoutingConfig')}
        >
          <h2 className="font-semibold text-gray-800">{t('pages.settings.smartRouting')}</h2>
          <span className="text-gray-500 transition-transform duration-200">
            {sectionsVisible.smartRoutingConfig ? '▼' : '►'}
          </span>
        </div>

        {sectionsVisible.smartRoutingConfig && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
              <div>
                <h3 className="font-medium text-gray-700">{t('settings.enableSmartRouting')}</h3>
                <p className="text-sm text-gray-500">{t('settings.enableSmartRoutingDescription')}</p>
              </div>
              <Switch
                disabled={loading}
                checked={smartRoutingConfig.enabled}
                onCheckedChange={(checked) => handleSmartRoutingEnabledChange(checked)}
              />
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium text-gray-700">
                  <span className="px-1 text-red-500">*</span>{t('settings.dbUrl')}
                </h3>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={tempSmartRoutingConfig.dbUrl}
                  onChange={(e) => handleSmartRoutingConfigChange('dbUrl', e.target.value)}
                  placeholder={t('settings.dbUrlPlaceholder')}
                  className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm form-input"
                  disabled={loading}
                />
                <button
                  onClick={() => saveSmartRoutingConfig('dbUrl')}
                  disabled={loading}
                  className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium text-gray-700">
                  <span className="px-1 text-red-500">*</span>{t('settings.openaiApiKey')}
                </h3>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="password"
                  value={tempSmartRoutingConfig.openaiApiKey}
                  onChange={(e) => handleSmartRoutingConfigChange('openaiApiKey', e.target.value)}
                  placeholder={t('settings.openaiApiKeyPlaceholder')}
                  className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  disabled={loading}
                />
                <button
                  onClick={() => saveSmartRoutingConfig('openaiApiKey')}
                  disabled={loading}
                  className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium text-gray-700">{t('settings.openaiApiBaseUrl')}</h3>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={tempSmartRoutingConfig.openaiApiBaseUrl}
                  onChange={(e) => handleSmartRoutingConfigChange('openaiApiBaseUrl', e.target.value)}
                  placeholder={t('settings.openaiApiBaseUrlPlaceholder')}
                  className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm form-input"
                  disabled={loading}
                />
                <button
                  onClick={() => saveSmartRoutingConfig('openaiApiBaseUrl')}
                  disabled={loading}
                  className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium text-gray-700">{t('settings.openaiApiEmbeddingModel')}</h3>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={tempSmartRoutingConfig.openaiApiEmbeddingModel}
                  onChange={(e) => handleSmartRoutingConfigChange('openaiApiEmbeddingModel', e.target.value)}
                  placeholder={t('settings.openaiApiEmbeddingModelPlaceholder')}
                  className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm form-input"
                  disabled={loading}
                />
                <button
                  onClick={() => saveSmartRoutingConfig('openaiApiEmbeddingModel')}
                  disabled={loading}
                  className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Xiaozhi Configuration Settings */}
      <div className="px-6 py-4 mb-6 bg-white rounded-lg shadow page-card">
        <div
          className="flex justify-between items-center transition-colors duration-200 cursor-pointer hover:text-blue-600"
          onClick={() => toggleSection('xiaozhiConfig')}
        >
          <h2 className="font-semibold text-gray-800">{t('pages.settings.xiaozhiConfig')}</h2>
          <span className="text-gray-500 transition-transform duration-200">
            {sectionsVisible.xiaozhiConfig ? '▼' : '►'}
          </span>
        </div>

        {sectionsVisible.xiaozhiConfig && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
              <div>
                <h3 className="font-medium text-gray-700">{t('settings.enableXiaozhiClient')}</h3>
                <p className="text-sm text-gray-500">{t('settings.enableXiaozhiClientDescription')}</p>
              </div>
              <Switch
                disabled={loading}
                checked={xiaozhiConfig.enabled}
                onCheckedChange={(checked) => handleXiaozhiEnabledChange(checked)}
              />
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium text-gray-700">
                  <span className="px-1 text-red-500">*</span>{t('settings.xiaozhiWebSocketUrl')}
                </h3>
                <p className="text-sm text-gray-500">{t('settings.xiaozhiWebSocketUrlDescription')}</p>
              </div>
              <div className="space-y-2">
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={tempXiaozhiUrl}
                    onChange={(e) => handleXiaozhiUrlChange(e.target.value)}
                    placeholder={t('settings.xiaozhiWebSocketUrlPlaceholder')}
                    className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm form-input"
                    disabled={loading}
                  />
                  <button
                    onClick={saveXiaozhiUrl}
                    disabled={loading}
                    className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                  >
                    {t('common.save')}
                  </button>
                </div>
                {tempXiaozhiUrl.trim() && !isValidUrl(tempXiaozhiUrl) && (
                  <div className="text-xs text-red-600">
                    ⚠️ URL格式不正确
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  支持的URL格式示例:
                  <br />• wss://api.xiaozhi.me/mcp?token=... (官方)
                  <br />• wss://your-domain.com/mcp_endpoint/mcp?token=... (自部署)
                  <br />• 填什么就用什么，不会自动修改您的输入
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Route Configuration Settings */}
      <div className="px-6 py-4 mb-6 bg-white rounded-lg shadow">
        <div
          className="flex justify-between items-center cursor-pointer"
          onClick={() => toggleSection('routingConfig')}
        >
          <h2 className="font-semibold text-gray-800">{t('pages.settings.routeConfig')}</h2>
          <span className="text-gray-500">
            {sectionsVisible.routingConfig ? '▼' : '►'}
          </span>
        </div>

        {sectionsVisible.routingConfig && (
          <div className="mt-4 space-y-4">
            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
              <div>
                <h3 className="font-medium text-gray-700">{t('settings.enableBearerAuth')}</h3>
                <p className="text-sm text-gray-500">{t('settings.enableBearerAuthDescription')}</p>
              </div>
              <Switch
                disabled={loading}
                checked={routingConfig.enableBearerAuth}
                onCheckedChange={(checked) => handleRoutingConfigChange('enableBearerAuth', checked)}
              />
            </div>

            {routingConfig.enableBearerAuth && (
              <div className="p-3 bg-gray-50 rounded-md">
                <div className="mb-2">
                  <h3 className="font-medium text-gray-700">{t('settings.bearerAuthKey')}</h3>
                  <p className="text-sm text-gray-500">{t('settings.bearerAuthKeyDescription')}</p>
                </div>
                <div className="flex gap-3 items-center">
                  <input
                    type="text"
                    value={tempRoutingConfig.bearerAuthKey}
                    onChange={(e) => handleBearerAuthKeyChange(e.target.value)}
                    placeholder={t('settings.bearerAuthKeyPlaceholder')}
                    className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm form-input"
                    disabled={loading || !routingConfig.enableBearerAuth}
                  />
                  <button
                    onClick={saveBearerAuthKey}
                    disabled={loading || !routingConfig.enableBearerAuth}
                    className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                  >
                    {t('common.save')}
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
              <div>
                <h3 className="font-medium text-gray-700">{t('settings.enableGlobalRoute')}</h3>
                <p className="text-sm text-gray-500">{t('settings.enableGlobalRouteDescription')}</p>
              </div>
              <Switch
                disabled={loading}
                checked={routingConfig.enableGlobalRoute}
                onCheckedChange={(checked) => handleRoutingConfigChange('enableGlobalRoute', checked)}
              />
            </div>

            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
              <div>
                <h3 className="font-medium text-gray-700">{t('settings.enableGroupNameRoute')}</h3>
                <p className="text-sm text-gray-500">{t('settings.enableGroupNameRouteDescription')}</p>
              </div>
              <Switch
                disabled={loading}
                checked={routingConfig.enableGroupNameRoute}
                onCheckedChange={(checked) => handleRoutingConfigChange('enableGroupNameRoute', checked)}
              />
            </div>

            <div className="flex justify-between items-center p-3 bg-gray-50 rounded-md">
              <div>
                <h3 className="font-medium text-gray-700">{t('settings.skipAuth')}</h3>
                <p className="text-sm text-gray-500">{t('settings.skipAuthDescription')}</p>
              </div>
              <Switch
                disabled={loading}
                checked={routingConfig.skipAuth}
                onCheckedChange={(checked) => handleRoutingConfigChange('skipAuth', checked)}
              />
            </div>

          </div>
        )}
      </div>

      {/* Installation Configuration Settings */}
      <div className="px-6 py-4 mb-6 bg-white rounded-lg shadow">
        <div
          className="flex justify-between items-center cursor-pointer"
          onClick={() => toggleSection('installConfig')}
        >
          <h2 className="font-semibold text-gray-800">{t('settings.installConfig')}</h2>
          <span className="text-gray-500">
            {sectionsVisible.installConfig ? '▼' : '►'}
          </span>
        </div>

        {sectionsVisible.installConfig && (
          <div className="mt-4 space-y-4">
            <div className="p-3 bg-gray-50 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium text-gray-700">{t('settings.pythonIndexUrl')}</h3>
                <p className="text-sm text-gray-500">{t('settings.pythonIndexUrlDescription')}</p>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={installConfig.pythonIndexUrl}
                  onChange={(e) => handleInstallConfigChange('pythonIndexUrl', e.target.value)}
                  placeholder={t('settings.pythonIndexUrlPlaceholder')}
                  className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm form-input"
                  disabled={loading}
                />
                <button
                  onClick={() => saveInstallConfig('pythonIndexUrl')}
                  disabled={loading}
                  className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <div className="mb-2">
                <h3 className="font-medium text-gray-700">{t('settings.npmRegistry')}</h3>
                <p className="text-sm text-gray-500">{t('settings.npmRegistryDescription')}</p>
              </div>
              <div className="flex gap-3 items-center">
                <input
                  type="text"
                  value={installConfig.npmRegistry}
                  onChange={(e) => handleInstallConfigChange('npmRegistry', e.target.value)}
                  placeholder={t('settings.npmRegistryPlaceholder')}
                  className="block flex-1 px-3 py-2 mt-1 w-full rounded-md border border-gray-300 shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm form-input"
                  disabled={loading}
                />
                <button
                  onClick={() => saveInstallConfig('npmRegistry')}
                  disabled={loading}
                  className="px-4 py-2 mt-1 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 btn-primary"
                >
                  {t('common.save')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Change Password */}
      <div className="px-6 py-4 mb-6 bg-white rounded-lg shadow">
        <div
          className="flex justify-between items-center cursor-pointer"
          onClick={() => toggleSection('password')}
        >
          <h2 className="font-semibold text-gray-800">{t('auth.changePassword')}</h2>
          <span className="text-gray-500">
            {sectionsVisible.password ? '▼' : '►'}
          </span>
        </div>

        {sectionsVisible.password && (
          <div className="mt-4 max-w-lg">
            <ChangePasswordForm onSuccess={handlePasswordChangeSuccess} />
          </div>
        )}
      </div>
    </div >
  );
};

export default SettingsPage;