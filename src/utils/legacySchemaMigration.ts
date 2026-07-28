import { DataSource } from 'typeorm';

/** Legacy resources without an owner are attributed to the default admin account. */
const LEGACY_OWNER = 'admin';

/**
 * One-shot schema upgrades for installs that started on xiaozhi-mcphub v1.0.x
 * (notably 1.0.3) and jump to 1.1.x.
 *
 * Critical change: MCP server rows lived in `mcp_servers` (name PK). 1.1.x uses
 * `servers` (uuid PK + unique (owner, name)). TypeORM synchronize creates the
 * new empty table and never copies legacy rows, so upgraded users lose every
 * server unless we move them here.
 *
 * Also normalizes a few shared tables that changed column naming / nullability
 * between those releases.
 */

export type LegacySchemaMigrationResult = {
  serversCopied: number;
  serversSkipped: number;
  endpointOwnersBackfilled: number;
  groupOwnersBackfilled: number;
  userAdminColumnAligned: boolean;
  systemConfigColumnsAligned: boolean;
  /** Existing rows in `users` after column alignment (0 means empty / new install). */
  existingUserCount: number;
  /** Whether an `admin` username row is present in `users`. */
  adminUserPresent: boolean;
};

type LegacyMcpServerRow = {
  name: string;
  type: string | null;
  url: string | null;
  command: string | null;
  args: string | null;
  env: string | null;
  headers: string | null;
  enabled: boolean | null;
  owner: string | null;
  keep_alive_interval: number | null;
  tools: string | null;
  prompts: string | null;
  options: string | null;
  openapi: string | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

const tableExists = async (dataSource: DataSource, tableName: string): Promise<boolean> => {
  const rows = await dataSource.query(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = $1
    ) AS exists
    `,
    [tableName],
  );
  return Boolean(rows?.[0]?.exists);
};

const columnExists = async (
  dataSource: DataSource,
  tableName: string,
  columnName: string,
): Promise<boolean> => {
  const rows = await dataSource.query(
    `
    SELECT EXISTS (
      SELECT FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
    ) AS exists
    `,
    [tableName, columnName],
  );
  return Boolean(rows?.[0]?.exists);
};

const resolveOwner = (owner: string | null | undefined): string => {
  if (owner === null || owner === undefined) {
    return LEGACY_OWNER;
  }
  const trimmed = String(owner).trim();
  return trimmed.length > 0 ? trimmed : LEGACY_OWNER;
};

const toTimestamp = (value: Date | string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Parse a legacy simple-json / json / simple-array cell into a JS value.
 */
const parseLegacyJson = <T>(value: unknown, fallback: T): T => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'object') {
    return value as T;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return fallback;
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      // simple-array historically stored comma-separated values
      return trimmed.split(',').map((part) => part.trim()).filter(Boolean) as T;
    }
  }
  return fallback;
};

/**
 * Copy `mcp_servers` → `servers` when the legacy table still has rows that are
 * missing from the new table. Idempotent: rows already present for the same
 * (owner, name) are skipped. Legacy table is left in place as a backup.
 *
 * Uses the TypeORM Server repository so column naming matches synchronize.
 */
export async function migrateMcpServersTable(
  dataSource: DataSource,
): Promise<Pick<LegacySchemaMigrationResult, 'serversCopied' | 'serversSkipped'>> {
  const result = { serversCopied: 0, serversSkipped: 0 };

  if (!(await tableExists(dataSource, 'mcp_servers'))) {
    return result;
  }
  if (!(await tableExists(dataSource, 'servers'))) {
    console.warn(
      '[legacy-schema] mcp_servers found but servers table is missing; skipping server copy',
    );
    return result;
  }

  const legacyRows: LegacyMcpServerRow[] = await dataSource.query(
    `SELECT * FROM mcp_servers ORDER BY created_at ASC NULLS LAST, name ASC`,
  );

  if (!legacyRows.length) {
    console.log('[legacy-schema] mcp_servers is empty; nothing to copy');
    return result;
  }

  // Recovery path for installs that already jumped to 1.1.x: the old table is
  // often still present with the real server configs while `servers` is empty
  // or only partially re-created. Copy any missing (owner, name) pairs.
  console.log(
    `[legacy-schema] Found legacy mcp_servers with ${legacyRows.length} row(s); ` +
      'copying any missing servers into the 1.1.x `servers` table (idempotent recovery)…',
  );

  // Entity import is local to avoid pulling DAO/migration graphs at module load.
  const serverModule = await import('../db/entities/Server.js');
  const ServerEntity = serverModule.default ?? serverModule.Server;
  const repository = dataSource.getRepository(ServerEntity);

  for (const row of legacyRows) {
    if (!row?.name) {
      result.serversSkipped += 1;
      continue;
    }

    const owner = resolveOwner(row.owner);
    const existing = await repository
      .createQueryBuilder('server')
      .where('server.name = :name', { name: row.name })
      .andWhere(
        '(server.owner = :owner OR (:owner = :legacy AND (server.owner IS NULL OR server.owner = :empty)))',
        { owner, legacy: LEGACY_OWNER, empty: '' },
      )
      .getOne();

    if (existing) {
      result.serversSkipped += 1;
      continue;
    }

    const enabled = row.enabled === null || row.enabled === undefined ? true : Boolean(row.enabled);
    const entity = repository.create({
      name: row.name,
      type: row.type ?? undefined,
      url: row.url ?? undefined,
      command: row.command ?? undefined,
      args: parseLegacyJson<string[] | undefined>(row.args, undefined),
      env: parseLegacyJson<Record<string, string> | undefined>(row.env, undefined),
      headers: parseLegacyJson<Record<string, string> | undefined>(row.headers, undefined),
      enabled,
      owner,
      visibility: 'private',
      enableKeepAlive: false,
      keepAliveInterval: row.keep_alive_interval ?? undefined,
      tools: parseLegacyJson(row.tools, undefined),
      prompts: parseLegacyJson(row.prompts, undefined),
      options: parseLegacyJson(row.options, undefined),
      openapi: parseLegacyJson(row.openapi, undefined),
    });

    // Preserve original timestamps when the driver/column allows assignment.
    const createdAt = toTimestamp(row.created_at);
    const updatedAt = toTimestamp(row.updated_at) ?? createdAt;
    if (createdAt) {
      entity.createdAt = createdAt;
    }
    if (updatedAt) {
      entity.updatedAt = updatedAt;
    }

    await repository.save(entity);
    result.serversCopied += 1;
    console.log(`  - migrated server: ${row.name} (owner=${owner})`);
  }

  console.log(
    `[legacy-schema] mcp_servers migration done: copied=${result.serversCopied}, skipped=${result.serversSkipped}`,
  );
  return result;
}

/**
 * Attribute empty group owners to admin (groups table name is stable).
 */
export async function backfillGroupOwners(dataSource: DataSource): Promise<number> {
  if (!(await tableExists(dataSource, 'groups'))) {
    return 0;
  }
  if (!(await columnExists(dataSource, 'groups', 'owner'))) {
    await dataSource.query(`ALTER TABLE groups ADD COLUMN IF NOT EXISTS owner character varying`);
  }

  const nullCountRows = await dataSource.query(
    `
    SELECT COUNT(*)::int AS count
    FROM groups
    WHERE owner IS NULL OR owner = ''
    `,
  );
  const pending = Number(nullCountRows?.[0]?.count ?? 0);
  if (pending === 0) {
    return 0;
  }

  await dataSource.query(
    `
    UPDATE groups
    SET owner = $1
    WHERE owner IS NULL OR owner = ''
    `,
    [LEGACY_OWNER],
  );
  return pending;
}

/**
 * v1.0.3 stored users.is_admin; some 1.1 builds briefly used "isAdmin".
 * Prefer the snake_case column and copy data if a camelCase leftover exists.
 */
export async function alignUserAdminColumn(dataSource: DataSource): Promise<boolean> {
  if (!(await tableExists(dataSource, 'users'))) {
    return false;
  }

  const hasSnake = await columnExists(dataSource, 'users', 'is_admin');
  const hasCamel = await columnExists(dataSource, 'users', 'isAdmin');

  if (!hasSnake && hasCamel) {
    await dataSource.query(
      `ALTER TABLE users RENAME COLUMN "isAdmin" TO is_admin`,
    );
    console.log('[legacy-schema] renamed users."isAdmin" → is_admin');
    return true;
  }

  if (hasSnake && hasCamel) {
    await dataSource.query(
      `
      UPDATE users
      SET is_admin = COALESCE(is_admin, "isAdmin", false)
      `,
    );
    await dataSource.query(`ALTER TABLE users DROP COLUMN IF EXISTS "isAdmin"`);
    console.log('[legacy-schema] merged users."isAdmin" into is_admin and dropped camelCase column');
    return true;
  }

  if (!hasSnake) {
    await dataSource.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false`,
    );
    console.log('[legacy-schema] added users.is_admin column');
    return true;
  }

  return false;
}

