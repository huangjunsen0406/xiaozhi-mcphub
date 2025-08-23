import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'cloud_servers' })
export class CloudServer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', name: 'author_name', nullable: true })
  authorName: string;

  @Column({ type: 'varchar', nullable: true })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ type: 'varchar', name: 'server_key', unique: true })
  serverKey: string;

  @Column({ type: 'varchar', name: 'config_name', nullable: true })
  configName: string;

  @Column({ type: 'simple-json', nullable: true })
  tools: {
    name: string;
    description: string;
  }[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default CloudServer;