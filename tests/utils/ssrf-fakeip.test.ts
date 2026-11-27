import {
  assertSafeUrl,
  UnsafeUrlError,
  validateFakeIpExceptions,
} from '../../src/utils/ssrf.js';
import { setCachedSystemConfig } from '../../src/utils/systemConfigCache.js';

describe('SSRF scoped Fake-IP exceptions (#1446)', () => {
  afterEach(() => {
    setCachedSystemConfig(null);
  });

  it('validates fakeIpExceptions rules strictly', () => {
    expect(
      validateFakeIpExceptions([{ serverId: 'srv-1', hostname: 'api.example.com' }]),
    ).toBe(true);
    expect(validateFakeIpExceptions([{ serverId: 'srv-1', hostname: '198.18.0.1' }])).toBe(
      false,
    );
    expect(validateFakeIpExceptions([{ serverId: 'srv-1', hostname: 'API.EXAMPLE.COM' }])).toBe(
      false,
    );
    expect(validateFakeIpExceptions([{ serverId: '', hostname: 'api.example.com' }])).toBe(
      false,
    );
    expect(validateFakeIpExceptions([{ serverId: 'srv-1', hostname: 'localhost' }])).toBe(false);
  });

  it('allows 198.18.0.0/15 only when both serverId and hostname match', async () => {
    setCachedSystemConfig({
      network: {
        fakeIpExceptions: [{ serverId: 'srv-1', hostname: 'api.example.com' }],
      },
    } as any);
    const fakeLookup = async () => ['198.18.1.42'];

    await expect(
      assertSafeUrl('https://api.example.com/mcp', {
        lookup: fakeLookup,
        serverId: 'srv-1',
      }),
    ).resolves.toBe('https://api.example.com/mcp');

    // Wrong serverId must be rejected
    await expect(
      assertSafeUrl('https://api.example.com/mcp', {
        lookup: fakeLookup,
        serverId: 'srv-2',
      }),
    ).rejects.toThrow(UnsafeUrlError);

    // Wrong hostname must be rejected
    await expect(
      assertSafeUrl('https://other.example.com/mcp', {
        lookup: fakeLookup,
        serverId: 'srv-1',
      }),
    ).rejects.toThrow(UnsafeUrlError);

    // Non-Fake-IP private ranges (e.g. 127.0.0.1, 10.0.0.1) remain blocked even when rule matches
    await expect(
      assertSafeUrl('https://api.example.com/mcp', {
        lookup: async () => ['127.0.0.1'],
        serverId: 'srv-1',
      }),
    ).rejects.toThrow(UnsafeUrlError);
  });
});
