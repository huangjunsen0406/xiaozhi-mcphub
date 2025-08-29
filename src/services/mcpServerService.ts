import { McpServerRepository } from '../db/repositories/McpServerRepository.js';
import { isDatabaseConnected } from '../db/connection.js';
import { McpServer } from '../db/entities/McpServer.js';
import { ServerConfig } from '../types/index.js';

/**
 * Service for managing MCP servers
 * This service handles the database operations for MCP server configurations
 */
export class McpServerService {
  private mcpServerRepository: McpServerRepository;

  constructor() {
    this.mcpServerRepository = new McpServerRepository();
  }

  /**
   * Get all servers
   */
  async getAllServers(): Promise<McpServer[]> {
    if (!isDatabaseConnected()) return [];
    return this.mcpServerRepository.findAll();
  }

  /**
   * Get server by name
   * @param name Server name
   */
  async getServerByName(name: string): Promise<McpServer | null> {
    if (!isDatabaseConnected()) return null;
    return this.mcpServerRepository.findByName(name);
  }

  /**
   * Get enabled servers
   */
  async getEnabledServers(): Promise<McpServer[]> {
    if (!isDatabaseConnected()) return [];
    return this.mcpServerRepository.findEnabled();
  }

  /**
   * Create a new server
   * @param name Server name
   * @param config Server configuration
   */
  async createServer(name: string, config: ServerConfig): Promise<McpServer> {
    if (!isDatabaseConnected()) throw new Error('Database not connected');
    const serverEntity: Partial<McpServer> = {
      name,
      type: config.type || 'stdio',
      url: config.url,
      command: config.command,
      args: config.args,
      env: config.env,
      headers: config.headers,
      enabled: config.enabled !== false, // Default to true
      owner: config.owner || 'admin',
      keepAliveInterval: config.keepAliveInterval,
      tools: config.tools,
      prompts: config.prompts,
      options: config.options,
      openapi: config.openapi
    };

    return this.mcpServerRepository.save(serverEntity);
  }

  /**
   * Update an existing server
   * @param name Server name
   * @param config Partial server configuration
   */
  async updateServer(name: string, config: Partial<ServerConfig>): Promise<boolean> {
    if (!isDatabaseConnected()) return false;
    const updateData: Partial<McpServer> = {};

    // Map configuration fields to entity fields
    if (config.type !== undefined) updateData.type = config.type;
    if (config.url !== undefined) updateData.url = config.url;
    if (config.command !== undefined) updateData.command = config.command;
    if (config.args !== undefined) updateData.args = config.args;
    if (config.env !== undefined) updateData.env = config.env;
    if (config.headers !== undefined) updateData.headers = config.headers;
    if (config.enabled !== undefined) updateData.enabled = config.enabled;
    if (config.owner !== undefined) updateData.owner = config.owner;
    if (config.keepAliveInterval !== undefined) updateData.keepAliveInterval = config.keepAliveInterval;
    if (config.tools !== undefined) updateData.tools = config.tools;
    if (config.prompts !== undefined) updateData.prompts = config.prompts;
    if (config.options !== undefined) updateData.options = config.options;
    if (config.openapi !== undefined) updateData.openapi = config.openapi;

    return this.mcpServerRepository.updateConfig(name, updateData);
  }

  /**
   * Delete a server
   * @param name Server name
   */
  async deleteServer(name: string): Promise<boolean> {
    if (!isDatabaseConnected()) return false;
    return this.mcpServerRepository.deleteByName(name);
  }

  /**
   * Toggle server enabled status
   * @param name Server name
   * @param enabled Enabled status
   */
  async toggleServer(name: string, enabled: boolean): Promise<boolean> {
    if (!isDatabaseConnected()) return false;
    return this.mcpServerRepository.updateEnabledStatus(name, enabled);
  }

  /**
   * Check if server exists
   * @param name Server name
   */
  async serverExists(name: string): Promise<boolean> {
    if (!isDatabaseConnected()) return false;
    return this.mcpServerRepository.exists(name);
  }

  /**
   * Get servers by owner
   * @param owner Owner username
   */
  async getServersByOwner(owner: string): Promise<McpServer[]> {
    if (!isDatabaseConnected()) return [];
    return this.mcpServerRepository.findByOwner(owner);
  }

  /**
   * Convert database entity to ServerConfig
   * @param server Database server entity
   */
  entityToConfig(server: McpServer): ServerConfig {
    return {
      type: server.type as 'stdio' | 'sse' | 'streamable-http' | 'openapi',
      url: server.url,
      command: server.command,
      args: server.args,
      env: server.env,
      headers: server.headers,
      enabled: server.enabled,
      owner: server.owner,
      keepAliveInterval: server.keepAliveInterval,
      tools: server.tools,
      prompts: server.prompts,
      options: server.options,
      openapi: server.openapi
    };
  }

  /**
   * Get all servers as configuration object (compatible with mcp_settings.json format)
   */
  async getServersAsConfig(): Promise<Record<string, ServerConfig>> {
    const servers = await this.getAllServers();
    const config: Record<string, ServerConfig> = {};

    for (const server of servers) {
      config[server.name] = this.entityToConfig(server);
    }

    return config;
  }

  /**
   * Migrate servers from JSON configuration to database
   * @param jsonConfig Server configuration from mcp_settings.json
   */
  async migrateFromJson(jsonConfig: Record<string, ServerConfig>): Promise<void> {
    const serverEntities: Partial<McpServer>[] = [];

    for (const [name, config] of Object.entries(jsonConfig)) {
      serverEntities.push({
        name,
        type: config.type || 'stdio',
        url: config.url,
        command: config.command,
        args: config.args,
        env: config.env,
        headers: config.headers,
        enabled: config.enabled !== false,
        owner: config.owner || 'admin',
        keepAliveInterval: config.keepAliveInterval,
        tools: config.tools,
        prompts: config.prompts,
        options: config.options,
        openapi: config.openapi
      });
    }

    await this.mcpServerRepository.upsertMany(serverEntities);
  }

  /**
   * Get total server count
   */
  async getServerCount(): Promise<number> {
    return this.mcpServerRepository.count();
  }
}

// Singleton instance
let mcpServerServiceInstance: McpServerService | null = null;

/**
 * Get singleton instance of McpServerService
 */
export function getMcpServerService(): McpServerService {
  if (!mcpServerServiceInstance) {
    mcpServerServiceInstance = new McpServerService();
  }
  return mcpServerServiceInstance;
}

export default McpServerService;