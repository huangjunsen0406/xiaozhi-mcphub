const handleListToolsRequest = jest.fn();
const handleCallToolRequest = jest.fn();
const getSmartRoutingConfig = jest.fn(async () => ({ enabled: false }));
const isDatabaseConnected = jest.fn(() => false);

jest.mock('../../src/services/mcpService.js', () => ({
  handleListToolsRequest,
  handleCallToolRequest,
}));

jest.mock('../../src/utils/smartRouting.js', () => ({
  getSmartRoutingConfig,
}));

jest.mock('../../src/db/connection.js', () => ({
  isDatabaseConnected,
}));

jest.mock('../../src/db/repositories/index.js', () => ({
  getXiaozhiConfigRepository: () => ({
    getConfig: jest.fn(async () => null),
  }),
  getXiaozhiEndpointRepository: () => ({
    findAll: jest.fn(async () => []),
    save: jest.fn(),
    updateById: jest.fn(),
    delete: jest.fn(),
    updateStatus: jest.fn(),
  }),
}));

describe('xiaozhiEndpointService', () => {
  let xiaozhiEndpointService: typeof import('../../src/services/xiaozhiEndpointService.js').xiaozhiEndpointService;

  beforeEach(async () => {
    jest.resetModules();
    isDatabaseConnected.mockReturnValue(false);
    ({ xiaozhiEndpointService } = await import('../../src/services/xiaozhiEndpointService.js'));
  });

  it('exposes a health summary without throwing when DB is off', () => {
    const summary = xiaozhiEndpointService.getHealthSummary();
    expect(summary.available).toBe(false);
    expect(summary.enabledTotal).toBe(0);
    expect(summary.connected).toBe(0);
    expect(summary.disconnected).toBe(0);
    expect(summary.pendingReconnects).toBe(0);
  });

  it('reports aggregate status with enabled/connected flags', () => {
    const status = xiaozhiEndpointService.getAggregateStatus();
    expect(status.enabled).toBe(false);
    expect(status.connected).toBe(false);
    expect(Array.isArray(status.endpoints)).toBe(true);
  });

  it('filters endpoints for non-admin users by owner', () => {
    const mine = xiaozhiEndpointService.getEndpointsForUser('__no_such_user__', false);
    expect(mine).toEqual([]);
  });

  describe('dual-version MCP protocol (2024-11-05 + 2026-07-28)', () => {
    const endpoint = {
      id: 'ep-1',
      name: 'mcp1',
      enabled: true,
      webSocketUrl: 'wss://example.com/mcp',
      description: '',
      useSmartRouting: false,
      reconnect: {
        maxAttempts: 5,
        infiniteReconnect: true,
        infiniteRetryDelay: 1800000,
        initialDelay: 2000,
        maxDelay: 60000,
        backoffMultiplier: 2,
      },
      createdAt: '2026-11-27T00:00:00.000Z',
      status: 'connected' as const,
    };

    const sendRaw = async (raw: string | Record<string, unknown>): Promise<any[]> => {
      const sent: any[] = [];
      const fakeWs = {
        readyState: 1, // WebSocket.OPEN
        send: (payload: string) => {
          sent.push(JSON.parse(payload));
        },
      };
      (xiaozhiEndpointService as any).connections.set(endpoint.id, {
        ws: fakeWs,
        endpoint,
        reconnectAttempts: 0,
        isInInfiniteReconnectMode: false,
        infiniteRetryCount: 0,
        isInSleepMode: false,
        reconnectPending: false,
      });

      const payload = typeof raw === 'string' ? raw : JSON.stringify(raw);
      await (xiaozhiEndpointService as any).handleMessage(endpoint, Buffer.from(payload, 'utf8'));
      return sent;
    };

    beforeEach(() => {
      handleListToolsRequest.mockReset();
      handleCallToolRequest.mockReset();
    });

    it('handles 2026-07-28 server/discover with supportedVersions and metadata', async () => {
      const sent = await sendRaw({
        jsonrpc: '2.0',
        id: 10000,
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': { name: 'ic', version: '2.0.0' },
          },
        },
      });

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        jsonrpc: '2.0',
        id: 10000,
        result: {
          resultType: 'complete',
          supportedVersions: ['2026-07-28', '2024-11-05'],
          capabilities: { tools: {} },
          ttlMs: 60000,
          cacheScope: 'private',
          _meta: {
            'io.modelcontextprotocol/serverInfo': {
              name: 'mcphub-xiaozhi-bridge',
            },
          },
        },
      });
    });

    it('rejects unsupported protocol version with -32022 and modern initialize with -32601', async () => {
      const badVersion = await sendRaw({
        jsonrpc: '2.0',
        id: 'ver-1',
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2099-01-01',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      });

      expect(badVersion[0].error).toMatchObject({
        code: -32022,
        data: {
          supported: ['2026-07-28', '2024-11-05'],
          requested: '2099-01-01',
        },
      });

      const modernInit = await sendRaw({
        jsonrpc: '2.0',
        id: 'init-1',
        method: 'initialize',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      });

      expect(modernInit[0].error.code).toBe(-32601);
    });

    it('preserves legacy 2024-11-05 initialize and ignores notifications without replying', async () => {
      const init = await sendRaw({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2024-11-05', capabilities: {} },
      });

      expect(init[0].result).toMatchObject({
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
      });

      const notif = await sendRaw({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
      expect(notif).toHaveLength(0);
    });

    it('returns -32601 for unknown request methods instead of silently dropping them', async () => {
      const sent = await sendRaw({
        jsonrpc: '2.0',
        id: 99,
        method: 'resources/list',
        params: {},
      });

      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({
        jsonrpc: '2.0',
        id: 99,
        error: { code: -32601 },
      });
    });

    it('wraps modern tools/list and tools/call responses with 2026-07-28 envelope and handles errors', async () => {
      handleListToolsRequest.mockResolvedValue({
        tools: [{ name: 'weather', description: 'Get weather', inputSchema: { type: 'object' } }],
      });

      const listSent = await sendRaw({
        jsonrpc: '2.0',
        id: 'list-1',
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      });

      expect(listSent[0].result).toMatchObject({
        resultType: 'complete',
        ttlMs: 60000,
        cacheScope: 'private',
        tools: [{ name: 'weather' }],
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'mcphub-xiaozhi-bridge' } },
      });

      handleCallToolRequest.mockRejectedValueOnce(new Error('upstream boom'));
      const modernErr = await sendRaw({
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'tools/call',
        params: {
          name: 'weather',
          arguments: {},
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      });
      expect(modernErr[0].result).toMatchObject({
        resultType: 'complete',
        isError: true,
        content: [{ type: 'text', text: 'upstream boom' }],
      });

      handleCallToolRequest.mockRejectedValueOnce(new Error('legacy boom'));
      const legacyErr = await sendRaw({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'weather', arguments: {} },
      });
      expect(legacyErr[0].error).toMatchObject({
        code: -32603,
        message: 'legacy boom',
      });
    });

    it('returns -32700 on invalid JSON and -32600 on invalid request id', async () => {
      const parseErr = await sendRaw('{bad json');
      expect(parseErr[0]).toMatchObject({ id: null, error: { code: -32700 } });

      const badId = await sendRaw({ jsonrpc: '2.0', id: 1.5, method: 'ping' });
      expect(badId[0]).toMatchObject({ id: null, error: { code: -32600 } });
    });
  });
});
