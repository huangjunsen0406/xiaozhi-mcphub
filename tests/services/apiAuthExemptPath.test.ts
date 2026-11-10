// The /api auth gate and the auth-gate rate limiter must agree on exactly which
// paths skip the credential check: a path exempt from one but capped by the
// other either breaks login or leaves the auth check brute-forceable.

import { describe, expect, it } from '@jest/globals';

import { isApiAuthExemptPath } from '../../src/services/betterAuthConfig.js';

const defaultRuntime = { basePath: '/api/auth' };

describe('isApiAuthExemptPath', () => {
  it.each([
    ['/auth/login'],
    ['/auth/register'],
    ['/auth/verify-email'],
    ['/auth/forgot-password'],
    ['/auth/verify-reset-token'],
    ['/auth/reset-password'],
  ])('exempts the public auth endpoint %s', (requestPath) => {
    expect(isApiAuthExemptPath(requestPath, defaultRuntime)).toBe(true);
  });

  it('exempts better-auth paths under the default base path', () => {
    expect(isApiAuthExemptPath('/auth/session', defaultRuntime)).toBe(true);
    expect(isApiAuthExemptPath('/auth', defaultRuntime)).toBe(true);
  });

  it('always exempts the legacy /better-auth prefix', () => {
    expect(isApiAuthExemptPath('/better-auth/session', defaultRuntime)).toBe(true);
  });

  it('uses the configured better-auth base path when it is not under /api', () => {
    expect(isApiAuthExemptPath('/auth/login', { basePath: '/sso' })).toBe(true);
    expect(isApiAuthExemptPath('/sso/callback', { basePath: '/sso' })).toBe(false);
  });

  it.each([['/servers'], ['/settings'], ['/auth/user'], ['/auth/login/extra'], ['/logs/stream']])(
    'does not exempt the protected path %s',
    (requestPath) => {
      expect(isApiAuthExemptPath(requestPath, { basePath: '/oauth2' })).toBe(false);
    },
  );
});
