import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * User entity for database storage
 */
@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // No length: v1.0.3 created unlimited varchar. TypeORM synchronize treats a
  // length change as DROP+ADD NOT NULL, which fails on existing admin rows
  // ("column username contains null values" during the rebuild).
  @Column({ type: 'varchar', unique: true })
  username: string;

  @Column({ type: 'varchar' })
  password: string;

  // Keep explicit snake_case column name so v1.0.3 databases (is_admin) keep working.
  @Column({ type: 'boolean', default: false, name: 'is_admin' })
  isAdmin: boolean;

  @Column({ type: 'varchar', nullable: true, unique: true })
  email: string | null;

  @Column({ type: 'boolean', default: false, name: 'email_verified' })
  emailVerified: boolean;

  @Column({ type: 'varchar', nullable: true, unique: true, name: 'sso_user_id' })
  ssoUserId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt: Date;
}

export default User;
