import dotenv from 'dotenv';
import fs from 'fs';
import { McpSettings, IUser } from '../types/index.js';
import { getConfigFilePath } from '../utils/path.js';
import { getCachedSystemConfig, isDatabaseModeEnabled } from '../utils/systemConfigCache.js';
import { getPackageVersion } from '../utils/version.js';
import { getDataService } from '../services/services.js';
import { DataService } from '../services/dataService.js';
import { cloneDefaultOAuthServerConfig } from '../constants/oauthServerDefaults.js';

dotenv.config();

const defaultConfig = {
  port: process.env.PORT || 3000,
  initTimeout: process.env.INIT_TIMEOUT || 300000,
  basePath: process.env.BASE_PATH || '',
  readonly: 'true' === process.env.READONLY || false,
  mcpHubName: 'mcphub',
  mcpHubVersion: getPackageVersion(),
};

const dataService: DataService = getDataService();

export const isWebDisabled = (): boolean => process.env.DISABLE_WEB === 'true';

const ensureOAuthServerDefaults = (settings: McpSettings): boolean => {
  if (!settings.systemConfig) {
    settings.systemConfig = {
      oauthServer: cloneDefaultOAuthServerConfig(),
    };
    return true;
  }

  if (!settings.systemConfig.oauthServer) {
    settings.systemConfig.oauthServer = cloneDefaultOAuthServerConfig();
    return true;
  }

  return false;
};

// Settings cache
let settingsCache: McpSettings | null = null;
// mtime of the settings file our cache snapshot was read from. The file is
// re-read when it changes, mirroring JsonFileBaseDao so system settings do
// not behave differently from server definitions on external edits.
let lastModified = 0;
// In-process writes can share the same filesystem mtime, so a generation
// counter invalidates every cached snapshot even when timestamps collide.
let settingsGeneration = 0;
export const getSettingsGeneration = (): number => settingsGeneration;

export const getSettingsPath = (): string => {
  return getConfigFilePath('mcp_settings.json', 'Settings');
};

export const loadOriginalSettings = (): McpSettings => {
  // If cache exists and the file hasn't changed, return cached data directly.
  if (settingsCache) {
    try {
      const stats = fs.statSync(getSettingsPath());
      if (lastModified === stats.mtimeMs) {
        return settingsCache;
      }
    } catch {
      // Missing or unreadable file — keep serving the cached snapshot.
      return settingsCache;
    }
  }

  const settingsPath = getSettingsPath();
  // check if file exists
  if (!fs.existsSync(settingsPath)) {
    console.warn(`Settings file not found at ${settingsPath}, using default settings.`);
    const defaultSettings: McpSettings = { mcpServers: {}, users: [] };
    ensureOAuthServerDefaults(defaultSettings);
    // Cache default settings
    settingsCache = defaultSettings;
    lastModified = Date.now();
    return defaultSettings;
  }

  try {
    // Read and parse settings file
    const settingsData = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(settingsData);
    const initialized = ensureOAuthServerDefaults(settings);
    if (initialized) {
      try {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
        clearSettingsCache();
      } catch (writeError) {
        console.error('Failed to persist default OAuth server configuration', {
          writeError,
          settingsPath,
        });
      }
    }

    // Update cache
    settingsCache = settings;
    try {
      lastModified = fs.statSync(settingsPath).mtimeMs;
    } catch {
      lastModified = Date.now();
    }

    console.log(`Loaded settings from ${settingsPath}`);
    return settings;
  } catch (error) {
    throw new Error(`Failed to load settings from ${settingsPath}: ${error}`);
  }
};

export const loadSettings = (user?: IUser): McpSettings => {
  return dataService.filterSettings!(loadOriginalSettings(), user);
};

export const saveSettings = (settings: McpSettings, user?: IUser): boolean => {
  const settingsPath = getSettingsPath();
  try {
    const mergedSettings = dataService.mergeSettings!(loadOriginalSettings(), settings, user);
    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf8');

    // Invalidate every DAO snapshot, including writes in the same mtime tick.
    clearSettingsCache();
    settingsCache = mergedSettings;
    lastModified = fs.statSync(settingsPath).mtimeMs;

    return true;
  } catch (error) {
    console.error('Failed to save settings', { settingsPath, error });
    return false;
  }
};

/**
 * Clear settings cache, force next loadSettings call to re-read from file
 */
export const clearSettingsCache = (): void => {
  settingsGeneration += 1;
  settingsCache = null;
  lastModified = 0;
};

/**
 * Get current cache status (for debugging)
 */
export const getSettingsCacheInfo = (): { hasCache: boolean } => {
  return {
    hasCache: settingsCache !== null,
  };
};

export function replaceEnvVars(
  input: Record<string, any>,
  envSource?: Record<string, string | undefined>,
): Record<string, any>;
export function replaceEnvVars(
  input: string[] | undefined,
  envSource?: Record<string, string | undefined>,
): string[];
export function replaceEnvVars(
  input: string,
  envSource?: Record<string, string | undefined>,
): string;
export function replaceEnvVars(
  input: Record<string, any> | string[] | string | undefined,
  envSource: Record<string, string | undefined> = process.env,
): Record<string, any> | string[] | string {
  // Handle object input - recursively expand all nested values
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const res: Record<string, any> = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        res[key] = expandEnvVars(value, envSource);
      } else if (typeof value === 'object' && value !== null) {
        // Recursively handle nested objects and arrays
        res[key] = replaceEnvVars(value as any, envSource);
      } else {
        // Preserve non-string, non-object values (numbers, booleans, etc.)
        res[key] = value;
      }
    }
    return res;
  }

  // Handle array input - recursively expand all elements
  if (Array.isArray(input)) {
    return input.map((item) => {
      if (typeof item === 'string') {
        return expandEnvVars(item, envSource);
      } else if (typeof item === 'object' && item !== null) {
        return replaceEnvVars(item as any, envSource);
      }
      return item;
    });
  }

  // Handle string input
  if (typeof input === 'string') {
    return expandEnvVars(input, envSource);
  }

  // Handle undefined/null array input
  if (input === undefined || input === null) {
    return [];
  }

  return input;
}

/**
 * Expand environment variable references and trim leading/trailing whitespace.
 * Trimming here prevents hard-to-diagnose API failures caused by accidental
 * whitespace in values at the beginning or end of the string.
 */
export const expandEnvVars = (
  value: string,
  envSource: Record<string, string | undefined> = process.env,
): string => {
  if (typeof value !== 'string') {
    return String(value);
  }
  // Replace ${VAR} format
  let result = value.replace(/\$\{([^}]+)\}/g, (_, key) => envSource[key] || '');
  // Also replace $VAR format (common on Unix-like systems)
  result = result.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => envSource[key] || '');
  return result.trim();
};

export default defaultConfig;

export function getNameSeparator(): string {
  const cachedSystemConfig = getCachedSystemConfig();
  if (cachedSystemConfig?.nameSeparator) {
    return cachedSystemConfig.nameSeparator;
  }

  if (isDatabaseModeEnabled()) {
    return '-';
  }

  const settings = loadSettings();
  return settings.systemConfig?.nameSeparator || '-';
}
