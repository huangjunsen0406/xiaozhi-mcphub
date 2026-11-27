const findByUsername = jest.fn();

jest.mock('../../src/dao/index.js', () => ({
  getUserDao: () => ({
    findByUsername,
  }),
}));

import {
  expandServerConfig,
  getServerEnvironment,
} from '../../src/services/serverConfigEnvironment.js';

describe('serverConfigEnvironment (#1270)', () => {
  const originalSecret = process.env.TEST_HOST_SECRET;

  beforeEach(() => {
    findByUsername.mockReset();
    process.env.TEST_HOST_SECRET = 'super-secret-value';
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.TEST_HOST_SECRET;
    } else {
      process.env.TEST_HOST_SECRET = originalSecret;
    }
  });

  it('allows admin-owned and ownerless configs to inherit process.env', async () => {
    findByUsername.mockResolvedValue({ username: 'admin', isAdmin: true });

    const adminEnv = await getServerEnvironment({
      owner: 'admin',
      env: { COPY: '${TEST_HOST_SECRET}' },
    });
    expect(adminEnv.TEST_HOST_SECRET).toBe('super-secret-value');
    expect(adminEnv.COPY).toBe('super-secret-value');

    const ownerlessEnv = await getServerEnvironment({
      env: { COPY: '${TEST_HOST_SECRET}' },
    });
    expect(ownerlessEnv.COPY).toBe('super-secret-value');
  });

  it('isolates non-admin and unknown-owner configs from process.env', async () => {
    findByUsername.mockResolvedValue({ username: 'alice', isAdmin: false });

    const aliceEnv = await getServerEnvironment({
      owner: 'alice',
      env: { LEAK: '${TEST_HOST_SECRET}', SAFE: 'literal' },
    });
    expect(aliceEnv.TEST_HOST_SECRET).toBeUndefined();
    expect(aliceEnv.LEAK).toBe('');
    expect(aliceEnv.SAFE).toBe('literal');

    const expanded = await expandServerConfig({
      owner: 'alice',
      visibility: 'private',
      url: 'https://example.com/${TEST_HOST_SECRET}',
      headers: { Authorization: 'Bearer ${SAFE}' },
      env: { SAFE: 'user-token' },
    });
    expect(expanded.url).toBe('https://example.com/');
    expect(expanded.headers?.Authorization).toBe('Bearer user-token');
    expect(expanded.owner).toBe('alice');
    expect(expanded.visibility).toBe('private');
  });
});
