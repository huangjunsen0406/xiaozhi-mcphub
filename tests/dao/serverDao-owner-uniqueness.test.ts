import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ServerDaoImpl } from '../../src/dao/ServerDao.js';

/**
 * In-memory settings bag so ServerDaoImpl can exercise per-owner uniqueness
 * without touching disk.
 */
const createMemoryDao = () => {
  let settings: any = { mcpServers: {} };
  const dao = new ServerDaoImpl();
  (dao as any).loadSettings = jest.fn(async () => settings);
  (dao as any).saveSettings = jest.fn(async (next: any) => {
    settings = next;
  });
  return {
    dao,
    getSettings: () => settings,
  };
};

describe('ServerDao owner-scoped uniqueness', () => {
  let dao: ServerDaoImpl;

  beforeEach(() => {
    ({ dao } = createMemoryDao());
  });

  it('allows two different owners to create servers with the same name', async () => {
    await dao.create({
      name: 'amap',
      owner: 'alice',
      type: 'sse',
      url: 'https://example.com/a',
      enabled: true,
    });
    await dao.create({
      name: 'amap',
      owner: 'bob',
      type: 'sse',
      url: 'https://example.com/b',
      enabled: true,
    });

    const all = await dao.findAll();
    expect(all.filter((s) => s.name === 'amap')).toHaveLength(2);
    expect(await dao.findByOwnerAndName('alice', 'amap')).toEqual(
      expect.objectContaining({ owner: 'alice', url: 'https://example.com/a' }),
    );
    expect(await dao.findByOwnerAndName('bob', 'amap')).toEqual(
      expect.objectContaining({ owner: 'bob', url: 'https://example.com/b' }),
    );
  });

  it('rejects a second create with the same (owner, name)', async () => {
    await dao.create({
      name: 'amap',
      owner: 'alice',
      type: 'sse',
      url: 'https://example.com/a',
      enabled: true,
    });

    await expect(
      dao.create({
        name: 'amap',
        owner: 'alice',
        type: 'sse',
        url: 'https://example.com/a2',
        enabled: true,
      }),
    ).rejects.toThrow(/already exists/i);
  });

  it('deletes only the requested owner instance', async () => {
    await dao.create({
      name: 'amap',
      owner: 'alice',
      type: 'sse',
      url: 'https://example.com/a',
      enabled: true,
    });
    await dao.create({
      name: 'amap',
      owner: 'bob',
      type: 'sse',
      url: 'https://example.com/b',
      enabled: true,
    });

    await expect(dao.deleteByOwnerAndName('alice', 'amap')).resolves.toBe(true);
    expect(await dao.findByOwnerAndName('alice', 'amap')).toBeNull();
    expect(await dao.findByOwnerAndName('bob', 'amap')).toEqual(
      expect.objectContaining({ owner: 'bob' }),
    );
  });

  it('renames within the same owner without colliding with another user', async () => {
    await dao.create({
      name: 'amap',
      owner: 'alice',
      type: 'sse',
      url: 'https://example.com/a',
      enabled: true,
    });
    await dao.create({
      name: 'maps',
      owner: 'bob',
      type: 'sse',
      url: 'https://example.com/b',
      enabled: true,
    });

    // Alice renames amap -> maps; bob already has maps — allowed (different owners)
    await expect(dao.rename('amap', 'maps')).resolves.toBe(true);
    expect(await dao.findByOwnerAndName('alice', 'maps')).toEqual(
      expect.objectContaining({ owner: 'alice' }),
    );
    expect(await dao.findByOwnerAndName('bob', 'maps')).toEqual(
      expect.objectContaining({ owner: 'bob' }),
    );
  });
});
