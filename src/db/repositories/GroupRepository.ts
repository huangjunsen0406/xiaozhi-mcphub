import { BaseRepository } from './BaseRepository.js';
import { Group } from '../entities/index.js';
import { IGroupServerConfig } from '../../types/index.js';

export class GroupRepository extends BaseRepository<Group> {
  constructor() {
    super(Group);
  }

  async findByName(name: string): Promise<Group | null> {
    return this.repository.findOneBy({ name });
  }

  async findByIdOrName(key: string): Promise<Group | null> {
    return await this.repository
      .createQueryBuilder('group')
      .where('group.id = :key OR group.name = :key', { key })
      .getOne();
  }

  async create(data: {
    name: string;
    description?: string;
    servers?: IGroupServerConfig[];
    owner?: string;
  }): Promise<Group> {
    const group = this.repository.create({
      name: data.name,
      description: data.description,
      servers: data.servers || [],
      owner: data.owner || 'admin',
    });
    return await this.repository.save(group);
  }

  async update(id: string, data: {
    name?: string;
    description?: string;
    servers?: IGroupServerConfig[];
    owner?: string;
  }): Promise<Group | null> {
    await this.repository.update(id, data);
    return await this.findById(id);
  }

  async existsByName(name: string, excludeId?: string): Promise<boolean> {
    const query = this.repository.createQueryBuilder('group').where('group.name = :name', { name });
    
    if (excludeId) {
      query.andWhere('group.id != :excludeId', { excludeId });
    }
    
    const count = await query.getCount();
    return count > 0;
  }

  async updateServers(id: string, servers: IGroupServerConfig[]): Promise<Group | null> {
    await this.repository.update(id, { servers });
    return await this.findById(id);
  }
}

// Singleton instance
let groupRepositoryInstance: GroupRepository | null = null;

export function getGroupRepository(): GroupRepository {
  if (!groupRepositoryInstance) {
    groupRepositoryInstance = new GroupRepository();
  }
  return groupRepositoryInstance;
}

export default GroupRepository;