/**
 * Make legacy `users` safe for TypeORM synchronize before it runs.
 *
 * 1.1.x entities added optional email / email_verified / sso_user_id. If those
 * columns are missing, synchronize would ADD them — fine for nullable ones, but
 * a botched length rebuild of username/password previously used DROP+ADD NOT NULL
 * and failed with "column username contains null values" on existing admin rows.
 *
 * This helper:
 * - adds missing nullable 1.1 columns with safe defaults (never rebuilds username)
 * - never drops or recreates username/password
 *
 * Must run with synchronize:false (or before the first synchronize on a fresh
 * DataSource that still has the legacy column shapes).
 */
export async function prepareUsersTableForSync(dataSource: DataSource): Promise<boolean> {
  if (!(await tableExists(dataSource, 'users'))) {
    return false;
  }

  let changed = false;

  // Ensure core identity columns exist (they should on every real install).
  // Do NOT touch length / NOT NULL — leave whatever v1.0.3 created.
  if (!(await columnExists(dataSource, 'users', 'username'))) {
    throw new Error(
      '[legacy-schema] users.username is missing; cannot upgrade this database automatically',
    );
  }
  if (!(await columnExists(dataSource, 'users', 'password'))) {
    throw new Error(
      '[legacy-schema] users.password is missing; cannot upgrade this database automatically',
    );
  }

  // Refuse to proceed if username already has nulls (would break any NOT NULL rebuild).
  const nullUsernames = await dataSource.query(
    `SELECT COUNT(*)::int AS count FROM users WHERE username IS NULL`,
  );
  const nullCount = Number(nullUsernames?.[0]?.count ?? 0);
  if (nullCount > 0) {
    throw new Error(
      `[legacy-schema] users.username has ${nullCount} NULL row(s); fix or delete them before upgrading`,
    );
  }

  if (!(await columnExists(dataSource, 'users', 'email'))) {
    await dataSource.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS email character varying`,
    );
    console.log('[legacy-schema] added users.email');
    changed = true;
  }

  if (!(await columnExists(dataSource, 'users', 'email_verified'))) {
    await dataSource.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false`,
    );
    console.log('[legacy-schema] added users.email_verified');
    changed = true;
  }

  if (!(await columnExists(dataSource, 'users', 'sso_user_id'))) {
    await dataSource.query(
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS sso_user_id character varying`,
    );
    console.log('[legacy-schema] added users.sso_user_id');
    changed = true;
  }

  // is_admin alignment is shared with the post-sync path
  if (await alignUserAdminColumn(dataSource)) {
    changed = true;
  }

  return changed;
}

/**
 * Pre-synchronize repairs that must run BEFORE TypeORM synchronize, because
 * synchronize can DROP+ADD columns when metadata (e.g. varchar length) drifts
 * from the live schema — fatal on tables that already have rows.
 *
 * Connects with synchronize:false, patches legacy shapes, then disconnects so
 * the normal initialize path can open with synchronize:true safely.
 */
export async function prepareLegacySchemaBeforeSynchronize(
  databaseUrl: string,
): Promise<void> {
  if (!databaseUrl) {
    return;
  }

  console.log('[legacy-schema] Pre-synchronize safety pass on legacy tables…');

  const preSync = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    synchronize: false,
    entities: [],
  });

  try {
    await preSync.initialize();

    // uuid-ossp may be needed later; cheap and idempotent
    try {
      await preSync.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    } catch (err: any) {
      console.warn('[legacy-schema] uuid-ossp extension note:', err?.message || err);
    }

    await prepareUsersTableForSync(preSync);

    // groups.servers was nullable json in v1.0.3; ensure column exists without
    // forcing NOT NULL so synchronize will not rebuild it over existing rows.
    if (await tableExists(preSync, 'groups')) {
      if (!(await columnExists(preSync, 'groups', 'owner'))) {
        await preSync.query(
          `ALTER TABLE groups ADD COLUMN IF NOT EXISTS owner character varying`,
        );
        console.log('[legacy-schema] added groups.owner before synchronize');
      }
    }

    console.log('[legacy-schema] Pre-synchronize safety pass complete');
  } finally {
    if (preSync.isInitialized) {
      await preSync.destroy();
    }
  }
}

/**
 * Ensure system_config keeps the v1.0.3 snake_case JSON columns that TypeORM
 * may have also created under camelCase when column names were omitted.
 *
 * IMPORTANT: only merge when snake !== camel. Calling merge with the same name
 * (e.g. modelscope/modelscope) treats one real column as both sides, then
 * DROP COLUMN "modelscope" deletes the only copy — which is exactly the
 * "column SystemConfig.modelscope does not exist" failure seen on 1.1.4.
 */
export async function alignSystemConfigColumns(dataSource: DataSource): Promise<boolean> {
  if (!(await tableExists(dataSource, 'system_config'))) {
    return false;
  }

  let changed = false;

  const mergeJsonColumn = async (snake: string, camel: string): Promise<void> => {
    // Same physical name → nothing to rename/merge; never DROP it.
    if (snake === camel) {
      return;
    }

    const hasSnake = await columnExists(dataSource, 'system_config', snake);
    const hasCamel = await columnExists(dataSource, 'system_config', camel);

    if (!hasSnake && hasCamel) {
      await dataSource.query(
        `ALTER TABLE system_config RENAME COLUMN "${camel}" TO ${snake}`,
      );
      console.log(`[legacy-schema] renamed system_config."${camel}" → ${snake}`);
      changed = true;
      return;
    }

    if (hasSnake && hasCamel) {
      await dataSource.query(
        `
        UPDATE system_config
        SET ${snake} = COALESCE(${snake}, "${camel}")
        WHERE ${snake} IS NULL AND "${camel}" IS NOT NULL
        `,
      );
      await dataSource.query(
        `ALTER TABLE system_config DROP COLUMN IF EXISTS "${camel}"`,
      );
      console.log(
        `[legacy-schema] merged system_config."${camel}" into ${snake} and dropped camelCase column`,
      );
      changed = true;
    }
  };

  // Only pairs where the DB name differs from a possible TypeORM default.
  await mergeJsonColumn('smart_routing', 'smartRouting');
  await mergeJsonColumn('mcp_router', 'mcpRouter');
  // modelscope is already the entity column name (name: 'modelscope') — do not
  // "merge" it with itself. Just ensure it exists (recovery for 1.1.4 damage).
  if (await ensureSystemConfigColumn(dataSource, 'modelscope', 'text')) {
    changed = true;
  }

  // Other 1.1 columns the entity selects; ADD IF NOT EXISTS so a partial
  // upgrade / botched drop cannot leave SELECTs broken.
  const optionalJsonColumns = [
    'routing',
    'install',
    'smart_routing',
    'toolResultCompression',
    'mcp_router',
    'email',
    'oauth',
    'oauthServer',
    'auth',
    'discovery',
    'activityLog',
  ];
  for (const col of optionalJsonColumns) {
    if (await ensureSystemConfigColumn(dataSource, col, 'text')) {
      changed = true;
    }
  }
  if (await ensureSystemConfigColumn(dataSource, 'nameSeparator', 'character varying(10)')) {
    changed = true;
  }
  if (await ensureSystemConfigColumn(dataSource, 'enableSessionRebuild', 'boolean')) {
    changed = true;
  }

  return changed;
}

/**
 * Add a missing system_config column (nullable). Idempotent.
 * Used both for normal upgrades and to repair columns dropped by the
 * modelscope self-merge bug in 1.1.4.
 */
export async function ensureSystemConfigColumn(
  dataSource: DataSource,
  columnName: string,
  pgType: string,
): Promise<boolean> {
  if (!(await tableExists(dataSource, 'system_config'))) {
    return false;
  }
  if (await columnExists(dataSource, 'system_config', columnName)) {
    return false;
  }
  // Quote identifiers that are mixed-case so Postgres preserves them.
  const quoted = /[A-Z]/.test(columnName) ? `"${columnName}"` : columnName;
  await dataSource.query(
    `ALTER TABLE system_config ADD COLUMN IF NOT EXISTS ${quoted} ${pgType}`,
  );
  console.log(`[legacy-schema] added system_config.${columnName} (${pgType})`);
  return true;
}

/**
 * Report how many users (and whether admin) already live in the shared `users`
 * table. Passwords are bcrypt hashes stored in-place — there is nothing to
 * "migrate" for admin credentials when reconnecting to a v1.0.3 database.
 */
export async function inspectLegacyUsers(dataSource: DataSource): Promise<{
  existingUserCount: number;
  adminUserPresent: boolean;
}> {
  if (!(await tableExists(dataSource, 'users'))) {
    return { existingUserCount: 0, adminUserPresent: false };
  }

  const countRows = await dataSource.query(`SELECT COUNT(*)::int AS count FROM users`);
  const existingUserCount = Number(countRows?.[0]?.count ?? 0);
  const adminRows = await dataSource.query(
    `SELECT 1 FROM users WHERE username = $1 LIMIT 1`,
    ['admin'],
  );
  const adminUserPresent = Array.isArray(adminRows) && adminRows.length > 0;

  if (existingUserCount > 0) {
    console.log(
      `[legacy-schema] Reusing ${existingUserCount} existing user(s) from the database` +
        (adminUserPresent
          ? ' (including admin). Keep the password you set before the upgrade — ' +
            'the random password printed during a failed 1.1.x boot only applied to ' +
            'an empty file-mode install and is NOT written back over this row.'
          : '.') ,
    );
  } else {
    console.log(
      '[legacy-schema] users table is empty; a default admin will be created on first boot if needed',
    );
  }

  return { existingUserCount, adminUserPresent };
}

/**
 * Run all v1.0.x → 1.1.x in-place schema upgrades. Safe to call on every boot.
 */
export async function runLegacySchemaMigrations(
  dataSource: DataSource,
): Promise<LegacySchemaMigrationResult> {
  console.log('[legacy-schema] Checking for v1.0.x → 1.1.x upgrades…');

  const userAdminColumnAligned = await alignUserAdminColumn(dataSource);
  const systemConfigColumnsAligned = await alignSystemConfigColumns(dataSource);
  const { existingUserCount, adminUserPresent } = await inspectLegacyUsers(dataSource);
  const serverCopy = await migrateMcpServersTable(dataSource);

  // Count endpoint owner backfill more reliably than driver rowCount
  let endpointOwnersBackfilled = 0;
  if (await tableExists(dataSource, 'xiaozhi_endpoints')) {
    if (!(await columnExists(dataSource, 'xiaozhi_endpoints', 'owner'))) {
      await dataSource.query(
        `ALTER TABLE xiaozhi_endpoints ADD COLUMN IF NOT EXISTS owner character varying`,
      );
      console.log('[legacy-schema] added xiaozhi_endpoints.owner column');
    }
    const pending = await dataSource.query(
      `
      SELECT COUNT(*)::int AS count
      FROM xiaozhi_endpoints
      WHERE owner IS NULL OR owner = ''
      `,
    );
    endpointOwnersBackfilled = Number(pending?.[0]?.count ?? 0);
    if (endpointOwnersBackfilled > 0) {
      await dataSource.query(
        `
        UPDATE xiaozhi_endpoints
        SET owner = $1
        WHERE owner IS NULL OR owner = ''
        `,
        [LEGACY_OWNER],
      );
      console.log(
        `[legacy-schema] backfilled owner on ${endpointOwnersBackfilled} xiaozhi endpoint(s)`,
      );
    }
  }

  const groupOwnersBackfilled = await backfillGroupOwners(dataSource);
  if (groupOwnersBackfilled > 0) {
    console.log(`[legacy-schema] backfilled owner on ${groupOwnersBackfilled} group(s)`);
  }

  const summary: LegacySchemaMigrationResult = {
    serversCopied: serverCopy.serversCopied,
    serversSkipped: serverCopy.serversSkipped,
    endpointOwnersBackfilled,
    groupOwnersBackfilled,
    userAdminColumnAligned,
    systemConfigColumnsAligned,
    existingUserCount,
    adminUserPresent,
  };

  console.log(
    `[legacy-schema] Done: serversCopied=${summary.serversCopied}, serversSkipped=${summary.serversSkipped}, ` +
      `endpointOwners=${summary.endpointOwnersBackfilled}, groupOwners=${summary.groupOwnersBackfilled}, ` +
      `users=${summary.existingUserCount}, adminPresent=${summary.adminUserPresent}`,
  );

  return summary;
}
