const getServerByOAuthState = jest.fn();
const getServerByPendingOAuthState = jest.fn();
const createTransportFromConfig = jest.fn();
const updateServerToolsCache = jest.fn();
const loadServerConfig = jest.fn();
const expandServerConfig = jest.fn(async (cfg: any) => cfg);

jest.mock('../../src/services/mcpService.js', () => ({
  getServerByOAuthState,
  getServerByPendingOAuthState,
  createTransportFromConfig,
  updateServerToolsCache,
}));

jest.mock('../../src/services/oauthSettingsStore.js', () => ({
  loadServerConfig,
}));

jest.mock('../../src/services/serverConfigEnvironment.js', () => ({
  expandServerConfig,
}));

import {
  handleOAuthCallback,
  resetOAuthStateTrackingForTests,
} from '../../src/controllers/oauthCallbackController.js';

const createMockRes = () => {
  const res: any = {
    statusCode: 200,
    body: '',
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: string) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

describe('oauthCallbackController single-use state (GHSA-vc28-27px-x492)', () => {
  beforeEach(() => {
    resetOAuthStateTrackingForTests();
    getServerByOAuthState.mockReset();
    getServerByPendingOAuthState.mockReset();
    createTransportFromConfig.mockReset();
    updateServerToolsCache.mockReset();
    loadServerConfig.mockReset();
    expandServerConfig.mockClear();
  });

  it('rejects forged base64/colon states that do not match a stored server state', async () => {
    getServerByOAuthState.mockReturnValue(undefined);
    getServerByPendingOAuthState.mockReturnValue(undefined);

    const forged = Buffer.from(JSON.stringify({ server: 'victim-server' })).toString('base64url');
    const res = createMockRes();
    await handleOAuthCallback({ query: { code: 'abc', state: forged } } as any, res);

    expect(res.statusCode).toBe(400);
  });

  it('rejects replayed OAuth states after a single successful exchange', async () => {
    const finishAuth = jest.fn(async () => {});
    const fakeServer: any = {
      name: 'demo',
      status: 'oauth_required',
      oauth: { state: 'good-state-123' },
      transport: { finishAuth, close: jest.fn(async () => {}) },
      client: {
        getServerCapabilities: () => ({}),
        listTools: async () => ({ tools: [] }),
      },
      config: { type: 'streamable-http', url: 'https://example.com/mcp' },
    };

    getServerByOAuthState.mockImplementation((s: string) =>
      s === 'good-state-123' ? fakeServer : undefined,
    );
    loadServerConfig.mockResolvedValue(fakeServer.config);
    createTransportFromConfig.mockResolvedValue({ close: jest.fn(async () => {}) });

    const res1 = createMockRes();
    await handleOAuthCallback({ query: { code: 'code-1', state: 'good-state-123' } } as any, res1);
    expect(res1.statusCode).toBe(200);
    expect(finishAuth).toHaveBeenCalledTimes(1);

    // Simulate a replay even if state lookup were somehow still populated
    fakeServer.oauth = { state: 'good-state-123' };
    const res2 = createMockRes();
    await handleOAuthCallback({ query: { code: 'code-2', state: 'good-state-123' } } as any, res2);
    expect(res2.statusCode).toBe(400);
    expect(finishAuth).toHaveBeenCalledTimes(1);
  });

  it('rejects expired pendingAuthorization states', async () => {
    const expiredServer: any = {
      name: 'demo',
      config: {
        oauth: {
          pendingAuthorization: {
            state: 'old-state',
            createdAt: Date.now() - 20 * 60 * 1000,
          },
        },
      },
    };
    getServerByOAuthState.mockReturnValue(undefined);
    getServerByPendingOAuthState.mockReturnValue(expiredServer);

    const res = createMockRes();
    await handleOAuthCallback({ query: { code: 'code-1', state: 'old-state' } } as any, res);
    expect(res.statusCode).toBe(400);
  });
});
