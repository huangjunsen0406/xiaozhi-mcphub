// Predefined permission constants
export const PERMISSIONS = {
  // Settings page permissions
  SETTINGS_SMART_ROUTING: 'settings:smart_routing',
  // Per-user integrations: MCPRouter / ModelScope (and similar personal API keys)
  SETTINGS_USER_INTEGRATIONS: 'settings:user_integrations',
  SETTINGS_ROUTE_CONFIG: 'settings:route_config',
  SETTINGS_INSTALL_CONFIG: 'settings:install_config',
  SETTINGS_SYSTEM_CONFIG: 'settings:system_config',
  SETTINGS_OAUTH_SERVER: 'settings:oauth_server',
  SETTINGS_EXPORT_CONFIG: 'settings:export_config',
} as const;

export default PERMISSIONS;
