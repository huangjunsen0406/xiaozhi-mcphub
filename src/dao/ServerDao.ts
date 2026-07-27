import { ServerConfig } from '../types/index.js';
import { BaseDao } from './base/BaseDao.js';
import { JsonFileBaseDao } from './base/JsonFileBaseDao.js';

/**
 * Pagination result interface
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Server DAO interface with server-specific operations
 */
export interface ServerDao extends BaseDao<ServerConfigWithName, string> {
  /**
   * Find all servers with pagination
   */
  findAllPaginated(page: number, limit: number): Promise<PaginatedResult<ServerConfigWithName>>;

  /**
   * Find servers by owner with pagination
   */
  findByOwnerPaginated(owner: string, page: number, limit: number): Promise<PaginatedResult<ServerConfigWithName>>;

  /**
   * Find servers visible to a non-admin user with pagination.
   * Visible means owned by the user or marked public.
   */
  findVisibleToUserPaginated(
    username: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ServerConfigWithName>>;

  /**
   * Find servers by owner
   */
  findByOwner(owner: string): Promise<ServerConfigWithName[]>;

  /**
   * Find enabled servers only
   */
  findEnabled(): Promise<ServerConfigWithName[]>;

  /**
   * Find servers by type
   */
  findByType(type: string): Promise<ServerConfigWithName[]>;

  /**
   * Enable/disable server
   */
  setEnabled(name: string, enabled: boolean): Promise<boolean>;

  /**
   * Update server tools configuration
   */
  updateTools(
    name: string,
    tools: Record<string, { enabled: boolean; description?: string }>,
  ): Promise<boolean>;

  /**
   * Update server prompts configuration
   */
  updatePrompts(
    name: string,
    prompts: Record<string, { enabled: boolean; description?: string }>,
  ): Promise<boolean>;

  /**
   * Update server resources configuration
   */
  updateResources(
    name: string,
    resources: Record<string, { enabled: boolean; description?: string }>,
  ): Promise<boolean>;

  /**
   * Rename a server (change its name/key).
   * When `owner` is provided, only that owner's instance is renamed and
   * uniqueness is checked within that namespace.
   */
  rename(oldName: string, newName: string, owner?: string): Promise<boolean>;

  /**
   * Find by owner + name (authoritative uniqueness key after multi-account isolation).
   */
  findByOwnerAndName(owner: string, name: string): Promise<ServerConfigWithName | null>;

  /**
   * Check whether a name exists within an owner namespace.
   * When owner is omitted, falls back to global existence (legacy).
   */
  existsForOwner(owner: string, name: string): Promise<boolean>;

  /**
   * Delete a server within an owner namespace.
   */
  deleteByOwnerAndName(owner: string, name: string): Promise<boolean>;
}

/**
 * Server configuration with name for DAO operations
 */
export interface ServerConfigWithName extends ServerConfig {
  name: string;
}

/**
 * JSON file-based Server DAO implementation.
 * Storage keys are `${owner}::${name}` so different users may share a display name.
 * Legacy entries keyed only by `name` are still loaded (owner defaults from config/admin).
 */
export class ServerDaoImpl extends JsonFileBaseDao implements ServerDao {
  private static storageKey(owner: string | undefined, name: string): string {
    return `${owner || 'admin'}::${name}`;
  }

  private static parseStorageKey(
    key: string,
    config: ServerConfig,
  ): { name: string; owner: string } {
    const sep = '::';
    const idx = key.indexOf(sep);
    if (idx > 0) {
      return {
        owner: key.slice(0, idx) || config.owner || 'admin',
        name: key.slice(idx + sep.length) || key,
      };
    }
    return { name: key, owner: config.owner || 'admin' };
  }

  protected async getAll(): Promise<ServerConfigWithName[]> {
    const settings = await this.loadSettings();
    const servers: ServerConfigWithName[] = [];

    for (const [key, config] of Object.entries(settings.mcpServers || {})) {
      const { name, owner } = ServerDaoImpl.parseStorageKey(key, config);
      servers.push({
        name,
        ...config,
        owner: config.owner || owner,
      });
    }

    return servers;
  }

  protected async saveAll(servers: ServerConfigWithName[]): Promise<void> {
    const settings = await this.loadSettings();
    settings.mcpServers = {};

    for (const server of servers) {
      const { name, ...config } = server;
      const owner = config.owner || 'admin';
      const key = ServerDaoImpl.storageKey(owner, name);
      settings.mcpServers[key] = { ...config, owner };
    }

    await this.saveSettings(settings);
  }

  protected getEntityId(server: ServerConfigWithName): string {
    return server.name;
  }

  protected createEntity(_data: Omit<ServerConfigWithName, 'name'>): ServerConfigWithName {
    throw new Error('Server name must be provided');
  }

  protected updateEntity(
    existing: ServerConfigWithName,
    updates: Partial<ServerConfigWithName>,
  ): ServerConfigWithName {
    return {
      ...existing,
      ...updates,
      // Keep the existing name unless explicitly updating via rename
      name: updates.name ?? existing.name,
    };
  }

  async findAll(): Promise<ServerConfigWithName[]> {
    return this.getAll();
  }

  async findById(name: string): Promise<ServerConfigWithName | null> {
    const servers = await this.getAll();
    return servers.find((server) => server.name === name) || null;
  }

  async create(
    data: Omit<ServerConfigWithName, 'name'> & { name: string },
  ): Promise<ServerConfigWithName> {
    const servers = await this.getAll();
    const owner = data.owner || 'admin';

    // Uniqueness is per-owner: different users may share the same display name.
    if (
      servers.find(
        (server) => server.name === data.name && (server.owner || 'admin') === owner,
      )
    ) {
      throw new Error(`Server ${data.name} already exists`);
    }

    const newServer: ServerConfigWithName = {
      enabled: true, // Default to enabled
      owner,
      ...data,
    };

    servers.push(newServer);
    await this.saveAll(servers);

    return newServer;
  }

