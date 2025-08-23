import dotenv from 'dotenv';
import fs from 'fs';
import { McpSettings, IUser } from '../types/index.js';
import { getConfigFilePath } from '../utils/path.js';
import { getPackageVersion } from '../utils/version.js';
import { getDataService } from '../services/services.js';
import { DataService } from '../services/dataService.js';
import { getAppDataSource } from '../db/connection.js';
import { User } from '../db/entities/User.js';
import { McpServer } from '../db/entities/McpServer.js';

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

// Settings cache
let settingsCache: McpSettings | null = null;

export const getSettingsPath = (): string => {
  return getConfigFilePath('mcp_settings.json', 'Settings');
};

/**
 * Load settings from database
 */
export const loadOriginalSettingsFromDB = async (): Promise<McpSettings> => {
  try {
    const dataSource = getAppDataSource();
    
    if (!dataSource.isInitialized) {
      console.warn('Database not initialized, returning empty settings');
      return { mcpServers: {}, users: [] };
    }

    // Load users from database
    const userRepository = dataSource.getRepository(User);
    const users = await userRepository.find();
    
    // Load MCP servers from database
    const mcpServerRepository = dataSource.getRepository(McpServer);
    const servers = await mcpServerRepository.find();
    
    // Convert to McpSettings format
    const mcpServers: any = {};
    for (const server of servers) {
      mcpServers[server.name] = {
        command: server.command,
        args: server.args,
        env: server.env,
        type: server.type,
        url: server.url,
        headers: server.headers,
        enabled: server.enabled,
        owner: server.owner,
        keepAliveInterval: server.keepAliveInterval,
        tools: server.tools,
        prompts: server.prompts,
        options: server.options,
        openapi: server.openapi,
      };
    }
    
    const settings: McpSettings = {
      mcpServers,
      users: users.map(u => ({
        username: u.username,
        password: u.password,
        isAdmin: u.isAdmin
      }))
    };
    
    return settings;
  } catch (error) {
    console.error('Failed to load settings from database:', error);
    return { mcpServers: {}, users: [] };
  }
};

/**
 * Load settings from file (fallback for backward compatibility)
 * Will attempt to migrate file data to database on first read
 */
export const loadOriginalSettings = (): McpSettings => {
  // If cache exists, return cached data directly
  if (settingsCache) {
    return settingsCache;
  }

  // Try to load from database synchronously (using cached data if available)
  // Note: This is a temporary solution for backward compatibility
  // In production, you should use async/await throughout
  const settingsPath = getSettingsPath();
  try {
    const settingsData = fs.readFileSync(settingsPath, 'utf8');
    const settings = JSON.parse(settingsData);

    // Update cache
    settingsCache = settings;

    // Asynchronously migrate to database if needed
    migrateSettingsToDB(settings).catch(err => 
      console.error('Failed to migrate settings to database:', err)
    );

    console.log(`Loaded settings from ${settingsPath}`);
    return settings;
  } catch (error) {
    console.error(`Failed to load settings from ${settingsPath}:`, error);
    const defaultSettings = { mcpServers: {}, users: [] };

    // Cache default settings
    settingsCache = defaultSettings;

    return defaultSettings;
  }
};

/**
 * Migrate settings from file to database
 */
async function migrateSettingsToDB(settings: McpSettings): Promise<void> {
  try {
    const dataSource = getAppDataSource();
    
    if (!dataSource.isInitialized) {
      console.warn('Database not initialized, skipping migration');
      return;
    }

    const userRepository = dataSource.getRepository(User);
    const mcpServerRepository = dataSource.getRepository(McpServer);

    // Migrate users
    if (settings.users && settings.users.length > 0) {
      for (const userData of settings.users) {
        const existingUser = await userRepository.findOne({ 
          where: { username: userData.username } 
        });
        
        if (!existingUser) {
          const user = userRepository.create({
            username: userData.username,
            password: userData.password,
            isAdmin: userData.isAdmin ?? false
          });
          await userRepository.save(user);
          console.log(`Migrated user: ${userData.username}`);
        }
      }
    }

    // Migrate MCP servers
    if (settings.mcpServers) {
      for (const [name, serverData] of Object.entries(settings.mcpServers)) {
        const existingServer = await mcpServerRepository.findOne({ 
          where: { name } 
        });
        
        if (!existingServer) {
          const server = mcpServerRepository.create({
            name,
            ...serverData
          });
          await mcpServerRepository.save(server);
          console.log(`Migrated MCP server: ${name}`);
        }
      }
    }

    console.log('Settings migration to database completed');
  } catch (error) {
    console.error('Error during settings migration:', error);
  }
}

