import type { Request, Response } from 'express';

jest.mock('../../src/services/mcpService.js', () => ({
  handleGetPromptRequest: jest.fn(),
}));

import { getPrompt } from '../../src/controllers/promptController.js';
import { handleGetPromptRequest } from '../../src/services/mcpService.js';

const handleGetPromptRequestMock = handleGetPromptRequest as jest.MockedFunction<
  typeof handleGetPromptRequest
>;

const createResponse = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnThis();
  return { res: { json, status } as unknown as Response, json, status };
};

describe('promptController - getPrompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    handleGetPromptRequestMock.mockResolvedValue({ messages: [] } as never);
  });

  it('binds the prompt name to the URL and pins the server', async () => {
    const { res, json, status } = createResponse();
    const req = {
      params: { serverName: 'memory-server', promptName: 'summarize' },
      body: { name: 'other-prompt', arguments: { text: 'hi' } },
    } as unknown as Request;

    await getPrompt(req, res);

    expect(status).not.toHaveBeenCalled();
    expect(handleGetPromptRequestMock).toHaveBeenCalledWith(
      { params: { name: 'summarize', arguments: { text: 'hi' } } },
      { server: 'memory-server' },
    );
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: { messages: [] } }),
    );
  });

  it('decodes URL-encoded server and prompt names', async () => {
    const { res } = createResponse();
    const req = {
      params: {
        serverName: encodeURIComponent('com.atlassian/atlassian-mcp-server'),
        promptName: encodeURIComponent('issue/summary'),
      },
      body: {},
    } as unknown as Request;

    await getPrompt(req, res);

    expect(handleGetPromptRequestMock).toHaveBeenCalledWith(
      { params: { name: 'issue/summary', arguments: undefined } },
      { server: 'com.atlassian/atlassian-mcp-server' },
    );
  });

  it('reports a failed prompt lookup as a 500 without leaking service errors', async () => {
    handleGetPromptRequestMock.mockResolvedValue({ isError: true } as never);
    const { res, json, status } = createResponse();
    const req = {
      params: { serverName: 'memory-server', promptName: 'summarize' },
      body: {},
    } as unknown as Request;

    await getPrompt(req, res);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to get prompt',
    });
  });
});
