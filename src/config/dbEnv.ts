/**
 * Database environment helpers.
 *
 * v1.0.x used DATABASE_URL; v1.1+ standardizes on DB_URL.
 * Keep a read-only fallback so Docker Compose upgrades do not silently
 * fall back to JSON file mode and drop servers / Xiaozhi endpoints.
 */

let databaseUrlDeprecationWarned = false;

/**
 * Resolve the effective PostgreSQL connection string from the environment.
 * Prefer DB_URL; fall back to legacy DATABASE_URL with a one-time warning.
 */
export function getDatabaseUrlFromEnv(): string | undefined {
  const current = trimEnv(process.env.DB_URL);
  if (current) {
    return current;
  }

  const legacy = trimEnv(process.env.DATABASE_URL);
  if (legacy) {
    if (!databaseUrlDeprecationWarned) {
      databaseUrlDeprecationWarned = true;
      console.warn(
        '[DEPRECATED] DATABASE_URL is deprecated since 1.1.x; use DB_URL instead. ' +
          'Accepting DATABASE_URL for backward compatibility with v1.0.3 installs.',
      );
    }
    return legacy;
  }

  return undefined;
}

/**
 * Whether the process should run in database-backed mode.
 * USE_DB wins when set; otherwise any resolved DB URL enables DB mode.
 */
export function isDatabaseModeEnabled(): boolean {
  if (process.env.USE_DB !== undefined) {
    return process.env.USE_DB === 'true';
  }
  return Boolean(getDatabaseUrlFromEnv());
}

/** Test-only: reset one-time deprecation warning state. */
export function resetDatabaseUrlDeprecationWarningForTests(): void {
  databaseUrlDeprecationWarned = false;
}

function trimEnv(value: string | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
