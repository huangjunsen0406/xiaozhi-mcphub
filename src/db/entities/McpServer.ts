import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'mcp_servers' })
export class McpServer {
  @PrimaryColumn({ type: 'varchar' })
  name: string; // Server name (e.g., "amap", "playwright", "fetch", "slack")

  @Column({ type: 'varchar', nullable: true })
  type: string; // Server type (stdio/sse/streamable-http/openapi)

  @Column({ type: 'varchar', nullable: true })
  url: string; // Server URL (for remote servers)

  @Column({ type: 'varchar', nullable: true })
  command: string; // Command to execute (e.g., "npx", "uvx")

  @Column({ type: 'simple-array', nullable: true })
  args: string[]; // Command arguments

  @Column({ type: 'simple-json', nullable: true })
  env: Record<string, string>; // Environment variables

  @Column({ type: 'simple-json', nullable: true })
  headers: Record<string, string>; // HTTP headers

  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  @Column({ type: 'varchar', nullable: true })
  owner: string; // Owner username

  @Column({ type: 'int', nullable: true, name: 'keep_alive_interval' })
  keepAliveInterval: number;

  @Column({ type: 'simple-json', nullable: true })
  tools: any; // Tool configurations

  @Column({ type: 'simple-json', nullable: true })
  prompts: any; // Prompt configurations

  @Column({ type: 'simple-json', nullable: true })
  options: any; // Request options

  @Column({ type: 'simple-json', nullable: true })
  openapi: any; // OpenAPI configuration

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default McpServer;