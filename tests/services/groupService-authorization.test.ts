import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGroupDao = {
  findById: jest.fn(),
  findByName: jest.fn(),
  findByOwnerAndName: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
};

const mockServerDao = {
  findAll: jest.fn(),
  findById: jest.fn(),
};

const mockUserContextService = {
  getCurrentUser: jest.fn(),
};

const mockFilterData = jest.fn((data: any, user?: any) => {
  if (!user || user.isAdmin) return data;
  return data.filter(
    (item: any) => item.owner === user.username || item.visibility === 'public',
  );
});

jest.mock('../../src/dao/index.js', () => ({
  getGroupDao: jest.fn(() => mockGroupDao),
  getServerDao: jest.fn(() => mockServerDao),
  getSystemConfigDao: jest.fn(() => ({
    get: jest.fn(() => Promise.resolve({ routing: { enableGroupNameRoute: true } })),
  })),
}));

jest.mock('../../src/services/mcpService.js', () => ({
  notifyToolChanged: jest.fn(),
}));

jest.mock('../../src/services/services.js', () => ({
  getDataService: jest.fn(() => ({
    filterData: mockFilterData,
  })),
}));

jest.mock('../../src/services/userContextService.js', () => ({
  UserContextService: {
    getInstance: jest.fn(() => mockUserContextService),
  },
}));

import {
  addServerToGroup,
  canAccessGroup,
  createGroup,
  deleteGroup,
  getAllGroups,
  getGroupByIdOrName,
  removeServerFromGroup,
  updateGroup,
  updateGroupServers,
  updateServerToolsInGroup,
} from '../../src/services/groupService.js';

