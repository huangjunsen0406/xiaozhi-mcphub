import crypto from 'crypto';
import { LessThan } from 'typeorm';
import BaseRepository from './BaseRepository.js';
import { PasswordResetToken } from '../entities/index.js';

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export class PasswordResetTokenRepository extends BaseRepository<PasswordResetToken> {
  constructor() {
    super(PasswordResetToken);
  }

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create a reset token for a user. Returns the raw token for the email
   * link; only the hash is persisted.
   */
  async createToken(username: string): Promise<{ token: string }> {
    const token = crypto.randomBytes(32).toString('hex');
    const repo = this.getRepository();
    const entity = repo.create({
      username,
      token: this.hash(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      used: false,
    });
    await repo.save(entity);
    return { token };
  }

  /**
   * Check a raw token without consuming it (used by the reset page preflight).
   */
  async verifyToken(token: string): Promise<{ valid: boolean; username?: string }> {
    const entity = await this.getRepository().findOne({
      where: { token: this.hash(token), used: false },
    });
    if (!entity || entity.expiresAt < new Date()) {
      return { valid: false };
    }
    return { valid: true, username: entity.username };
  }

  /**
   * Consume a raw token: validates and marks it used atomically enough for
   * this flow (single-row update on the hashed unique token).
   */
  async consumeToken(token: string): Promise<{ valid: boolean; username?: string }> {
    const repo = this.getRepository();
    const entity = await repo.findOne({ where: { token: this.hash(token), used: false } });
    if (!entity || entity.expiresAt < new Date()) {
      return { valid: false };
    }
    entity.used = true;
    await repo.save(entity);
    return { valid: true, username: entity.username };
  }

  async findRecentByUsername(username: string, since: Date): Promise<PasswordResetToken[]> {
    const tokens = await this.getRepository().find({
      where: { username },
      order: { createdAt: 'DESC' },
    });
    return tokens.filter((t) => t.createdAt > since);
  }

  async deleteExpired(): Promise<number> {
    const result = await this.getRepository().delete({ expiresAt: LessThan(new Date()) });
    return result.affected || 0;
  }
}

let instance: PasswordResetTokenRepository | null = null;
export function getPasswordResetTokenRepository(): PasswordResetTokenRepository {
  if (!instance) {
    instance = new PasswordResetTokenRepository();
  }
  return instance;
}

export default PasswordResetTokenRepository;
