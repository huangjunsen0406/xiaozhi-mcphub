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
    // 避免 Postgres 参数在 uuid 与 text 同时比较时的类型推断问题（42883）
    const isUuid = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    if (isUuid.test(key)) {
      return await this.repository
        .createQueryBuilder('group')
        .where('group.id = :idKey', { idKey: key })
        .getOne();
    }

    return await this.repository
      .createQueryBuilder('group')
      .where('group.name = :nameKey', { nameKey: key })
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