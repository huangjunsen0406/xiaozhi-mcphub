import { jest } from '@jest/globals';

type QueryFn = (sql: string, params?: unknown[]) => Promise<any>;

function createDataSourceMock(handler: QueryFn) {
  const save = jest.fn(async (entity: any) => entity);
  const create = jest.fn((data: any) => ({ ...data }));
  const getOne = jest.fn(async () => null);
  const andWhere = jest.fn(() => ({ getOne }));
  const where = jest.fn(() => ({ andWhere }));
  const createQueryBuilder = jest.fn(() => ({ where }));

  return {
    query: jest.fn(handler) as unknown as jest.MockedFunction<QueryFn>,
    getRepository: jest.fn(() => ({
      create,
      save,
      createQueryBuilder,
    })),
    _repo: { save, create, getOne, andWhere, where, createQueryBuilder },
  };
}

describe('legacySchemaMigration', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it('prepareUsersTableForSync adds missing 1.1 columns without touching username', async () => {
    const executed: string[] = [];
    const dataSource = createDataSourceMock(async (sql: string, params?: unknown[]) => {
      executed.push(sql.replace(/\s+/g, ' ').trim());
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('information_schema.tables')) {
        return [{ exists: true }];
      }
      if (normalized.includes('information_schema.columns')) {
        const col = params?.[1];
        // Core v1.0.3 columns present; 1.1 extras missing; is_admin present
        if (col === 'username' || col === 'password' || col === 'is_admin') {
          return [{ exists: true }];
        }
        return [{ exists: false }];
      }
      if (normalized.includes('username is null')) {
        return [{ count: 0 }];
      }
      return [];
    });

    const { prepareUsersTableForSync } = await import('./legacySchemaMigration.js');
    const changed = await prepareUsersTableForSync(dataSource as any);
    expect(changed).toBe(true);

    const joined = executed.join('\n').toLowerCase();
    expect(joined).toContain('add column if not exists email');
    expect(joined).toContain('add column if not exists email_verified');
    expect(joined).toContain('add column if not exists sso_user_id');
    // Must never drop/recreate username
    expect(joined).not.toMatch(/drop column.*username|add column.*username/);
  });

  it('prepareUsersTableForSync throws when username has nulls', async () => {
    const dataSource = createDataSourceMock(async (sql: string, params?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('information_schema.tables')) {
        return [{ exists: true }];
      }
      if (normalized.includes('information_schema.columns')) {
        const col = params?.[1];
        if (col === 'username' || col === 'password') return [{ exists: true }];
        return [{ exists: false }];
      }
      if (normalized.includes('username is null')) {
        return [{ count: 1 }];
      }
      return [];
    });

    const { prepareUsersTableForSync } = await import('./legacySchemaMigration.js');
    await expect(prepareUsersTableForSync(dataSource as any)).rejects.toThrow(/NULL row/);
  });

  it('copies mcp_servers rows into servers via repository when missing', async () => {
    const dataSource = createDataSourceMock(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('information_schema.tables') && normalized.includes('table_name')) {
        // tableExists for mcp_servers / servers
        return [{ exists: true }];
      }
      if (normalized.includes('from mcp_servers')) {
        return [
          {
            name: 'fetch',
            type: 'stdio',
            url: null,
            command: 'uvx',
            args: '["mcp-server-fetch"]',
            env: null,
            headers: null,
            enabled: true,
            owner: null,
            keep_alive_interval: 30,
            tools: null,
            prompts: null,
            options: null,
            openapi: null,
            created_at: new Date('2024-01-01T00:00:00Z'),
            updated_at: new Date('2024-01-02T00:00:00Z'),
          },
          {
            name: 'playwright',
            type: 'stdio',
            command: 'npx',
            args: '["@playwright/mcp@latest"]',
            enabled: true,
            owner: 'alice',
            keep_alive_interval: null,
            env: null,
            headers: null,
            tools: null,
            prompts: null,
            options: null,
            openapi: null,
            url: null,
            created_at: null,
            updated_at: null,
          },
        ];
      }
      if (normalized.includes('information_schema.columns')) {
        return [{ exists: true }];
      }
      if (normalized.includes('count(*)')) {
        return [{ count: 0 }];
      }
      return [];
    });

    // First existing lookup returns a hit for playwright only on second call via getOne
    dataSource._repo.getOne
      .mockResolvedValueOnce(null) // fetch → copy
      .mockResolvedValueOnce({ id: 'existing' }); // playwright → skip

    const { migrateMcpServersTable } = await import('./legacySchemaMigration.js');
    const result = await migrateMcpServersTable(dataSource as any);

    expect(result).toEqual({ serversCopied: 1, serversSkipped: 1 });
    expect(dataSource._repo.save).toHaveBeenCalledTimes(1);
    expect(dataSource._repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'fetch',
        command: 'uvx',
        args: ['mcp-server-fetch'],
        owner: 'admin',
        visibility: 'private',
        keepAliveInterval: 30,
        enabled: true,
      }),
    );
  });

  it('is a no-op when mcp_servers table is absent', async () => {
    const dataSource = createDataSourceMock(async (sql: string) => {
      if (sql.includes('information_schema.tables')) {
        return [{ exists: false }];
      }
      return [];
    });

    const { migrateMcpServersTable } = await import('./legacySchemaMigration.js');
    const result = await migrateMcpServersTable(dataSource as any);
    expect(result).toEqual({ serversCopied: 0, serversSkipped: 0 });
    expect(dataSource.getRepository).not.toHaveBeenCalled();
  });

  it('runLegacySchemaMigrations backfills endpoint and group owners', async () => {
    const dataSource = createDataSourceMock(async (sql: string, params?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('information_schema.tables')) {
        return [{ exists: true }];
      }
      if (normalized.includes('information_schema.columns')) {
        // owner / is_admin / smart_routing present
        return [{ exists: true }];
      }
      if (normalized.includes('from mcp_servers')) {
        return [];
      }
      if (normalized.includes('count(*)') && normalized.includes('from users')) {
        return [{ count: 1 }];
      }
      if (normalized.includes('from users') && normalized.includes('username')) {
        return [{ '?column?': 1 }];
      }
      if (normalized.includes('count(*)') && normalized.includes('xiaozhi_endpoints')) {
        return [{ count: 2 }];
      }
      if (normalized.includes('count(*)') && normalized.includes('groups')) {
        return [{ count: 1 }];
      }
      if (normalized.startsWith('update ')) {
        return { rowCount: params ? 1 : 0 };
      }
      return [];
    });

    const { runLegacySchemaMigrations } = await import('./legacySchemaMigration.js');
    const summary = await runLegacySchemaMigrations(dataSource as any);

    expect(summary.endpointOwnersBackfilled).toBe(2);
    expect(summary.groupOwnersBackfilled).toBe(1);
    expect(summary.serversCopied).toBe(0);
    expect(summary.existingUserCount).toBe(1);
    expect(summary.adminUserPresent).toBe(true);
  });

  it('alignUserAdminColumn renames camelCase leftover', async () => {
    const dataSource = createDataSourceMock(async (sql: string) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('information_schema.tables')) {
        return [{ exists: true }];
      }
      if (normalized.includes("column_name = $2") || normalized.includes('column_name')) {
        // Sequence of checks: is_admin then isAdmin — inspect params
        return [{ exists: false }];
      }
      return [];
    });

    // More precise columnExists responses via params
    (dataSource.query as any).mockImplementation(async (sql: string, params?: unknown[]) => {
      const normalized = sql.replace(/\s+/g, ' ').toLowerCase();
      if (normalized.includes('information_schema.tables')) {
        return [{ exists: true }];
      }
      if (normalized.includes('information_schema.columns')) {
        const col = params?.[1];
        if (col === 'is_admin') return [{ exists: false }];
        if (col === 'isAdmin') return [{ exists: true }];
        return [{ exists: false }];
      }
      if (normalized.includes('rename column')) {
        return [];
      }
      return [];
    });

    const { alignUserAdminColumn } = await import('./legacySchemaMigration.js');
    const changed = await alignUserAdminColumn(dataSource as any);
    expect(changed).toBe(true);
    expect(
      (dataSource.query as any).mock.calls.some((call: unknown[]) =>
        String(call[0]).includes('RENAME COLUMN'),
      ),
    ).toBe(true);
  });
});
