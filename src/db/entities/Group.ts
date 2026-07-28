import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Group entity for database storage.
 * Uniqueness is per-owner so different users may reuse the same group name.
 */
@Entity({ name: 'groups' })
@Index(['owner', 'name'], { unique: true })
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // No length on name/owner: match v1.0.3 unlimited varchar so synchronize does
  // not DROP+ADD NOT NULL on existing group rows.
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  // nullable keeps v1.0.3 rows valid; app code still treats missing as [].
  @Column({ type: 'simple-json', nullable: true })
  servers: Array<
    | string
    | {
        name: string;
        alias?: string;
        tools?: string[] | 'all';
        prompts?: string[] | 'all';
        resources?: string[] | 'all';
      }
  >;

  @Column({ type: 'varchar', nullable: true })
  owner?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default Group;
