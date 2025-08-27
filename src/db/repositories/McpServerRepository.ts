import { BaseRepository } from './BaseRepository.js';
import { McpServer } from '../entities/index.js';

/**
 * Repository for managing MCP servers in the database
 */
export class McpServerRepository extends BaseRepository<McpServer> {
  constructor() {
    super(McpServer);
  }

  /**
   * Find server by name
   * @param name Server name
   */
  async findByName(name: string): Promise<McpServer | null> {
    return this.repository.findOneBy({ name });
  }

  /**
   * Find servers by owner
   * @param owner Owner username
   */
  async findByOwner(owner: string): Promise<McpServer[]> {
    return this.repository.findBy({ owner });
  }

  /**
   * Find enabled servers
   */
  async findEnabled(): Promise<McpServer[]> {
    return this.repository.findBy({ enabled: true });
  }

  /**
   * Update server enabled status
   * @param name Server name
   * @param enabled Enabled status
   */
  async updateEnabledStatus(name: string, enabled: boolean): Promise<boolean> {
    const result = await this.repository.update({ name }, { enabled });
    return result.affected !== null && result.affected !== undefined && result.affected > 0;
  }

  /**
   * Delete server by name
   * @param name Server name
   */
  async deleteByName(name: string): Promise<boolean> {
    const result = await this.repository.delete({ name });
    return result.affected !== null && result.affected !== undefined && result.affected > 0;
  }

  /**
   * Check if server exists
   * @param name Server name
   */
  async exists(name: string): Promise<boolean> {
    const count = await this.repository.countBy({ name });
    return count > 0;
  }

  /**
   * Update server configuration
   * @param name Server name
   * @param config Partial server configuration
   */
  async updateConfig(name: string, config: Partial<McpServer>): Promise<boolean> {
    const result = await this.repository.update({ name }, config);
    return result.affected !== null && result.affected !== undefined && result.affected > 0;
  }

  /**
   * Get all server names
   */
  async getAllServerNames(): Promise<string[]> {
    const servers = await this.repository.find({ select: ['name'] });
    return servers.map(server => server.name);
  }

  /**
   * Batch create or update servers
   * @param servers Array of server configurations
   */
  async upsertMany(servers: Partial<McpServer>[]): Promise<McpServer[]> {
    const results: McpServer[] = [];
    
    for (const serverConfig of servers) {
      if (!serverConfig.name) continue;
      
      const existing = await this.findByName(serverConfig.name);
      if (existing) {
        // Update existing server
        await this.repository.update({ name: serverConfig.name }, serverConfig);
        const updated = await this.findByName(serverConfig.name);
        if (updated) results.push(updated);
      } else {
        // Create new server
        const saved = await this.repository.save(serverConfig);
        results.push(saved);
      }
    }
    
    return results;
  }
}

// Singleton instance
let mcpServerRepositoryInstance: McpServerRepository | null = null;

export function getMcpServerRepository(): McpServerRepository {
  if (!mcpServerRepositoryInstance) {
    mcpServerRepositoryInstance = new McpServerRepository();
  }
  return mcpServerRepositoryInstance;
}

export default McpServerRepository;