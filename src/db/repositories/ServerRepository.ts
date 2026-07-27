import { Repository } from 'typeorm';
import { Server } from '../entities/Server.js';
import { getAppDataSource } from '../connection.js';

/**
 * Repository for Server entity
 */
export class ServerRepository {
  private repository: Repository<Server>;

  constructor() {
    this.repository = getAppDataSource().getRepository(Server);
  }

  /**
   * Find all servers
   */
  async findAll(): Promise<Server[]> {
    return await this.repository.find({ order: { createdAt: 'ASC' } });
  }

  /**
   * Find server by name (first match). Prefer findByOwnerAndName when owner is known.
   */
  async findByName(name: string): Promise<Server | null> {
    return await this.repository.findOne({ where: { name } });
  }

  /**
   * Find server by owner + name (authoritative uniqueness key).
   * Treats null/empty owner as matching the given owner for legacy rows.
   */
  async findByOwnerAndName(owner: string, name: string): Promise<Server | null> {
    // Prefer exact owner match
    const exact = await this.repository.findOne({ where: { owner, name } });
    if (exact) return exact;
    // Legacy rows may have null/empty owner — only match them for the admin namespace
    if (owner === 'admin') {
      return await this.repository
        .createQueryBuilder('server')
        .where('server.name = :name', { name })
        .andWhere('(server.owner IS NULL OR server.owner = :empty)', { empty: '' })
        .getOne();
    }
    return null;
  }

  /**
   * Create a new server
   */
  async create(server: Omit<Server, 'id' | 'createdAt' | 'updatedAt'>): Promise<Server> {
    const newServer = this.repository.create(server);
    return await this.repository.save(newServer);
  }

  /**
   * Update an existing server by name (first match). Prefer updateByOwnerAndName.
   */
  async update(name: string, serverData: Partial<Server>): Promise<Server | null> {
    const server = await this.findByName(name);
    if (!server) {
      return null;
    }
    const updated = this.repository.merge(server, serverData);
    return await this.repository.save(updated);
  }

  /**
   * Update server identified by (owner, name).
   */
  async updateByOwnerAndName(
    owner: string,
    name: string,
    serverData: Partial<Server>,
  ): Promise<Server | null> {
    const server = await this.findByOwnerAndName(owner, name);
    if (!server) {
      return null;
    }
    const updated = this.repository.merge(server, serverData);
    return await this.repository.save(updated);
  }

  /**
   * Delete a server by name (all owners). Prefer deleteByOwnerAndName.
   */
  async delete(name: string): Promise<boolean> {
    const result = await this.repository.delete({ name });
    return (result.affected ?? 0) > 0;
  }

  async deleteByOwnerAndName(owner: string, name: string): Promise<boolean> {
    const server = await this.findByOwnerAndName(owner, name);
    if (!server) return false;
    const result = await this.repository.delete({ id: server.id });
    return (result.affected ?? 0) > 0;
  }

  /**
   * Check if a server name exists within an owner namespace.
   * When owner is omitted, checks global existence (legacy / admin tooling).
   */
  async exists(name: string, owner?: string): Promise<boolean> {
    if (owner) {
      const found = await this.findByOwnerAndName(owner, name);
      return found !== null;
    }
    const count = await this.repository.count({ where: { name } });
    return count > 0;
  }

  /**
   * Count total servers
   */
  async count(): Promise<number> {
    return await this.repository.count();
  }

  /**
   * Find servers with pagination
   */
  async findAllPaginated(page: number, limit: number): Promise<{ data: Server[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.repository.findAndCount({
      order: { 
        enabled: 'DESC',  // Enabled servers first
        createdAt: 'ASC'  // Then by creation time
      },
      skip,
      take: limit,
    });

    return { data, total };
  }

  /**
   * Find servers by owner with pagination
   */
  async findByOwnerPaginated(owner: string, page: number, limit: number): Promise<{ data: Server[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.repository.findAndCount({
      where: { owner },
      order: { 
        enabled: 'DESC',  // Enabled servers first
        createdAt: 'ASC'  // Then by creation time
      },
      skip,
      take: limit,
    });

    return { data, total };
  }

  /**
   * Find servers visible to a non-admin user with pagination.
   */
  async findVisibleToUserPaginated(
    username: string,
    page: number,
    limit: number,
  ): Promise<{ data: Server[]; total: number }> {
    const skip = (page - 1) * limit;
    const [data, total] = await this.repository
      .createQueryBuilder('server')
      .where('server.owner = :username', { username })
      .orWhere('server.visibility = :visibility', { visibility: 'public' })
      .orderBy('server.enabled', 'DESC')
      .addOrderBy('server.createdAt', 'ASC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data, total };
  }

  /**
   * Find servers by owner
   */
  async findByOwner(owner: string): Promise<Server[]> {
    return await this.repository.find({ where: { owner }, order: { createdAt: 'ASC' } });
  }

  /**
   * Find enabled servers
   */
  async findEnabled(): Promise<Server[]> {
    return await this.repository.find({ where: { enabled: true }, order: { createdAt: 'ASC' } });
  }

  /**
   * Set server enabled status
   */
  async setEnabled(name: string, enabled: boolean): Promise<Server | null> {
    return await this.update(name, { enabled });
  }

  /**
   * Rename a server (first match by old name). Prefer renameByOwner.
   */
  async rename(oldName: string, newName: string): Promise<boolean> {
    const server = await this.findByName(oldName);
    if (!server) {
      return false;
    }
    server.name = newName;
    await this.repository.save(server);
    return true;
  }

  /**
   * Rename within an owner namespace. Fails if target name already taken by same owner.
   */
  async renameByOwner(owner: string, oldName: string, newName: string): Promise<boolean> {
    const server = await this.findByOwnerAndName(owner, oldName);
    if (!server) {
      return false;
    }
    if (await this.exists(newName, owner)) {
      throw new Error(`Server ${newName} already exists for owner ${owner}`);
    }
    server.name = newName;
    await this.repository.save(server);
    return true;
  }
}

export default ServerRepository;
