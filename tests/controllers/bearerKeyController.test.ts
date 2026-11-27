import { Request, Response } from 'express';

const mockFindAll = jest.fn();
const mockFindByOwner = jest.fn();
const mockFindById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockFindUserByUsername = jest.fn();
const mockFindGroupById = jest.fn();
const mockFindGroupByName = jest.fn();
const mockFindGroupByOwnerAndName = jest.fn();

jest.mock('../../src/dao/index.js', () => ({
  getBearerKeyDao: jest.fn(() => ({
    findAll: mockFindAll,
    findByOwner: mockFindByOwner,
    findById: mockFindById,
    create: mockCreate,
    update: mockUpdate,
    delete: mockDelete,
  })),
  getUserDao: jest.fn(() => ({
    findByUsername: mockFindUserByUsername,
  })),
  getGroupDao: jest.fn(() => ({
    findById: mockFindGroupById,
    findByName: mockFindGroupByName,
    findByOwnerAndName: mockFindGroupByOwnerAndName,
  })),
}));

import {
  createBearerKey,
  deleteBearerKey,
  getBearerKeys,
  resetBearerKey,
  updateBearerKey,
} from '../../src/controllers/bearerKeyController.js';

const makeReq = (overrides: Record<string, unknown> = {}) =>
  ({
    body: {},
    params: {},
    user: { username: 'alice', isAdmin: false },
    ...overrides,
  }) as unknown as Request;

const makeRes = () => {
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

describe('bearerKeyController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only the current user keys and masks tokens', async () => {
    mockFindByOwner.mockResolvedValue([
      {
        id: 'key-1',
        name: 'cursor',
        token: 'mcphub_abcdefghijklmnopqrstuvwxyz',
        enabled: true,
        kind: 'user',
        owner: 'alice',
        accessType: 'all',
      },
    ]);
    const res = makeRes();

    await getBearerKeys(makeReq(), res);

    expect(mockFindByOwner).toHaveBeenCalledWith('alice');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          token: 'mcphub_abcde...',
          kind: 'user',
          owner: 'alice',
        }),
      ],
    });
  });

  it('forces non-admin creation to a user-level key owned by the caller', async () => {
    mockFindUserByUsername.mockResolvedValue({ username: 'alice', isAdmin: false });
    mockCreate.mockImplementation(async (data) => ({ id: 'key-1', ...data }));
    const res = makeRes();

    await createBearerKey(
      makeReq({
        body: {
          name: 'cursor',
          kind: 'system',
          owner: 'bob',
        },
      }),
      res,
    );

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'cursor',
        kind: 'user',
        owner: 'alice',
        accessType: 'all',
        allowedGroups: [],
        allowedServers: [],
        token: expect.stringMatching(/^mcphub_[0-9a-f]{64}$/),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({ token: expect.stringMatching(/^mcphub_/) }),
      }),
    );
  });

  it('allows personal keys scoped to own groups by canonical ID and rejects other users groups (#1470)', async () => {
    mockFindUserByUsername.mockResolvedValue({ username: 'alice', isAdmin: false });
    mockFindGroupByOwnerAndName.mockResolvedValueOnce({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'my-team',
      owner: 'alice',
    });
    mockCreate.mockImplementation(async (data) => ({ id: 'key-2', ...data }));

    const resOk = makeRes();
    await createBearerKey(
      makeReq({
        body: { name: 'scoped', accessType: 'groups', allowedGroups: ['my-team'] },
      }),
      resOk,
    );
    expect(resOk.status).toHaveBeenCalledWith(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'user',
        accessType: 'groups',
        allowedGroups: ['11111111-1111-4111-8111-111111111111'],
      }),
    );

    // Reject group belonging to another user
    mockFindGroupByOwnerAndName.mockResolvedValueOnce(null);
    const resDenied = makeRes();
    await createBearerKey(
      makeReq({
        body: { name: 'bad', accessType: 'groups', allowedGroups: ['bobs-group'] },
      }),
      resDenied,
    );
    expect(resDenied.status).toHaveBeenCalledWith(400);
  });

  it('supports exclude scope for system keys (#1413) and rejects empty exclusions', async () => {
    mockCreate.mockImplementation(async (data) => ({ id: 'sys-1', ...data }));
    const resBad = makeRes();
    await createBearerKey(
      makeReq({
        user: { username: 'admin', isAdmin: true },
        body: { name: 'ex-empty', kind: 'system', accessType: 'exclude' },
      }),
      resBad,
    );
    expect(resBad.status).toHaveBeenCalledWith(400);

    const resOk = makeRes();
    await createBearerKey(
      makeReq({
        user: { username: 'admin', isAdmin: true },
        body: {
          name: 'ex-prod',
          kind: 'system',
          accessType: 'exclude',
          excludedServers: ['prod-db'],
        },
      }),
      resOk,
    );
    expect(resOk.status).toHaveBeenCalledWith(201);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        accessType: 'exclude',
        excludedServers: ['prod-db'],
        excludedGroups: [],
      }),
    );
  });

  it('rotates bearer key secret via resetBearerKey while preserving scope (#1396)', async () => {
    const existing = {
      id: 'key-1',
      name: 'cursor',
      tokenHash: 'oldhash',
      tokenPrefix: 'mcphub_old00',
      enabled: true,
      kind: 'user',
      owner: 'alice',
      accessType: 'groups',
      allowedGroups: ['11111111-1111-4111-8111-111111111111'],
    };
    mockFindById.mockResolvedValue(existing);
    mockUpdate.mockImplementation(async (_id, patch) => ({ ...existing, ...patch }));

    const res = makeRes();
    await resetBearerKey(makeReq({ params: { id: 'key-1' } }), res);

    expect(mockUpdate).toHaveBeenCalledWith(
      'key-1',
      expect.objectContaining({
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        tokenPrefix: expect.stringMatching(/^mcphub_/),
        token: undefined,
      }),
    );
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          id: 'key-1',
          accessType: 'groups',
          allowedGroups: ['11111111-1111-4111-8111-111111111111'],
          token: expect.stringMatching(/^mcphub_[0-9a-f]{64}$/),
        }),
      }),
    );
  });

  it('does not allow a user to update another user key', async () => {
    mockFindById.mockResolvedValue({
      id: 'key-2',
      name: 'bob-key',
      token: 'secret',
      enabled: true,
      kind: 'user',
      owner: 'bob',
      accessType: 'all',
    });
    const res = makeRes();

    await updateBearerKey(makeReq({ params: { id: 'key-2' }, body: { enabled: false } }), res);

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('does not allow a user to delete another user key', async () => {
    mockFindById.mockResolvedValue({
      id: 'key-2',
      name: 'bob-key',
      token: 'secret',
      enabled: true,
      kind: 'user',
      owner: 'bob',
      accessType: 'all',
    });
    const res = makeRes();

    await deleteBearerKey(makeReq({ params: { id: 'key-2' } }), res);

    expect(mockDelete).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
