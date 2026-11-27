import { LegacyMcpClient } from '../../src/clients/legacyMcpClient.js';

describe('LegacyMcpClient pagination (#1487)', () => {
  it('collects all tool pages across nextCursor and clears pagination/TTL metadata', async () => {
    const client = new LegacyMcpClient({ name: 'test', version: '1.0.0' });
    const requestSpy = jest
      .spyOn(client as unknown as { request: jest.Mock }, 'request')
      .mockResolvedValueOnce({
        tools: [{ name: 't1', inputSchema: { type: 'object' } }],
        nextCursor: 'page-2',
        ttlMs: 30000,
      })
      .mockResolvedValueOnce({
        tools: [{ name: 't2', inputSchema: { type: 'object' } }],
        nextCursor: 'page-3',
      })
      .mockResolvedValueOnce({
        tools: [{ name: 't3', inputSchema: { type: 'object' } }],
      });

    const result = await client.listTools({});
    expect(result.tools.map((t) => t.name)).toEqual(['t1', 't2', 't3']);
    expect(result.nextCursor).toBeUndefined();
    expect((result as { ttlMs?: number }).ttlMs).toBeUndefined();
    expect(requestSpy).toHaveBeenCalledTimes(3);
    expect(requestSpy).toHaveBeenNthCalledWith(
      2,
      { method: 'tools/list', params: { cursor: 'page-2' } },
      undefined,
    );
  });

  it('rejects repeated cursors to prevent infinite loops', async () => {
    const client = new LegacyMcpClient({ name: 'test', version: '1.0.0' });
    jest
      .spyOn(client as unknown as { request: jest.Mock }, 'request')
      .mockResolvedValueOnce({
        prompts: [{ name: 'p1' }],
        nextCursor: 'loop',
      })
      .mockResolvedValueOnce({
        prompts: [{ name: 'p2' }],
        nextCursor: 'loop',
      });

    await expect(client.listPrompts({})).rejects.toThrow(/Invalid prompts pagination/);
  });
});
