import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';

const isTestEnv =
  process.env.NODE_ENV === 'test' ||
  process.env.JEST_WORKER_ID !== undefined ||
  process.env.VITEST_WORKER_ID !== undefined;

export const createStandardRateLimiter = (options: {
  windowMs: number;
  max: number;
  skipSuccessfulRequests?: boolean;
  skip?: (request: Request, response: Response) => boolean | Promise<boolean>;
}) => {
  const { skip, ...rest } = options;

  return rateLimit({
    ...rest,
    standardHeaders: true,
    legacyHeaders: false,
    // A caller-provided `skip` (e.g. path exemptions) is combined with the
    // built-in test skip.
    skip: (request, response) =>
      isTestEnv || (skip !== undefined && skip(request, response)),
    // The rest of the API answers with JSON; without this the 429 body is bare
    // text, so clients that parse the response as JSON lose the error entirely.
    message: { success: false, message: 'Too many requests, please try again later.' },
  });
};

export const templateRateLimiter = createStandardRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 200,
});

export const authenticatedRouteRateLimiter = createStandardRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 600,
});

// Rate-limit gate mounted ahead of the shared `/api` authorization middleware in
// src/middlewares/index.ts. Without it, failed-auth requests answer 401 before
// any route-level limiter runs, leaving the auth check itself uncapped and
// brute-forceable (CodeQL js/missing-rate-limiting). It shares the
// authenticated-route budget and skips the public auth routes that carry their
// own limiters, so those keep using their dedicated budgets.
export const apiAuthGateRateLimiter = createStandardRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 600,
  skip: async (req) => {
    const { getBetterAuthRuntimeConfig, isApiAuthExemptPath } = await import(
      '../services/betterAuthConfig.js'
    );
    const betterAuthConfig = await getBetterAuthRuntimeConfig();
    return isApiAuthExemptPath(req.path, betterAuthConfig);
  },
});

export const hostedInternalEventRateLimiter = createStandardRateLimiter({
  windowMs: 60 * 1000,
  max: 600,
});

// Brute-force protection for credential attempts: only failed logins should
// consume the budget. Counting successes adds no protection but locks out
// legitimate clients with no session (API consumers and service accounts
// re-authenticate on every token expiry, and a burst of renewals exhausts the
// window).
export const authAttemptRateLimiter = createStandardRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  skipSuccessfulRequests: true,
});

// /auth/register creates an account on success, so this limiter deliberately
// counts every request -- successes are the thing being capped. It stays
// separate from the login limiter so the two cannot exhaust each other.
export const authRegistrationRateLimiter = createStandardRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
});

// Token-based email flows (verify / reset) keep their own shared budget.
export const authPublicRateLimiter = createStandardRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
});

export const mcpConnectionRateLimiter = createStandardRateLimiter({
  windowMs: 60 * 1000,
  max: 480,
});
