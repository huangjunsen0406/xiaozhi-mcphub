import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'xiaozhi_config' })
export class XiaozhiConfig {
  @PrimaryColumn({ type: 'varchar', default: 'default' })
  id: string; // Usually 'default' for single config

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'simple-json', name: 'load_balancing', nullable: true })
  loadBalancing: {
    enabled?: boolean;
    strategy?: 'round-robin' | 'random' | 'least-connections';
  };

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default XiaozhiConfig;