describe('groupService authorization', () => {
  const adminOwnedGroup = {
    id: 'group-1',
    name: 'admin-group',
    description: 'owned by admin',
    owner: 'admin',
    servers: [{ name: 'server-1', tools: 'all', prompts: 'all', resources: 'all' }],
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUserContextService.getCurrentUser.mockReturnValue({
      username: 'bob',
      isAdmin: false,
    });

    mockGroupDao.findById.mockResolvedValue(adminOwnedGroup);
    mockGroupDao.findByName.mockResolvedValue(null);
    mockGroupDao.findByOwnerAndName.mockResolvedValue(null);
    mockGroupDao.findAll.mockResolvedValue([adminOwnedGroup]);
    mockGroupDao.update.mockImplementation(async (_id: string, updates: any) => ({
      ...adminOwnedGroup,
      ...updates,
    }));
    mockGroupDao.delete.mockResolvedValue(true);
    mockGroupDao.create.mockImplementation(async (group: any) => group);

    mockServerDao.findAll.mockResolvedValue([
      { name: 'server-1', owner: 'admin', visibility: 'private' },
      { name: 'server-2', owner: 'bob', visibility: 'private' },
      { name: 'public-server', owner: 'admin', visibility: 'public' },
    ]);
    mockServerDao.findById.mockResolvedValue({ name: 'server-1', owner: 'admin' });
  });

  it('rejects updateGroup for non-owner non-admin users', async () => {
    await expect(updateGroup('group-1', { name: 'pwned' })).resolves.toBeNull();
    expect(mockGroupDao.update).not.toHaveBeenCalled();
  });

  it('rejects updateGroupServers for non-owner non-admin users', async () => {
    await expect(updateGroupServers('group-1', ['server-2'])).resolves.toBeNull();
    expect(mockGroupDao.update).not.toHaveBeenCalled();
  });

  it('rejects deleteGroup for non-owner non-admin users', async () => {
    await expect(deleteGroup('group-1')).resolves.toBe(false);
    expect(mockGroupDao.delete).not.toHaveBeenCalled();
  });

  it('rejects addServerToGroup for non-owner non-admin users', async () => {
    mockServerDao.findById.mockResolvedValue({ name: 'server-2', owner: 'bob' });

    await expect(addServerToGroup('group-1', 'server-2')).resolves.toBeNull();
    expect(mockGroupDao.update).not.toHaveBeenCalled();
  });

  it('rejects removeServerFromGroup for non-owner non-admin users', async () => {
    await expect(removeServerFromGroup('group-1', 'server-1')).resolves.toBeNull();
    expect(mockGroupDao.update).not.toHaveBeenCalled();
  });

  it('rejects updateServerToolsInGroup for non-owner non-admin users', async () => {
    await expect(updateServerToolsInGroup('group-1', 'server-1', ['dangerous-tool'])).resolves.toBeNull();
    expect(mockGroupDao.update).not.toHaveBeenCalled();
  });

  it('allows admins to mutate groups they do not own', async () => {
    mockUserContextService.getCurrentUser.mockReturnValue({
      username: 'superadmin',
      isAdmin: true,
    });

    await expect(updateGroup('group-1', { name: 'admin-approved' })).resolves.toEqual(
      expect.objectContaining({
        id: 'group-1',
        name: 'admin-approved',
      }),
    );
    expect(mockGroupDao.update).toHaveBeenCalledWith('group-1', { name: 'admin-approved' });
  });

  it('allows non-admin owners to mutate their own groups', async () => {
    mockGroupDao.findById.mockResolvedValue({
      ...adminOwnedGroup,
      owner: 'bob',
    });

    await expect(deleteGroup('group-1')).resolves.toBe(true);
    expect(mockGroupDao.delete).toHaveBeenCalledWith('group-1');
  });

  it('hides other users groups and owner-less legacy groups from non-admins', async () => {
    mockGroupDao.findAll.mockResolvedValue([
      adminOwnedGroup,
      { ...adminOwnedGroup, id: 'group-2', name: 'bob-group', owner: 'bob' },
      { ...adminOwnedGroup, id: 'group-3', name: 'legacy-group', owner: undefined },
    ]);

    await expect(getAllGroups()).resolves.toEqual([
      expect.objectContaining({ id: 'group-2', owner: 'bob' }),
    ]);
    await expect(getGroupByIdOrName('admin-group')).resolves.toBeUndefined();
    await expect(getGroupByIdOrName('legacy-group')).resolves.toBeUndefined();
    await expect(getGroupByIdOrName('bob-group')).resolves.toEqual(
      expect.objectContaining({ owner: 'bob' }),
    );
  });

  it('treats owner-less groups as inaccessible to non-admins', () => {
    expect(
      canAccessGroup(
        { ...adminOwnedGroup, owner: undefined },
        { username: 'bob', isAdmin: false } as any,
      ),
    ).toBe(false);
    expect(
      canAccessGroup(
        { ...adminOwnedGroup, owner: undefined },
        { username: 'admin', isAdmin: true } as any,
      ),
    ).toBe(true);
  });

  it('prevents non-admins from attaching private servers they do not own', async () => {
    mockGroupDao.findById.mockResolvedValue({
      ...adminOwnedGroup,
      owner: 'bob',
      servers: [],
    });
    mockServerDao.findById.mockResolvedValue({
      name: 'server-1',
      owner: 'admin',
      visibility: 'private',
    });

    await expect(addServerToGroup('group-1', 'server-1')).resolves.toBeNull();
    expect(mockGroupDao.update).not.toHaveBeenCalled();
  });

  it('allows non-admins to attach their own or public servers to their groups', async () => {
    mockGroupDao.findById.mockResolvedValue({
      ...adminOwnedGroup,
      owner: 'bob',
      servers: [],
    });
    mockServerDao.findById.mockResolvedValue({
      name: 'public-server',
      owner: 'admin',
      visibility: 'public',
    });

    await expect(addServerToGroup('group-1', 'public-server')).resolves.toEqual(
      expect.objectContaining({
        servers: [expect.objectContaining({ name: 'public-server' })],
      }),
    );
    expect(mockGroupDao.update).toHaveBeenCalled();
  });

  it('filters non-attachable servers out of createGroup payloads for non-admins', async () => {
    const created = await createGroup('bob-new-group', 'desc', [
      'server-1',
      'server-2',
      'public-server',
    ]);

    expect(created).toEqual(
      expect.objectContaining({
        name: 'bob-new-group',
        owner: 'bob',
        servers: [
          expect.objectContaining({ name: 'server-2' }),
          expect.objectContaining({ name: 'public-server' }),
        ],
      }),
    );
    expect(mockGroupDao.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'bob',
        servers: [
          expect.objectContaining({ name: 'server-2' }),
          expect.objectContaining({ name: 'public-server' }),
        ],
      }),
    );
  });

  it('strips owner transfer attempts from updateGroup payloads', async () => {
    mockGroupDao.findById.mockResolvedValue({
      ...adminOwnedGroup,
      owner: 'bob',
    });

    await updateGroup('group-1', { name: 'renamed', owner: 'alice' } as any);

    expect(mockGroupDao.update).toHaveBeenCalledWith('group-1', { name: 'renamed' });
  });
});