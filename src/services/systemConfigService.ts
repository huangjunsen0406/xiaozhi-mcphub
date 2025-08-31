import { SystemConfig } from '../db/entities/SystemConfig.js';
import { SystemConfigRepository, getSystemConfigRepository } from '../db/repositories/SystemConfigRepository.js';
import { isDatabaseConnected } from '../db/connection.js';

/**
 * SystemConfigService - Business logic layer for system configuration
 * Manages system-wide settings with database persistence
 */
export class SystemConfigService {
  private systemConfigRepository: SystemConfigRepository;

  constructor(repository?: SystemConfigRepository) {
    this.systemConfigRepository = repository || getSystemConfigRepository();
  }

  /**
   * Get system configuration from database
   */
  async getSystemConfig(): Promise<SystemConfig | null> {
    if (!isDatabaseConnected()) return null;
    return await this.systemConfigRepository.getConfig();
  }

  /**
   * Update system configuration
   */
  async updateSystemConfig(updates: {
    routing?: Partial<SystemConfig['routing']>;
    install?: Partial<SystemConfig['install']>;
    smartRouting?: Partial<SystemConfig['smartRouting']>;
    mcpRouter?: Partial<SystemConfig['mcpRouter']>;
    modelscope?: Partial<SystemConfig['modelscope']>;
  }): Promise<SystemConfig> {
    // Get current config from database
    if (!isDatabaseConnected()) throw new Error('Database not connected');
    let config = await this.systemConfigRepository.getConfig();
    
    if (!config) {
      // Initialize with defaults if not exists
      config = await this.systemConfigRepository.initializeDefaults();
    }

    // Build updated configuration
    const updatedConfig: Partial<SystemConfig> = {
      routing: updates.routing ? { ...config.routing, ...updates.routing } : config.routing,
      install: updates.install ? { ...config.install, ...updates.install } : config.install,
      smartRouting: updates.smartRouting ? { ...config.smartRouting, ...updates.smartRouting } : config.smartRouting,
      mcpRouter: updates.mcpRouter ? { ...config.mcpRouter, ...updates.mcpRouter } : config.mcpRouter,
      modelscope: updates.modelscope ? { ...config.modelscope, ...updates.modelscope } : config.modelscope,
    };

    // Save to database
    const savedConfig = await this.systemConfigRepository.saveConfig(updatedConfig);
    return savedConfig;
  }

  /**
   * Update routing configuration only
   */
  async updateRouting(routing: Partial<SystemConfig['routing']>): Promise<SystemConfig | null> {
    if (!isDatabaseConnected()) return null;
    return await this.systemConfigRepository.updateRouting(routing);
  }

  /**
   * Update install configuration only
   */
  async updateInstall(install: Partial<SystemConfig['install']>): Promise<SystemConfig | null> {
    if (!isDatabaseConnected()) return null;
    return await this.systemConfigRepository.updateInstall(install);
  }

  /**
   * Update smart routing configuration only
   */
  async updateSmartRouting(smartRouting: Partial<SystemConfig['smartRouting']>): Promise<SystemConfig | null> {
    if (!isDatabaseConnected()) return null;
    return await this.systemConfigRepository.updateSmartRouting(smartRouting);
  }

  /**
   * Update MCP router configuration only
   */
  async updateMcpRouter(mcpRouter: Partial<SystemConfig['mcpRouter']>): Promise<SystemConfig | null> {
    if (!isDatabaseConnected()) return null;
    return await this.systemConfigRepository.updateMcpRouter(mcpRouter);
  }

  /**
   * Check if authentication should be skipped
   */
  async isAuthSkipped(): Promise<boolean> {
    const config = await this.getSystemConfig();
    return config?.routing?.skipAuth || false;
  }

  /**
   * Get public configuration (safe to expose without auth)
   */
  async getPublicConfig(): Promise<{
    skipAuth: boolean;
    version?: string;
    name?: string;
  }> {
    const config = await this.getSystemConfig();
    return {
      skipAuth: config?.routing?.skipAuth || false,
      // Add other public fields as needed
    };
  }


  /**
   * Initialize system configuration (called during app startup)
   */
  async initialize(): Promise<void> {
    try {
      if (!isDatabaseConnected()) return;
      // Ensure we have a config in database
      const config = await this.systemConfigRepository.getConfig();
      if (!config) {
        console.log('Initializing default system configuration...');
        await this.systemConfigRepository.initializeDefaults();
      }
    } catch (error) {
      console.error('Failed to initialize system config:', error);
      throw error;
    }
  }
}

// Singleton instance
let systemConfigServiceInstance: SystemConfigService | null = null;

export function getSystemConfigService(): SystemConfigService {
  if (!systemConfigServiceInstance) {
    systemConfigServiceInstance = new SystemConfigService();
  }
  return systemConfigServiceInstance;
}

export default SystemConfigService;