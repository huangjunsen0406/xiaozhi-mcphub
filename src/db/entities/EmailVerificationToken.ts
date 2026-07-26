import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One-time token sent to a user's email address to prove ownership.
 * The stored value is a sha256 hash of the token; the raw token only
 * ever appears in the verification link.
 */
@Entity({ name: 'email_verification_tokens' })
export class EmailVerificationToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  token: string; // sha256 hash of the raw token

  @Column({ type: 'varchar', length: 255 })
  @Index()
  username: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @Column({ name: 'is_used', type: 'boolean', default: false })
  isUsed: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt: Date;
}

export default EmailVerificationToken;
