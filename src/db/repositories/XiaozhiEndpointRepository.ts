import BaseRepository from './BaseRepository.js';
import { XiaozhiEndpoint } from '../entities/index.js';

export class XiaozhiEndpointRepository extends BaseRepository<XiaozhiEndpoint> {
  constructor() {
    super(XiaozhiEndpoint);
  }

  async findEnabled(): Promise<XiaozhiEndpoint[]> {
    return this.getRepository().find({ where: { enabled: true } });
  }

  async updateStatus(
    id: string,
    status: 'connected' | 'disconnected' | 'connecting',
    lastConnected?: Date,
  ): Promise<void> {
    const data: Partial<XiaozhiEndpoint> = { status } as any;
    if (status === 'connected') {
      data.lastConnected = lastConnected || new Date();
    }
    await this.getRepository().update(id, data);
  }

  async updateById(id: string, data: Partial<XiaozhiEndpoint>): Promise<XiaozhiEndpoint | null> {
    await this.getRepository().update(id, data);
    return await this.findById(id as any);
  }
}

let endpointRepoInstance: XiaozhiEndpointRepository | null = null;
export function getXiaozhiEndpointRepository(): XiaozhiEndpointRepository {
  if (!endpointRepoInstance) {
    endpointRepoInstance = new XiaozhiEndpointRepository();
  }
  return endpointRepoInstance;
}

export default XiaozhiEndpointRepository;


