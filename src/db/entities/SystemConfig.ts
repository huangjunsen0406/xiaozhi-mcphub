import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'system_config' })
export class SystemConfig {
  @PrimaryColumn({ type: 'varchar', default: 'default' })
  id: string; // Usually 'default' for single config

  @Column({ type: 'simple-json', nullable: true })
  routing: {
    enableGlobalRoute?: boolean;
    enableGroupNameRoute?: boolean;
    enableBearerAuth?: boolean;
    bearerAuthKey?: string;
    skipAuth?: boolean;
  };

  @Column({ type: 'simple-json', nullable: true })
  install: {
    pythonIndexUrl?: string;
    npmRegistry?: string;
    baseUrl?: string;
  };

  @Column({ type: 'simple-json', name: 'smart_routing', nullable: true })
  smartRouting: {
    enabled?: boolean;
    apiUrl?: string;
    apiKey?: string;
    model?: string;
    dbUrl?: string;
    openaiApiBaseUrl?: string;
    openaiApiKey?: string;
    openaiApiEmbeddingModel?: string;
  };

  @Column({ type: 'simple-json', name: 'mcp_router', nullable: true })
  mcpRouter: {
    apiKey?: string;
    referer?: string;
    title?: string;
    baseUrl?: string;
  };

  @Column({ type: 'simple-json', name: 'modelscope', nullable: true })
  modelscope: {
    apiKey?: string;
  };

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default SystemConfig;