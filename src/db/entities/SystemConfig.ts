import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * System configuration entity for database storage
 * Using singleton pattern - only one record with id = 'default'
 */
@Entity({ name: 'system_config' })
export class SystemConfig {
  @PrimaryColumn({ type: 'varchar', length: 50, default: 'default' })
  id: string;

  @Column({ type: 'simple-json', nullable: true })
  routing?: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  install?: Record<string, any>;

  // Explicit snake_case names preserve v1.0.3 system_config columns under synchronize.
  @Column({ type: 'simple-json', name: 'smart_routing', nullable: true })
  smartRouting?: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  toolResultCompression?: Record<string, any>;

  @Column({ type: 'simple-json', name: 'mcp_router', nullable: true })
  mcpRouter?: Record<string, any>;

  @Column({ type: 'simple-json', name: 'modelscope', nullable: true })
  modelscope?: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  email?: Record<string, any>;

  @Column({ type: 'varchar', length: 10, nullable: true })
  nameSeparator?: string;

  @Column({ type: 'simple-json', nullable: true })
  oauth?: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  oauthServer?: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  auth?: Record<string, any>;

  @Column({ type: 'boolean', nullable: true })
  enableSessionRebuild?: boolean;

  @Column({ type: 'simple-json', nullable: true })
  discovery?: Record<string, any>;

  @Column({ type: 'simple-json', nullable: true })
  activityLog?: Record<string, any>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default SystemConfig;
