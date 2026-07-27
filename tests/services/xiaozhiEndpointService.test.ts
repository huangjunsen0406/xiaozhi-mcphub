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
});
