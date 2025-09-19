import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'xiaozhi_endpoints' })
export class XiaozhiEndpoint {
  @PrimaryColumn({ type: 'varchar' })
  id: string; // Endpoint ID

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'varchar', name: 'websocket_url', nullable: true })
  webSocketUrl: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', name: 'group_id', nullable: true })
  groupId: string; // Associated group ID

  @Column({ type: 'boolean', name: 'use_smart_routing', default: false })
  useSmartRouting: boolean; // Endpoint-level smart routing toggle

  @Column({ type: 'simple-json', nullable: true })
  reconnect: {
    maxAttempts?: number;
    infiniteReconnect?: boolean;
    infiniteRetryDelay?: number;
    initialDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
  };

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @Column({ type: 'timestamp', name: 'last_connected', nullable: true })
  lastConnected: Date;

  @Column({ type: 'varchar', default: 'disconnected' })
  status: string; // Connection status: connected, disconnected, connecting, error

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default XiaozhiEndpoint;