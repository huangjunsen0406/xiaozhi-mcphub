const findAllServers = jest.fn(async () => []);
const findGroupByName = jest.fn(async () => null);
const addServer = jest.fn(async () => ({ success: true }));
const createGroup = jest.fn(async () => ({ id: 'g1' }));

jest.mock('../../src/dao/index.js', () => ({
  getServerDao: () => ({ findAll: findAllServers }),
  getGroupDao: () => ({ findByName: findGroupByName }),
}));

jest.mock('../../src/services/mcpService.js', () => ({
  addServer,
}));

jest.mock('../../src/services/groupService.js', () => ({
  createGroup,
}));

jest.mock('../../src/services/services.js', () => ({
  getDataService: () => ({
    filterData: (data: unknown) => data,
  }),
}));

import { importTemplate } from '../../src/services/templateService.js';

describe('templateService import privilege enforcement (#1096)', () => {
  const originalAllow = process.env.MCPHUB_ALLOW_USER_STDIO_SERVERS;

  beforeEach(() => {
    delete process.env.MCPHUB_ALLOW_USER_STDIO_SERVERS;
    addServer.mockClear();
    createGroup.mockClear();
  });

  afterAll(() => {
    if (originalAllow === undefined) {
      delete process.env.MCPHUB_ALLOW_USER_STDIO_SERVERS;
    } else {
      process.env.MCPHUB_ALLOW_USER_STDIO_SERVERS = originalAllow;
    }
  });

  const sampleTemplate = {
    version: '1.0',
    name: 'test',
    servers: {
      evilStdio: { type: 'stdio', command: 'sh', args: ['-c', 'id'] },
      safeHttp: { type: 'streamable-http', url: 'https://example.com/mcp' },
    },
    groups: [],
  };

  it('rejects stdio/privileged server entries for non-admin users while allowing safe HTTP entries', async () => {
    const result = await importTemplate(sampleTemplate, 'alice', {
      username: 'alice',
      password: '',
      isAdmin: false,
    });

    expect(addServer).toHaveBeenCalledTimes(1);
    expect(addServer).toHaveBeenCalledWith(
      'safeHttp',
      expect.objectContaining({ url: 'https://example.com/mcp', owner: 'alice' }),
    );
    expect(result.serversCreated).toBe(1);
    expect(result.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'evilStdio', action: 'failed' }),
        expect.objectContaining({ name: 'safeHttp', action: 'created' }),
      ]),
    );
  });

  it('allows admin users to import stdio server entries', async () => {
    const result = await importTemplate(sampleTemplate, 'admin', {
      username: 'admin',
      password: '',
      isAdmin: true,
    });

    expect(addServer).toHaveBeenCalledTimes(2);
    expect(result.serversCreated).toBe(2);
  });
});
