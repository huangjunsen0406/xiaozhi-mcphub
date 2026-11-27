import {
  bearerKeyMatches,
  bearerTokenPrefix,
  hashBearerToken,
  maskBearerKey,
  toStoredToken,
} from '../../src/utils/bearerKeyToken.js';
import type { BearerKey } from '../../src/types/index.js';

describe('Bearer key token hashing and masking (#1387)', () => {
  it('hashes tokens with SHA-256 and caps displayed prefix at 1/3 of length', () => {
    const token = 'mcphub_' + 'a'.repeat(64);
    const stored = toStoredToken(token);
    expect(stored.tokenHash).toBe(hashBearerToken(token));
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.tokenPrefix).toBe('mcphub_aaaaa');
    expect(bearerTokenPrefix('short')).toBe('s');
  });

  it('matches both hashed keys and unmigrated plaintext legacy keys in constant time', () => {
    const token = 'mcphub_secret_token_value_1234567890';
    const hashedKey: BearerKey = {
      id: 'k1',
      name: 'hashed',
      ...toStoredToken(token),
      enabled: true,
      kind: 'system',
      accessType: 'all',
    };
    const legacyKey: BearerKey = {
      id: 'k2',
      name: 'legacy',
      token,
      enabled: true,
      kind: 'system',
      accessType: 'all',
    };

    expect(bearerKeyMatches(hashedKey, token)).toBe(true);
    expect(bearerKeyMatches(hashedKey, 'wrong')).toBe(false);
    expect(bearerKeyMatches(legacyKey, token)).toBe(true);
    expect(bearerKeyMatches(legacyKey, 'wrong')).toBe(false);
  });

  it('masks keys without exposing short plaintext secrets', () => {
    expect(maskBearerKey({ tokenPrefix: 'mcphub_abcde' })).toBe('mcphub_abcde...');
    expect(maskBearerKey({ token: 'short' })).toBe('********');
    expect(maskBearerKey({ token: 'mcphub_1234567890abcdef' })).toBe('mcphub_12345...');
  });
});
