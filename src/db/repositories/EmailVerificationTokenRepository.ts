import crypto from 'crypto';
import BaseRepository from './BaseRepository.js';
import { EmailVerificationToken } from '../entities/index.js';

const TOKEN_TTL_HOURS = 24;

export class EmailVerificationTokenRepository extends BaseRepository<EmailVerificationToken> {
  constructor() {
    super(EmailVerificationToken);
  }

  private hash(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Create a new verification token for a user. Returns the raw token to
   * embed in the verification link; only the hash is persisted.
   */
  async createToken(username: string): Promise<{ token: string }> {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_TTL_HOURS);

    const repo = this.getRepository();
    const entity = repo.create({
      username,
      token: this.hash(token),
      expiresAt,
      isUsed: false,
    });
    await repo.save(entity);

    return { token };
  }

  /**
   * Validate a raw token and mark it used. Single-use, time-limited.
   */
  async verifyToken(token: string): Promise<{ valid: boolean; username?: string }> {
    const repo = this.getRepository();
    const entity = await repo.findOne({ where: { token: this.hash(token) } });

    if (!entity || entity.isUsed || entity.expiresAt < new Date()) {
      return { valid: false };
    }

    entity.isUsed = true;
    await repo.save(entity);

    return { valid: true, username: entity.username };
  }

  async findRecentByUsername(username: string, since: Date): Promise<EmailVerificationToken[]> {
    const tokens = await this.getRepository().find({
      where: { username },
      order: { createdAt: 'DESC' },
    });
    return tokens.filter((t) => t.createdAt > since);
  }

  async deleteExpired(): Promise<void> {
    await this.getRepository()
      .createQueryBuilder()
      .delete()
      .where('expires_at < :now', { now: new Date() })
      .execute();
  }
}

let instance: EmailVerificationTokenRepository | null = null;
export function getEmailVerificationTokenRepository(): EmailVerificationTokenRepository {
  if (!instance) {
    instance = new EmailVerificationTokenRepository();
  }
  return instance;
}

export default EmailVerificationTokenRepository;
