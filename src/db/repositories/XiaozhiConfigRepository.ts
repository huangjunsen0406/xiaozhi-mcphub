import BaseRepository from './BaseRepository.js';
import { XiaozhiConfig } from '../entities/index.js';

export class XiaozhiConfigRepository extends BaseRepository<XiaozhiConfig> {
  constructor() {
    super(XiaozhiConfig);
  }

  async getConfig(): Promise<XiaozhiConfig | null> {
    return await this.getRepository().findOne({ where: { id: 'default' } });
  }

  async saveConfig(config: Partial<XiaozhiConfig>): Promise<XiaozhiConfig> {
    const repository = this.getRepository();
    const exists = await this.getConfig();
    const data: Partial<XiaozhiConfig> = { id: 'default', ...exists, ...config } as any;
    if (exists) {
      await repository.update('default', data);
      return (await this.getConfig())!;
    }
    return await repository.save(repository.create(data));
  }
}

let xiaozhiConfigRepoInstance: XiaozhiConfigRepository | null = null;
export function getXiaozhiConfigRepository(): XiaozhiConfigRepository {
  if (!xiaozhiConfigRepoInstance) {
    xiaozhiConfigRepoInstance = new XiaozhiConfigRepository();
  }
  return xiaozhiConfigRepoInstance;
}

export default XiaozhiConfigRepository;


