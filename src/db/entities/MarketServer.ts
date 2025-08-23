import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'market_servers' })
export class MarketServer {
  @PrimaryColumn({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'simple-json', nullable: true })
  repository: {
    url?: string;
    type?: string;
  };

  @Column({ type: 'varchar', nullable: true })
  homepage: string;

  @Column({ type: 'varchar', nullable: true })
  author: string;

  @Column({ type: 'varchar', nullable: true })
  license: string;

  @Column({ type: 'simple-array', nullable: true })
  categories: string[];

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'simple-json', nullable: true })
  examples: any[];

  @Column({ type: 'simple-json', nullable: true })
  installations: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
  }[];

  @Column({ type: 'simple-json', nullable: true })
  arguments: any[];

  @Column({ type: 'simple-json', nullable: true })
  tools: {
    name: string;
    description: string;
  }[];

  @Column({ type: 'boolean', default: false, name: 'is_official' })
  isOfficial: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default MarketServer;