import { SystemConfig } from '../entities/index.js';
import BaseRepository from './BaseRepository.js';

/**
 * Repository for SystemConfig entity
 * Handles system-wide configuration stored in database
 */
export class SystemConfigRepository extends BaseRepository<SystemConfig> {
  constructor() {
    super(SystemConfig);
  }

  /**
   * Get the system configuration (should only have one record)
   */
  async getConfig(): Promise<SystemConfig | null> {
    return await this.repository.findOne({ where: { id: 'default' } });
  }

  /**
   * Create or update system configuration
   */
  async saveConfig(config: Partial<SystemConfig>): Promise<SystemConfig> {
    // Ensure we always use 'default' as the ID
    const configToSave = { ...config, id: 'default' };
    
    // Check if config exists
    const existingConfig = await this.getConfig();
    
    if (existingConfig) {
      // Update existing config
      await this.repository.update('default', configToSave);
      const updated = await this.getConfig();
      return updated!;
    } else {
      // Create new config
      const newConfig = this.repository.create(configToSave);
      return await this.repository.save(newConfig);
    }
  }

  /**
   * Update routing configuration only
   */
  async updateRouting(routing: Partial<SystemConfig['routing']>): Promise<SystemConfig | null> {
    const config = await this.getConfig();
    if (!config) {
      // Create new config with routing
      return await this.saveConfig({ routing });
    }
    
    // Merge with existing routing
    const updatedRouting = { ...config.routing, ...routing };
    return await this.saveConfig({ routing: updatedRouting });
  }

  /**
   * Update install configuration only
   */
  async updateInstall(install: Partial<SystemConfig['install']>): Promise<SystemConfig | null> {
    const config = await this.getConfig();
    if (!config) {
      return await this.saveConfig({ install });
    }
    
    const updatedInstall = { ...config.install, ...install };
    return await this.saveConfig({ install: updatedInstall });
  }

  /**
   * Update smart routing configuration only
   */
  async updateSmartRouting(smartRouting: Partial<SystemConfig['smartRouting']>): Promise<SystemConfig | null> {
    const config = await this.getConfig();
    if (!config) {
      return await this.saveConfig({ smartRouting });
    }
    
    const updatedSmartRouting = { ...config.smartRouting, ...smartRouting };
    return await this.saveConfig({ smartRouting: updatedSmartRouting });
  }

  /**
   * Update MCP router configuration only
   */
  async updateMcpRouter(mcpRouter: Partial<SystemConfig['mcpRouter']>): Promise<SystemConfig | null> {
    const config = await this.getConfig();
    if (!config) {
      return await this.saveConfig({ mcpRouter });
    }
    
    const updatedMcpRouter = { ...config.mcpRouter, ...mcpRouter };
    return await this.saveConfig({ mcpRouter: updatedMcpRouter });
  }

  /**
   * Update modelscope configuration only
   */
  async updateModelScope(modelscope: Partial<SystemConfig['modelscope']>): Promise<SystemConfig | null> {
    const config = await this.getConfig();
    if (!config) {
      return await this.saveConfig({ modelscope });
    }
    const updated = { ...config.modelscope, ...modelscope };
    return await this.saveConfig({ modelscope: updated });
  }

  /**
   * Initialize default configuration if none exists
   */
  async initializeDefaults(): Promise<SystemConfig> {
    const existing = await this.getConfig();
    if (existing) {
      return existing;
    }

    const defaultConfig: Partial<SystemConfig> = {
      id: 'default',
      routing: {
        enableGlobalRoute: true,
        enableGroupNameRoute: true,
        enableBearerAuth: false,
        bearerAuthKey: '',
        skipAuth: false
      },
      install: {
        pythonIndexUrl: '',
        npmRegistry: '',
        baseUrl: 'http://localhost:3000'
      },
      smartRouting: {
        enabled: false,
        dbUrl: '',
        apiUrl: '',
        apiKey: '',
        model: '',
        openaiApiBaseUrl: '',
        openaiApiKey: '',
        openaiApiEmbeddingModel: ''
      },
      mcpRouter: {
        apiKey: '',
        referer: 'https://www.mcphubx.com',
        title: 'MCPHub',
        baseUrl: 'https://api.mcprouter.to/v1'
      },
      modelscope: {
        apiKey: ''
      }
    };

    return await this.saveConfig(defaultConfig);
  }
}

// Singleton instance
let systemConfigRepositoryInstance: SystemConfigRepository | null = null;

export function getSystemConfigRepository(): SystemConfigRepository {
  if (!systemConfigRepositoryInstance) {
    systemConfigRepositoryInstance = new SystemConfigRepository();
  }
  return systemConfigRepositoryInstance;
}

export default SystemConfigRepository;