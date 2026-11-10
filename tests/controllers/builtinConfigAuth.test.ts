// Regression tests for GHSA-6cvf-cfch-4g7m: built-in prompts and resources are
// global, so only admins may create, modify or delete them. Reads stay open.

import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Request, Response } from 'express';

const mockPromptDao = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};
const mockResourceDao = {
  findAll: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
};

jest.mock('../../src/dao/index.js', () => ({
  getBuiltinPromptDao: () => mockPromptDao,
  getBuiltinResourceDao: () => mockResourceDao,
}));

jest.mock('../../src/services/mcpService.js', () => ({
  handleReadResourceRequest: jest.fn(),
}));

import {
  createBuiltinPrompt,
  deleteBuiltinPrompt,
  listBuiltinPrompts,
  updateBuiltinPrompt,
} from '../../src/controllers/builtinPromptController.js';
import {
  createBuiltinResource,
  deleteBuiltinResource,
  updateBuiltinResource,
} from '../../src/controllers/builtinResourceController.js';

const makeRes = () => {
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  };
  return res as unknown as Response;
};

const makeReq = (overrides: Record<string, any> = {}) =>
  ({
    body: {},
    params: {},
    user: { username: 'alice', isAdmin: false },
    ...overrides,
  }) as unknown as Request;

describe('built-in prompt/resource write authorization (GHSA-6cvf)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('builtinPromptController writes', () => {
    it('rejects create for a non-admin without touching the DAO', async () => {
      const res = makeRes();
      await createBuiltinPrompt(makeReq({ body: { name: 'p', template: 't' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPromptDao.create).not.toHaveBeenCalled();
    });

    it('rejects update for a non-admin', async () => {
      const res = makeRes();
      await updateBuiltinPrompt(makeReq({ params: { id: '1' }, body: { title: 'x' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPromptDao.update).not.toHaveBeenCalled();
    });

    it('rejects delete for a non-admin', async () => {
      const res = makeRes();
      await deleteBuiltinPrompt(makeReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockPromptDao.delete).not.toHaveBeenCalled();
    });

    it('allows create/update/delete for an admin', async () => {
      mockPromptDao.create.mockResolvedValue({ id: '1' } as never);
      mockPromptDao.update.mockResolvedValue({ id: '1' } as never);
      mockPromptDao.delete.mockResolvedValue(true as never);

      const resCreate = makeRes();
      await createBuiltinPrompt(
        makeReq({
          user: { username: 'admin', isAdmin: true },
          body: { name: 'p', template: 't' },
        }),
        resCreate,
      );
      expect(resCreate.status).toHaveBeenCalledWith(201);

      const resUpdate = makeRes();
      await updateBuiltinPrompt(
        makeReq({
          user: { username: 'admin', isAdmin: true },
          params: { id: '1' },
          body: { title: 'x' },
        }),
        resUpdate,
      );
      expect(resUpdate.json).toHaveBeenCalled();

      const resDelete = makeRes();
      await deleteBuiltinPrompt(
        makeReq({ user: { username: 'admin', isAdmin: true }, params: { id: '1' } }),
        resDelete,
      );
      expect(resDelete.json).toHaveBeenCalled();
    });

    it('keeps reads open to non-admins', async () => {
      mockPromptDao.findAll.mockResolvedValue([] as never);
      const res = makeRes();
      await listBuiltinPrompts(makeReq(), res);
      expect(res.json).toHaveBeenCalled();
    });
  });

  describe('builtinResourceController writes', () => {
    it('rejects create for a non-admin without touching the DAO', async () => {
      const res = makeRes();
      await createBuiltinResource(makeReq({ body: { uri: 'file:///a', content: 'c' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockResourceDao.create).not.toHaveBeenCalled();
    });

    it('rejects update for a non-admin', async () => {
      const res = makeRes();
      await updateBuiltinResource(makeReq({ params: { id: '1' }, body: { content: 'x' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockResourceDao.update).not.toHaveBeenCalled();
    });

    it('rejects delete for a non-admin', async () => {
      const res = makeRes();
      await deleteBuiltinResource(makeReq({ params: { id: '1' } }), res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockResourceDao.delete).not.toHaveBeenCalled();
    });

    it('allows create for an admin', async () => {
      mockResourceDao.create.mockResolvedValue({ id: '1' } as never);
      const res = makeRes();
      await createBuiltinResource(
        makeReq({
          user: { username: 'admin', isAdmin: true },
          body: { uri: 'file:///a', content: 'c' },
        }),
        res,
      );
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });
});