export const loadSettings = (user?: IUser): McpSettings => {
  return dataService.filterSettings!(loadOriginalSettings(), user);
};

/**
 * Save settings to database
 */
export const saveSettingsToDB = async (settings: McpSettings, user?: IUser): Promise<boolean> => {
  try {
    const dataSource = getAppDataSource();
    
    if (!dataSource.isInitialized) {
      console.error('Database not initialized');
      return false;
    }

    const mergedSettings = dataService.mergeSettings!(await loadOriginalSettingsFromDB(), settings, user);
    
    const userRepository = dataSource.getRepository(User);
    const mcpServerRepository = dataSource.getRepository(McpServer);

    // Update users
    if (mergedSettings.users) {
      for (const userData of mergedSettings.users) {
        let user = await userRepository.findOne({ 
          where: { username: userData.username } 
        });
        
        if (user) {
          user.password = userData.password;
          user.isAdmin = userData.isAdmin ?? false;
          await userRepository.save(user);
        } else {
          user = userRepository.create({
            username: userData.username,
            password: userData.password,
            isAdmin: userData.isAdmin ?? false
          });
          await userRepository.save(user);
        }
      }
    }

    // Update MCP servers
    if (mergedSettings.mcpServers) {
      for (const [name, serverData] of Object.entries(mergedSettings.mcpServers)) {
        let server = await mcpServerRepository.findOne({ 
          where: { name } 
        });
        
        if (server) {
          Object.assign(server, serverData);
          await mcpServerRepository.save(server);
        } else {
          server = mcpServerRepository.create({
            name,
            ...serverData
          });
          await mcpServerRepository.save(server);
        }
      }
    }

    // Update cache
    settingsCache = mergedSettings;

    return true;
  } catch (error) {
    console.error('Failed to save settings to database:', error);
    return false;
  }
};

/**
 * Save settings (backward compatibility - saves to file and DB)
 */
export const saveSettings = (settings: McpSettings, user?: IUser): boolean => {
  const settingsPath = getSettingsPath();
  try {
    const mergedSettings = dataService.mergeSettings!(loadOriginalSettings(), settings, user);
    fs.writeFileSync(settingsPath, JSON.stringify(mergedSettings, null, 2), 'utf8');

    // Update cache after successful save
    settingsCache = mergedSettings;

    // Also save to database asynchronously
    saveSettingsToDB(settings, user).catch(err => 
      console.error('Failed to save settings to database:', err)
    );

    return true;
  } catch (error) {
    console.error(`Failed to save settings to ${settingsPath}:`, error);
    return false;
  }
};

/**
 * Clear settings cache, force next loadSettings call to re-read from file
 */
export const clearSettingsCache = (): void => {
  settingsCache = null;
};

/**
 * Get current cache status (for debugging)
 */
export const getSettingsCacheInfo = (): { hasCache: boolean } => {
  return {
    hasCache: settingsCache !== null,
  };
};

export function replaceEnvVars(input: Record<string, any>): Record<string, any>;
export function replaceEnvVars(input: string[] | undefined): string[];
export function replaceEnvVars(input: string): string;
export function replaceEnvVars(
  input: Record<string, any> | string[] | string | undefined,
): Record<string, any> | string[] | string {
  // Handle object input
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const res: Record<string, string> = {};
    for (const [key, value] of Object.entries(input)) {
      if (typeof value === 'string') {
        res[key] = expandEnvVars(value);
      } else {
        res[key] = String(value);
      }
    }
    return res;
  }

  // Handle array input
  if (Array.isArray(input)) {
    return input.map((item) => expandEnvVars(item));
  }

  // Handle string input
  if (typeof input === 'string') {
    return expandEnvVars(input);
  }

  // Handle undefined/null array input
  if (input === undefined || input === null) {
    return [];
  }

  return input;
}

export const expandEnvVars = (value: string): string => {
  if (typeof value !== 'string') {
    return String(value);
  }
  // Replace ${VAR} format
  let result = value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] || '');
  // Also replace $VAR format (common on Unix-like systems)
  result = result.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => process.env[key] || '');
  return result;
};

export default defaultConfig;