  async update(
    name: string,
    updates: Partial<ServerConfigWithName>,
  ): Promise<ServerConfigWithName | null> {
    const servers = await this.getAll();
    const index = servers.findIndex((server) => server.name === name);

    if (index === -1) {
      return null;
    }

    const updatedServer = this.updateEntity(servers[index], updates);
    servers[index] = updatedServer;

    await this.saveAll(servers);
    return updatedServer;
  }

  async delete(name: string): Promise<boolean> {
    const servers = await this.getAll();
    const index = servers.findIndex((server) => server.name === name);
    if (index === -1) {
      return false;
    }

    servers.splice(index, 1);
    await this.saveAll(servers);
    return true;
  }

  async exists(name: string): Promise<boolean> {
    const server = await this.findById(name);
    return server !== null;
  }

  async existsForOwner(owner: string, name: string): Promise<boolean> {
    const servers = await this.getAll();
    return servers.some(
      (server) => server.name === name && (server.owner || 'admin') === owner,
    );
  }

  async findByOwnerAndName(
    owner: string,
    name: string,
  ): Promise<ServerConfigWithName | null> {
    const servers = await this.getAll();
    return (
      servers.find(
        (server) => server.name === name && (server.owner || 'admin') === owner,
      ) || null
    );
  }

  async deleteByOwnerAndName(owner: string, name: string): Promise<boolean> {
    const servers = await this.getAll();
    const index = servers.findIndex(
      (server) => server.name === name && (server.owner || 'admin') === owner,
    );
    if (index === -1) return false;
    servers.splice(index, 1);
    await this.saveAll(servers);
    return true;
  }

  async count(): Promise<number> {
    const servers = await this.getAll();
    return servers.length;
  }

  async findAllPaginated(page: number, limit: number): Promise<PaginatedResult<ServerConfigWithName>> {
    const allServers = await this.getAll();
    // Sort: enabled servers first, then by creation time
    const sortedServers = allServers.sort((a, b) => {
      const aEnabled = a.enabled !== false;
      const bEnabled = b.enabled !== false;
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1;
      }
      return 0; // Keep original order for same enabled status
    });
    
    const total = sortedServers.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const data = sortedServers.slice(startIndex, endIndex);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findByOwnerPaginated(owner: string, page: number, limit: number): Promise<PaginatedResult<ServerConfigWithName>> {
    const allServers = await this.getAll();
    const filteredServers = allServers.filter((server) => server.owner === owner);
    // Sort: enabled servers first, then by creation time
    const sortedServers = filteredServers.sort((a, b) => {
      const aEnabled = a.enabled !== false;
      const bEnabled = b.enabled !== false;
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1;
      }
      return 0; // Keep original order for same enabled status
    });
    
    const total = sortedServers.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const data = sortedServers.slice(startIndex, endIndex);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findVisibleToUserPaginated(
    username: string,
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ServerConfigWithName>> {
    const allServers = await this.getAll();
    const filteredServers = allServers.filter(
      (server) => server.owner === username || server.visibility === 'public',
    );
    const sortedServers = filteredServers.sort((a, b) => {
      const aEnabled = a.enabled !== false;
      const bEnabled = b.enabled !== false;
      if (aEnabled !== bEnabled) {
        return aEnabled ? -1 : 1;
      }
      return 0;
    });

    const total = sortedServers.length;
    const totalPages = Math.ceil(total / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const data = sortedServers.slice(startIndex, endIndex);

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  async findByOwner(owner: string): Promise<ServerConfigWithName[]> {
    const servers = await this.getAll();
    return servers.filter((server) => server.owner === owner);
  }

  async findEnabled(): Promise<ServerConfigWithName[]> {
    const servers = await this.getAll();
    return servers.filter((server) => server.enabled !== false);
  }

  async findByType(type: string): Promise<ServerConfigWithName[]> {
    const servers = await this.getAll();
    return servers.filter((server) => server.type === type);
  }

  async setEnabled(name: string, enabled: boolean): Promise<boolean> {
    const result = await this.update(name, { enabled });
    return result !== null;
  }

  async updateTools(
    name: string,
    tools: Record<string, { enabled: boolean; description?: string }>,
  ): Promise<boolean> {
    const result = await this.update(name, { tools });
    return result !== null;
  }

  async updatePrompts(
    name: string,
    prompts: Record<string, { enabled: boolean; description?: string }>,
  ): Promise<boolean> {
    const result = await this.update(name, { prompts });
    return result !== null;
  }

  async updateResources(
    name: string,
    resources: Record<string, { enabled: boolean; description?: string }>,
  ): Promise<boolean> {
    const result = await this.update(name, { resources });
    return result !== null;
  }

  async rename(oldName: string, newName: string, owner?: string): Promise<boolean> {
    const servers = await this.getAll();
    const index = servers.findIndex((server) => {
      if (server.name !== oldName) return false;
      if (owner) return (server.owner || 'admin') === owner;
      return true;
    });

    if (index === -1) {
      return false;
    }

    // Conflict only within the same owner namespace
    const ownerNamespace = owner || servers[index].owner || 'admin';
    if (
      servers.find(
        (server) =>
          server.name === newName &&
          (server.owner || 'admin') === ownerNamespace &&
          server !== servers[index],
      )
    ) {
      throw new Error(`Server ${newName} already exists`);
    }

    servers[index] = { ...servers[index], name: newName };
    await this.saveAll(servers);
    return true;
  }
}
