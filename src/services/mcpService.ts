import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ServerCapabilities,
} from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ServerInfo, ServerConfig, Tool } from '../types/index.js';
import { expandEnvVars, replaceEnvVars } from '../config/index.js';
import config from '../config/index.js';
import { getGroup } from './sseService.js';
import { getServersInGroup, getServerConfigInGroup } from './groupService.js';
import { saveToolsAsVectorEmbeddings, searchToolsByVector } from './vectorSearchService.js';
import { OpenAPIClient } from '../clients/openapi.js';
import { getDataService } from './services.js';
import { getSystemConfigService } from './systemConfigService.js';
import { getMcpServerService } from './mcpServerService.js';
import { isDatabaseConnected } from '../db/connection.js';

const servers: { [sessionId: string]: Server } = {};

// Helper function to set up keep-alive ping for SSE connections
const setupKeepAlive = (serverInfo: ServerInfo, serverConfig: ServerConfig): void => {
  // Only set up keep-alive for SSE connections
  if (!(serverInfo.transport instanceof SSEClientTransport)) {
    return;
  }

  // Clear any existing interval first
  if (serverInfo.keepAliveIntervalId) {
    clearInterval(serverInfo.keepAliveIntervalId);
  }

  // Use configured interval or default to 60 seconds for SSE
  const interval = serverConfig.keepAliveInterval || 60000;

  serverInfo.keepAliveIntervalId = setInterval(async () => {
    try {
      if (serverInfo.client && serverInfo.status === 'connected') {
        await serverInfo.client.ping();
        console.log(`Keep-alive ping successful for server: ${serverInfo.name}`);
      }
    } catch (error) {
      console.warn(`Keep-alive ping failed for server ${serverInfo.name}:`, error);
      // TODO Consider handling reconnection logic here if needed
    }
  }, interval);

  console.log(
    `Keep-alive ping set up for server ${serverInfo.name} with interval ${interval / 1000} seconds`,
  );
};

export const initUpstreamServers = async (): Promise<void> => {
  await registerAllTools(true);
  
  // 等待所有 MCP 服务器完全初始化
  const maxWaitTime = 30000; // 最多等待30秒
  const checkInterval = 1000; // 每1秒检查一次
  let waited = 0;
  
  console.log('等待所有 MCP 服务器完全初始化...');
  while (waited < maxWaitTime) {
    const allConnected = serverInfos.every(
      (server) => server.status === 'connected' || server.status === 'disconnected'
    );
    
    if (allConnected) {
      const connectedServers = serverInfos.filter(server => server.status === 'connected');
      const totalTools = connectedServers.reduce((sum, server) => sum + (server.tools?.length || 0), 0);
      console.log(`所有 MCP 服务器初始化完成！连接的服务器: ${connectedServers.length}, 总工具数: ${totalTools}`);
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }
  
  if (waited >= maxWaitTime) {
    console.warn('等待 MCP 服务器初始化超时，继续启动小智客户端');
  }
  
  // 初始化小智客户端服务
  try {
    const { xiaozhiClientService } = await import('./xiaozhiClientService.js');
    if (xiaozhiClientService.isEnabled()) {
      await xiaozhiClientService.initialize();
      console.log('小智客户端服务已启动');
      
      // 在所有服务器稳定后，立即通知小智工具列表可用
      try {
        await xiaozhiClientService.notifyToolsChanged();
        console.log('已通知小智初始工具列表');
      } catch (error) {
        console.error('通知小智初始工具列表失败:', error);
      }
    } else {
      console.log('小智客户端服务未启用');
    }
  } catch (error) {
    console.error('小智客户端服务启动失败:', error);
  }

  // 兜底：如果已开启智能路由，完成初始化后触发一次全量向量同步
  try {
    const { getSmartRoutingConfig } = await import('../utils/smartRouting.js');
    const { syncAllServerToolsEmbeddings } = await import('./vectorSearchService.js');
    const sr = await getSmartRoutingConfig();
    if (sr.enabled) {
      syncAllServerToolsEmbeddings().catch((e) => {
        console.error('Failed to run fallback smart routing sync:', e);
      });
    }
  } catch (e) {
    console.warn('Fallback smart routing sync scheduling error:', (e as any)?.message || e);
  }
};

export const getMcpServer = async (sessionId?: string, group?: string): Promise<Server> => {
  if (!sessionId) {
    return await createMcpServer(config.mcpHubName, config.mcpHubVersion, group);
  }

  if (!servers[sessionId]) {
    const serverGroup = group || getGroup(sessionId);
    const server = await createMcpServer(config.mcpHubName, config.mcpHubVersion, serverGroup);
    servers[sessionId] = server;
  } else {
    console.log(`MCP server already exists for sessionId: ${sessionId}`);
  }
  return servers[sessionId];
};

export const deleteMcpServer = (sessionId: string): void => {
  delete servers[sessionId];
};

export const notifyToolChanged = async (name?: string) => {
  console.log('工具状态发生变化，开始重新注册所有工具...');
  await registerAllTools(false, name);
  
  // 等待所有 MCP 服务器状态稳定
  const maxWaitTime = 15000; // 最多等待15秒
  const checkInterval = 500; // 每500ms检查一次
  let waited = 0;
  
  console.log('等待所有 MCP 服务器状态稳定...');
  while (waited < maxWaitTime) {
    // 检查是否所有服务器都处于稳定状态（connected 或 disconnected）
    const allStable = serverInfos.every(
      (server) => server.status === 'connected' || server.status === 'disconnected'
    );
    
    if (allStable) {
      const connectedServers = serverInfos.filter(server => server.status === 'connected');
      const totalTools = connectedServers.reduce((sum, server) => sum + (server.tools?.length || 0), 0);
      console.log(`所有 MCP 服务器状态已稳定！连接的服务器: ${connectedServers.length}, 总工具数: ${totalTools}`);
      break;
    }
    
    // 显示当前正在连接的服务器
    const connectingServers = serverInfos.filter(server => server.status === 'connecting');
    if (connectingServers.length > 0) {
      console.log(`等待服务器连接中: ${connectingServers.map(s => s.name).join(', ')}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, checkInterval));
    waited += checkInterval;
  }
  
  if (waited >= maxWaitTime) {
    console.warn('等待 MCP 服务器状态稳定超时，继续执行小智重连');
  }

  // 通知其他MCP客户端工具列表变化
  Object.values(servers).forEach((server) => {
    server
      .sendToolListChanged()
      .catch((error) => {
        console.warn('Failed to send tool list changed notification:', error.message);
      })
      .then(() => {
        console.log('Tool list changed notification sent successfully');
      });
  });

  // 在所有服务器状态稳定后，重连小智客户端
  try {
    const { xiaozhiClientService } = await import('./xiaozhiClientService.js');
    if (xiaozhiClientService.isEnabled()) {
      console.log('MCP服务器状态已稳定，重连小智客户端以同步最新工具列表...');
      
      // 先断开连接
      await xiaozhiClientService.disconnect();
      
      // 等待一小段时间确保断开完成
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // 重新初始化连接
      await xiaozhiClientService.initialize();
      
      // 连接成功后通知工具列表已更新
      setTimeout(async () => {
        try {
          await xiaozhiClientService.notifyToolsChanged();
          console.log('小智客户端已重连并同步最新工具列表');
        } catch (error) {
          console.error('重连后通知小智工具列表失败:', error);
        }
      }, 1000);
    }
  } catch (error) {
    console.error('重连小智客户端失败:', error);
  }
};

export const syncToolEmbedding = async (serverName: string, toolName: string) => {
  const serverInfo = getServerByName(serverName);
  if (!serverInfo) {
    console.warn(`Server not found: ${serverName}`);
    return;
  }
  const tool = serverInfo.tools.find((t) => t.name === toolName);
  if (!tool) {
    console.warn(`Tool not found: ${toolName} on server: ${serverName}`);
    return;
  }
  // Save tool as vector embedding for search
  saveToolsAsVectorEmbeddings(serverName, [tool]);
};

// Helper function to clean $schema field from inputSchema
const cleanInputSchema = (schema: any): any => {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  const cleanedSchema = { ...schema };
  delete cleanedSchema.$schema;

  return cleanedSchema;
};

// Store all server information
let serverInfos: ServerInfo[] = [];

// Returns true if all enabled servers are connected
export const connected = (): boolean => {
  return serverInfos
    .filter((serverInfo) => serverInfo.enabled !== false)
    .every((serverInfo) => serverInfo.status === 'connected');
};

// Global cleanup function to close all connections
export const cleanupAllServers = (): void => {
  for (const serverInfo of serverInfos) {
    try {
      if (serverInfo.client) {
        serverInfo.client.close();
      }
      if (serverInfo.transport) {
        serverInfo.transport.close();
      }
    } catch (error) {
      console.warn(`Error closing server ${serverInfo.name}:`, error);
    }
  }
  serverInfos = [];

  // Clear session servers as well
  Object.keys(servers).forEach((sessionId) => {
    delete servers[sessionId];
  });
};

// Helper function to create transport based on server configuration
const createTransportFromConfig = async (name: string, conf: ServerConfig): Promise<any> => {
  let transport;

  if (conf.type === 'streamable-http') {
    const options: any = {};
    if (conf.headers && Object.keys(conf.headers).length > 0) {
      options.requestInit = {
        headers: conf.headers,
      };
    }
    // 自动为 ModelScope 域名附加 Bearer token（若数据库配置了 modelscope.apiKey）
    try {
      const systemConfigService = getSystemConfigService();
      const systemConfig = await systemConfigService.getSystemConfig();
      const token = systemConfig?.modelscope?.apiKey;
      if (token && (conf.url || '').includes('mcp.api-inference.modelscope.net')) {
        options.requestInit = options.requestInit || {};
        options.requestInit.headers = {
          ...(options.requestInit.headers || {}),
          Authorization: `Bearer ${token}`,
        };
      }
    } catch (e) {
      // ignore modelscope auto header errors
    }
    transport = new StreamableHTTPClientTransport(new URL(conf.url || ''), options);
  } else if (conf.url) {
    // SSE transport
    const options: any = {};
    if (conf.headers && Object.keys(conf.headers).length > 0) {
      options.eventSourceInit = {
        headers: conf.headers,
      };
      options.requestInit = {
        headers: conf.headers,
      };
    }
    // 自动为 ModelScope SSE 附加 Bearer token（若数据库配置了 modelscope.apiKey），且未手动提供 Authorization
    try {
      const systemConfigService = getSystemConfigService();
      const systemConfig = await systemConfigService.getSystemConfig();
      const token = systemConfig?.modelscope?.apiKey;
      if (token && conf.url.includes('mcp.api-inference.modelscope.net')) {
        options.eventSourceInit = options.eventSourceInit || {};
        const hasAuth1 = options.eventSourceInit.headers && (options.eventSourceInit.headers as any)['Authorization'];
        if (!hasAuth1) {
          options.eventSourceInit.headers = {
            ...(options.eventSourceInit.headers || {}),
            Authorization: `Bearer ${token}`,
          };
        }
        options.requestInit = options.requestInit || {};
        const hasAuth2 = options.requestInit.headers && (options.requestInit.headers as any)['Authorization'];
        if (!hasAuth2) {
          options.requestInit.headers = {
            ...(options.requestInit.headers || {}),
            Authorization: `Bearer ${token}`,
          };
        }
      }
    } catch (e) {
      // ignore modelscope auto header errors
    }
    transport = new SSEClientTransport(new URL(conf.url), options);
  } else if (conf.command && conf.args) {
    // Stdio transport
    const env: Record<string, string> = {
      ...(process.env as Record<string, string>),
      ...replaceEnvVars(conf.env || {}),
    };
    env['PATH'] = expandEnvVars(process.env.PATH as string) || '';

    // Get system configuration from database
    const systemConfigService = getSystemConfigService();
    const systemConfig = await systemConfigService.getSystemConfig();
    
    // Add UV_DEFAULT_INDEX and npm_config_registry if needed
    if (
      systemConfig?.install?.pythonIndexUrl &&
      (conf.command === 'uvx' || conf.command === 'uv' || conf.command === 'python')
    ) {
      env['UV_DEFAULT_INDEX'] = systemConfig.install.pythonIndexUrl;
    }

    if (
      systemConfig?.install?.npmRegistry &&
      (conf.command === 'npm' ||
        conf.command === 'npx' ||
        conf.command === 'pnpm' ||
        conf.command === 'yarn' ||
        conf.command === 'node')
    ) {
      env['npm_config_registry'] = systemConfig.install.npmRegistry;
    }

    transport = new StdioClientTransport({
      command: conf.command,
      args: replaceEnvVars(conf.args) as string[],
      env: env,
      stderr: 'pipe',
    });
    transport.stderr?.on('data', (data) => {
      console.log(`[${name}] [child] ${data}`);
    });
  } else {
    throw new Error(`Unable to create transport for server: ${name}`);
  }

  return transport;
};

// Helper function to handle client.callTool with reconnection logic
const callToolWithReconnect = async (
  serverInfo: ServerInfo,
  toolParams: any,
  options?: any,
  maxRetries: number = 1,
): Promise<any> => {
  if (!serverInfo.client) {
    throw new Error(`Client not found for server: ${serverInfo.name}`);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await serverInfo.client.callTool(toolParams, undefined, options || {});
      return result;
    } catch (error: any) {
      // Check if error message starts with "Error POSTing to endpoint (HTTP 40"
      const isHttp40xError = error?.message?.startsWith?.('Error POSTing to endpoint (HTTP 40');
      // Only retry for StreamableHTTPClientTransport
      const isStreamableHttp = serverInfo.transport instanceof StreamableHTTPClientTransport;

      if (isHttp40xError && attempt < maxRetries && serverInfo.transport && isStreamableHttp) {
        console.warn(
          `HTTP 40x error detected for StreamableHTTP server ${serverInfo.name}, attempting reconnection (attempt ${attempt + 1}/${maxRetries + 1})`,
        );

        try {
          // Close existing connection
          if (serverInfo.keepAliveIntervalId) {
            clearInterval(serverInfo.keepAliveIntervalId);
            serverInfo.keepAliveIntervalId = undefined;
          }

          serverInfo.client.close();
          serverInfo.transport.close();

          // Get server configuration to recreate transport
          const mcpServerService = getMcpServerService();
          const server = await mcpServerService.getServerByName(serverInfo.name);
          if (!server) {
            throw new Error(`Server configuration not found for: ${serverInfo.name}`);
          }
          const conf = mcpServerService.entityToConfig(server);

          // Recreate transport using helper function
          const newTransport = await createTransportFromConfig(serverInfo.name, conf);

          // Create new client
          const client = new Client(
            {
              name: `mcp-client-${serverInfo.name}`,
              version: '1.0.0',
            },
            {
              capabilities: {
                prompts: {},
                resources: {},
                tools: {},
              },
            },
          );

          // Reconnect with new transport
          await client.connect(newTransport, serverInfo.options || {});

          // Update server info with new client and transport
          serverInfo.client = client;
          serverInfo.transport = newTransport;
          serverInfo.status = 'connected';

          // Reload tools list after reconnection
          try {
            const tools = await client.listTools({}, serverInfo.options || {});
            serverInfo.tools = tools.tools.map((tool) => ({
              name: `${serverInfo.name}-${tool.name}`,
              description: tool.description || '',
              inputSchema: cleanInputSchema(tool.inputSchema || {}),
            }));

            // Save tools as vector embeddings for search
            saveToolsAsVectorEmbeddings(serverInfo.name, serverInfo.tools);
          } catch (listToolsError) {
            console.warn(
              `Failed to reload tools after reconnection for server ${serverInfo.name}:`,
              listToolsError,
            );
            // Continue anyway, as the connection might still work for the current tool
          }

          console.log(`Successfully reconnected to server: ${serverInfo.name}`);

          // Continue to next attempt
          continue;
        } catch (reconnectError) {
          console.error(`Failed to reconnect to server ${serverInfo.name}:`, reconnectError);
          serverInfo.status = 'disconnected';
          serverInfo.error = `Failed to reconnect: ${reconnectError}`;

          // If this was the last attempt, throw the original error
          if (attempt === maxRetries) {
            throw error;
          }
        }
      } else {
        // Not an HTTP 40x error or no more retries, throw the original error
        throw error;
      }
    }
  }

  // This should not be reached, but just in case
  throw new Error('Unexpected error in callToolWithReconnect');
};

// Initialize MCP server clients
export const initializeClientsFromSettings = async (
  isInit: boolean,
  serverName?: string,
): Promise<ServerInfo[]> => {
  const mcpServerService = getMcpServerService();
  
  // Load servers from database
  const dbServers = await mcpServerService.getAllServers();
  const serverConfigs: Record<string, ServerConfig> = {};
  
  // Convert database entities to configuration objects
  for (const server of dbServers) {
    serverConfigs[server.name] = mcpServerService.entityToConfig(server);
  }

  const existingServerInfos = serverInfos;
  serverInfos = [];

  for (const [name, conf] of Object.entries(serverConfigs)) {
    // Skip disabled servers
    if (conf.enabled === false) {
      console.log(`Skipping disabled server: ${name}`);
      serverInfos.push({
        name,
        owner: conf.owner,
        status: 'disconnected',
        error: null,
        tools: [],
        prompts: [],
        createTime: Date.now(),
        enabled: false,
      });
      continue;
    }

    // Check if server is already connected
    const existingServer = existingServerInfos.find(
      (s) => s.name === name && s.status === 'connected',
    );
    if (existingServer && (!serverName || serverName !== name)) {
      serverInfos.push({
        ...existingServer,
        enabled: conf.enabled === undefined ? true : conf.enabled,
      });
      console.log(`Server '${name}' is already connected.`);
      continue;
    }

    let transport;
    let openApiClient;
    if (conf.type === 'openapi') {
      // Handle OpenAPI type servers
      if (!conf.openapi?.url && !conf.openapi?.schema) {
        console.warn(
          `Skipping OpenAPI server '${name}': missing OpenAPI specification URL or schema`,
        );
        serverInfos.push({
          name,
          owner: conf.owner,
          status: 'disconnected',
          error: 'Missing OpenAPI specification URL or schema',
          tools: [],
          prompts: [],
          createTime: Date.now(),
        });
        continue;
      }

      // Create server info first and keep reference to it
      const serverInfo: ServerInfo = {
        name,
        owner: conf.owner,
        status: 'connecting',
        error: null,
        tools: [],
        prompts: [],
        createTime: Date.now(),
        enabled: conf.enabled === undefined ? true : conf.enabled,
      };
      serverInfos.push(serverInfo);

      try {
        // Create OpenAPI client instance
        openApiClient = new OpenAPIClient(conf);

        console.log(`Initializing OpenAPI server: ${name}...`);

        // Perform async initialization
        await openApiClient.initialize();

        // Convert OpenAPI tools to MCP tool format
        const openApiTools = openApiClient.getTools();
        const mcpTools: Tool[] = openApiTools.map((tool) => ({
          name: `${name}-${tool.name}`,
          description: tool.description,
          inputSchema: cleanInputSchema(tool.inputSchema),
        }));

        // Update server info with successful initialization
        serverInfo.status = 'connected';
        serverInfo.tools = mcpTools;
        serverInfo.openApiClient = openApiClient;

        console.log(
          `Successfully initialized OpenAPI server: ${name} with ${mcpTools.length} tools`,
        );

        // Save tools as vector embeddings for search
        saveToolsAsVectorEmbeddings(name, mcpTools);
        continue;
      } catch (error) {
        console.error(`Failed to initialize OpenAPI server ${name}:`, error);

        // Update the already pushed server info with error status
        serverInfo.status = 'disconnected';
        serverInfo.error = `Failed to initialize OpenAPI server: ${error}`;
        continue;
      }
    } else {
      transport = await createTransportFromConfig(name, conf);
    }

    const client = new Client(
      {
        name: `mcp-client-${name}`,
        version: '1.0.0',
      },
      {
        capabilities: {
          prompts: {},
          resources: {},
          tools: {},
        },
      },
    );

    const initRequestOptions = isInit
      ? {
          timeout: Number(config.initTimeout) || 60000,
        }
      : undefined;

    // Get request options from server configuration, with fallbacks
    const serverRequestOptions = conf.options || {};
    const requestOptions = {
      timeout: serverRequestOptions.timeout || 60000,
      resetTimeoutOnProgress: serverRequestOptions.resetTimeoutOnProgress || false,
      maxTotalTimeout: serverRequestOptions.maxTotalTimeout,
    };

    // Create server info first and keep reference to it
    const serverInfo: ServerInfo = {
      name,
      owner: conf.owner,
      status: 'connecting',
      error: null,
      tools: [],
      prompts: [],
      client,
      transport,
      options: requestOptions,
      createTime: Date.now(),
    };
    serverInfos.push(serverInfo);

    client
      .connect(transport, initRequestOptions || requestOptions)
      .then(() => {
        console.log(`Successfully connected client for server: ${name}`);
        const capabilities: ServerCapabilities | undefined = client.getServerCapabilities();
        console.log(`Server capabilities: ${JSON.stringify(capabilities)}`);

        let dataError: Error | null = null;
        if (capabilities?.tools) {
          client
            .listTools({}, initRequestOptions || requestOptions)
            .then((tools) => {
              console.log(`Successfully listed ${tools.tools.length} tools for server: ${name}`);
              serverInfo.tools = tools.tools.map((tool) => ({
                name: `${name}-${tool.name}`,
                description: tool.description || '',
                inputSchema: cleanInputSchema(tool.inputSchema || {}),
              }));
              // Save tools as vector embeddings for search
              saveToolsAsVectorEmbeddings(name, serverInfo.tools);
            })
            .catch((error) => {
              console.error(
                `Failed to list tools for server ${name} by error: ${error} with stack: ${error.stack}`,
              );
              dataError = error;
            });
        }

        if (capabilities?.prompts) {
          client
            .listPrompts({}, initRequestOptions || requestOptions)
            .then((prompts) => {
              console.log(
                `Successfully listed ${prompts.prompts.length} prompts for server: ${name}`,
              );
              serverInfo.prompts = prompts.prompts.map((prompt) => ({
                name: `${name}-${prompt.name}`,
                title: prompt.title,
                description: prompt.description,
                arguments: prompt.arguments,
              }));
            })
            .catch((error) => {
              console.error(
                `Failed to list prompts for server ${name} by error: ${error} with stack: ${error.stack}`,
              );
              dataError = error;
            });
        }

        if (!dataError) {
          serverInfo.status = 'connected';
          serverInfo.error = null;

          // Set up keep-alive ping for SSE connections
          setupKeepAlive(serverInfo, conf);
        } else {
          serverInfo.status = 'disconnected';
          serverInfo.error = `Failed to list data: ${dataError} `;
        }
      })
      .catch((error) => {
        console.error(
          `Failed to connect client for server ${name} by error: ${error} with stack: ${error.stack}`,
        );
        serverInfo.status = 'disconnected';
        serverInfo.error = `Failed to connect: ${error.stack} `;
      });
    console.log(`Initialized client for server: ${name}`);
  }

  return serverInfos;
};

// Register all MCP tools
export const registerAllTools = async (isInit: boolean, serverName?: string): Promise<void> => {
  await initializeClientsFromSettings(isInit, serverName);
};

// Get all server information
export const getServersInfo = async (): Promise<Omit<ServerInfo, 'client' | 'transport'>[]> => {
  // Avoid DB access if not connected (e.g., during unit tests)
  const serverConfigs = isDatabaseConnected()
    ? await getMcpServerService().getServersAsConfig()
    : {} as Record<string, any>;
  const dataService = getDataService();
  const filterServerInfos: ServerInfo[] = dataService.filterData
    ? dataService.filterData(serverInfos)
    : serverInfos;
  const infos = filterServerInfos.map(({ name, status, tools, prompts, createTime, error }) => {
    const serverConfig = serverConfigs[name];
    const enabled = serverConfig ? serverConfig.enabled !== false : true;

    // Add enabled status and custom description to each tool
    const toolsWithEnabled = tools.map((tool) => {
      const toolConfig = serverConfig?.tools?.[tool.name];
      return {
        ...tool,
        description: toolConfig?.description || tool.description, // Use custom description if available
        enabled: toolConfig?.enabled !== false, // Default to true if not explicitly disabled
      };
    });

    const promptsWithEnabled = prompts.map((prompt) => {
      const promptConfig = serverConfig?.prompts?.[prompt.name];
      return {
        ...prompt,
        description: promptConfig?.description || prompt.description, // Use custom description if available
        enabled: promptConfig?.enabled !== false, // Default to true if not explicitly disabled
      };
    });

    return {
      name,
      status,
      error,
      tools: toolsWithEnabled,
      prompts: promptsWithEnabled,
      createTime,
      enabled,
    };
  });
  infos.sort((a, b) => {
    if (a.enabled === b.enabled) return 0;
    return a.enabled ? -1 : 1;
  });
  return infos;
};

// Get server by name
const getServerByName = (name: string): ServerInfo | undefined => {
  return serverInfos.find((serverInfo) => serverInfo.name === name);
};

// Filter tools by server configuration
const filterToolsByConfig = async (serverName: string, tools: Tool[]): Promise<Tool[]> => {
  const mcpServerService = getMcpServerService();
  const server = await mcpServerService.getServerByName(serverName);
  const serverConfig = server ? mcpServerService.entityToConfig(server) : null;

  if (!serverConfig || !serverConfig.tools) {
    // If no tool configuration exists, all tools are enabled by default
    return tools;
  }

  return tools.filter((tool) => {
    const toolConfig = serverConfig.tools?.[tool.name];
    // If tool is not in config, it's enabled by default
    return toolConfig?.enabled !== false;
  });
};

// Get server by tool name
const getServerByTool = (toolName: string): ServerInfo | undefined => {
  return serverInfos.find((serverInfo) => serverInfo.tools.some((tool) => tool.name === toolName));
};

// Add new server
export const addServer = async (
  name: string,
  config: ServerConfig,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const mcpServerService = getMcpServerService();
    
    // Check if server already exists
    const exists = await mcpServerService.serverExists(name);
    if (exists) {
      return { success: false, message: 'Server name already exists' };
    }

    // Create server in database
    await mcpServerService.createServer(name, config);
    return { success: true, message: 'Server added successfully' };
  } catch (error) {
    console.error(`Failed to add server: ${name}`, error);
    return { success: false, message: 'Failed to add server' };
  }
};

// Remove server
export const removeServer = async (name: string): Promise<{ success: boolean; message?: string }> => {
  try {
    const mcpServerService = getMcpServerService();
    
    // Check if server exists
    const exists = await mcpServerService.serverExists(name);
    if (!exists) {
      return { success: false, message: 'Server not found' };
    }

    // Delete server from database
    const deleted = await mcpServerService.deleteServer(name);
    if (!deleted) {
      return { success: false, message: 'Failed to delete server from database' };
    }

    // Remove from runtime server infos
    serverInfos = serverInfos.filter((serverInfo) => serverInfo.name !== name);
    return { success: true, message: 'Server removed successfully' };
  } catch (error) {
    console.error(`Failed to remove server: ${name}`, error);
    return { success: false, message: `Failed to remove server: ${error}` };
  }
};

// Add or update server (supports overriding existing servers for DXT)
export const addOrUpdateServer = async (
  name: string,
  config: ServerConfig,
  allowOverride: boolean = false,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const mcpServerService = getMcpServerService();
    const exists = await mcpServerService.serverExists(name);

    if (exists && !allowOverride) {
      return { success: false, message: 'Server name already exists' };
    }

    // If overriding and this is a DXT server (stdio type with file paths),
    // we might want to clean up old files in the future
    if (exists && config.type === 'stdio') {
      // Close existing server connections
      closeServer(name);
      // Remove from server infos
      serverInfos = serverInfos.filter((serverInfo) => serverInfo.name !== name);
    }

    if (exists) {
      // Update existing server
      await mcpServerService.updateServer(name, config);
    } else {
      // Create new server
      await mcpServerService.createServer(name, config);
    }

    const action = exists ? 'updated' : 'added';
    return { success: true, message: `Server ${action} successfully` };
  } catch (error) {
    console.error(`Failed to add/update server: ${name}`, error);
    return { success: false, message: 'Failed to add/update server' };
  }
};

// Close server client and transport
function closeServer(name: string) {
  const serverInfo = serverInfos.find((serverInfo) => serverInfo.name === name);
  if (serverInfo && serverInfo.client && serverInfo.transport) {
    // Clear keep-alive interval if exists
    if (serverInfo.keepAliveIntervalId) {
      clearInterval(serverInfo.keepAliveIntervalId);
      serverInfo.keepAliveIntervalId = undefined;
      console.log(`Cleared keep-alive interval for server: ${serverInfo.name}`);
    }

    serverInfo.client.close();
    serverInfo.transport.close();
    console.log(`Closed client and transport for server: ${serverInfo.name}`);
    // TODO kill process
  }
}

// Toggle server enabled status
export const toggleServerStatus = async (
  name: string,
  enabled: boolean,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const mcpServerService = getMcpServerService();
    
    // Check if server exists
    const exists = await mcpServerService.serverExists(name);
    if (!exists) {
      return { success: false, message: 'Server not found' };
    }

    // Update the enabled status in database
    const success = await mcpServerService.toggleServer(name, enabled);
    if (!success) {
      return { success: false, message: 'Failed to update server status in database' };
    }

    // If disabling, disconnect the server and remove from active servers
    if (!enabled) {
      closeServer(name);

      // Update the server info to show as disconnected and disabled
      const index = serverInfos.findIndex((s) => s.name === name);
      if (index !== -1) {
        serverInfos[index] = {
          ...serverInfos[index],
          status: 'disconnected',
          enabled: false,
        };
      }
    }

    return { success: true, message: `Server ${enabled ? 'enabled' : 'disabled'} successfully` };
  } catch (error) {
    console.error(`Failed to toggle server status: ${name}`, error);
    return { success: false, message: 'Failed to toggle server status' };
  }
};

export const handleListToolsRequest = async (_: any, extra: any) => {
  const sessionId = extra.sessionId || '';
  // Use extra.group if provided (for Xiaozhi endpoints), otherwise fall back to session-based lookup
  const group = extra.group || getGroup(sessionId);
  console.log(`Handling ListToolsRequest for group: ${group}`);

  // Special handling for $smart group to return special tools
  if (group === '$smart') {
    return {
      tools: [
        {
          name: 'search_tools',
          description: (() => {
            // Get info about available servers
            const availableServers = serverInfos.filter(
              (server) => server.status === 'connected' && server.enabled !== false,
            );
            // Create simple server information with only server names
            const serversList = availableServers
              .map((server) => {
                return `${server.name}`;
              })
              .join(', ');
            return `STEP 1 of 2: Use this tool FIRST to discover and search for relevant tools across all available servers. This tool and call_tool work together as a two-step process: 1) search_tools to find what you need, 2) call_tool to execute it.

For optimal results, use specific queries matching your exact needs. Call this tool multiple times with different queries for different parts of complex tasks. Example queries: "image generation tools", "code review tools", "data analysis", "translation capabilities", etc. Results are sorted by relevance using vector similarity.

After finding relevant tools, you MUST use the call_tool to actually execute them. The search_tools only finds tools - it doesn't execute them.

Available servers: ${serversList}`;
          })(),
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description:
                  'The search query to find relevant tools. Be specific and descriptive about the task you want to accomplish.',
              },
              limit: {
                type: 'integer',
                description:
                  'Maximum number of results to return. Use higher values (20-30) for broad searches and lower values (5-10) for specific searches.',
                default: 10,
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'call_tool',
          description:
            "STEP 2 of 2: Use this tool AFTER search_tools to actually execute/invoke any tool you found. This is the execution step - search_tools finds tools, call_tool runs them.\n\nWorkflow: search_tools → examine results → call_tool with the chosen tool name and required arguments.\n\nIMPORTANT: Always check the tool's inputSchema from search_tools results before invoking to ensure you provide the correct arguments. The search results will show you exactly what parameters each tool expects.",
          inputSchema: {
            type: 'object',
            properties: {
              toolName: {
                type: 'string',
                description: 'The exact name of the tool to invoke (from search_tools results)',
              },
              arguments: {
                type: 'object',
                description:
                  'The arguments to pass to the tool based on its inputSchema (optional if tool requires no arguments)',
              },
            },
            required: ['toolName'],
          },
        },
      ],
    };
  }

  // Filter servers - need to handle async getServersInGroup
  const filteredServerInfos = getDataService().filterData(serverInfos);
  const allServerInfos = [];
  
  for (const serverInfo of filteredServerInfos) {
    if (serverInfo.enabled === false) continue;
    if (!group) {
      allServerInfos.push(serverInfo);
      continue;
    }
    
    const serversInGroup = await getServersInGroup(group);
    if (!serversInGroup || serversInGroup.length === 0) {
      if (serverInfo.name === group) {
        allServerInfos.push(serverInfo);
      }
    } else if (serversInGroup.includes(serverInfo.name)) {
      allServerInfos.push(serverInfo);
    }
  }

  const allTools = [];
  for (const serverInfo of allServerInfos) {
    if (serverInfo.tools && serverInfo.tools.length > 0) {
      // Filter tools based on server configuration
      let enabledTools = await filterToolsByConfig(serverInfo.name, serverInfo.tools);

      // If this is a group request, apply group-level tool filtering
      if (group) {
        const serverConfig = await getServerConfigInGroup(group, serverInfo.name);
        if (serverConfig && serverConfig.tools !== 'all' && Array.isArray(serverConfig.tools)) {
          const allowedToolNames = serverConfig.tools.map(
            (toolName: string) => `${serverInfo.name}-${toolName}`,
          );
          enabledTools = enabledTools.filter((tool) => allowedToolNames.includes(tool.name));
        }
      }

      // Apply custom descriptions from server configuration
      const mcpServerService = getMcpServerService();
      const serverConfigs = await mcpServerService.getServersAsConfig();
      const serverConfig = serverConfigs[serverInfo.name];
      const toolsWithCustomDescriptions = enabledTools.map((tool) => {
        const toolConfig = serverConfig?.tools?.[tool.name];
        return {
          ...tool,
          description: toolConfig?.description || tool.description, // Use custom description if available
        };
      });

      allTools.push(...toolsWithCustomDescriptions);
    }
  }

  return {
    tools: allTools,
  };
};

export const handleCallToolRequest = async (request: any, extra: any) => {
  console.log(`Handling CallToolRequest for tool: ${JSON.stringify(request.params)}`);
  try {
    // Special handling for agent group tools
    if (request.params.name === 'search_tools') {
      const { query, limit = 10 } = request.params.arguments || {};

      if (!query || typeof query !== 'string') {
        throw new Error('Query parameter is required and must be a string');
      }

      const limitNum = Math.min(Math.max(parseInt(String(limit)) || 10, 1), 100);

      // Dynamically adjust threshold based on query characteristics
      let thresholdNum = 0.3; // Default threshold

      // For more general queries, use a lower threshold to get more diverse results
      if (query.length < 10 || query.split(' ').length <= 2) {
        thresholdNum = 0.2;
      }

      // For very specific queries, use a higher threshold for more precise results
      if (query.length > 30 || query.includes('specific') || query.includes('exact')) {
        thresholdNum = 0.4;
      }

      console.log(`Using similarity threshold: ${thresholdNum} for query: "${query}"`);
      // 支持端点/分组透传的限制范围
      const servers: string[] | undefined = Array.isArray(extra?.serverNamesScope) && extra.serverNamesScope.length > 0
        ? extra.serverNamesScope
        : undefined;

      const searchResults = await searchToolsByVector(query, limitNum, thresholdNum, servers);
      console.log(`Search results: ${JSON.stringify(searchResults)}`);
      // Find actual tool information from serverInfos by serverName and toolName
      const tools = await Promise.all(
        searchResults.map(async (result) => {
          // Find the server in serverInfos
          const server = serverInfos.find(
            (serverInfo) =>
              serverInfo.name === result.serverName &&
              serverInfo.status === 'connected' &&
              serverInfo.enabled !== false,
          );
          if (server && server.tools && server.tools.length > 0) {
            // Find the tool in server.tools
            const actualTool = server.tools.find((tool) => tool.name === result.toolName);
            if (actualTool) {
              // Check if the tool is enabled in configuration
              const enabledTools = await filterToolsByConfig(server.name, [actualTool]);
              if (enabledTools.length > 0) {
                // Get server configurations from database
                const mcpServerService = getMcpServerService();
                const serverConfigs = await mcpServerService.getServersAsConfig();
                const serverConfig = serverConfigs[server.name];
                const toolConfig = serverConfig?.tools?.[actualTool.name];

                // Return the actual tool info from serverInfos with custom description
                return {
                  ...actualTool,
                  description: toolConfig?.description || actualTool.description,
                };
              }
            }
          }

          // Fallback to search result if server or tool not found or disabled
          return {
            name: result.toolName,
            description: result.description || '',
            inputSchema: cleanInputSchema(result.inputSchema || {}),
          };
        }),
      );

      // Additional filter to remove tools that are disabled  
      const filteredTools = await Promise.all(
        tools.map(async (tool) => {
          if (tool.name) {
            const serverName = searchResults.find((r) => r.toolName === tool.name)?.serverName;
            if (serverName) {
              const enabledTools = await filterToolsByConfig(serverName, [tool as Tool]);
              return enabledTools.length > 0 ? tool : null;
            }
          }
          return tool; // Keep fallback results
        })
      );
      
      // Remove null values
      const finalTools = filteredTools.filter((tool) => tool !== null);

      // Add usage guidance to the response
      const response = {
        tools: finalTools,
        metadata: {
          query: query,
          threshold: thresholdNum,
          totalResults: finalTools.length,
          guideline:
            tools.length > 0
              ? "Found relevant tools. If these tools don't match exactly what you need, try another search with more specific keywords."
              : 'No tools found. Try broadening your search or using different keywords.',
          nextSteps:
            tools.length > 0
              ? 'To use a tool, call call_tool with the toolName and required arguments.'
              : 'Consider searching for related capabilities or more general terms.',
        },
      };

      // Return in the same format as handleListToolsRequest
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response),
          },
        ],
      };
    }

    // Special handling for call_tool
    if (request.params.name === 'call_tool') {
      let { toolName } = request.params.arguments || {};
      if (!toolName) {
        throw new Error('toolName parameter is required');
      }

      const { arguments: toolArgs = {} } = request.params.arguments || {};
      let targetServerInfo: ServerInfo | undefined;
      if (extra && extra.server) {
        targetServerInfo = getServerByName(extra.server);
      } else {
        // Find the first server that has this tool
        targetServerInfo = serverInfos.find(
          (serverInfo) =>
            serverInfo.status === 'connected' &&
            serverInfo.enabled !== false &&
            serverInfo.tools.some((tool) => tool.name === toolName),
        );
      }

      if (!targetServerInfo) {
        throw new Error(`No available servers found with tool: ${toolName}`);
      }

      // Check if the tool exists on the server
      const toolExists = targetServerInfo.tools.some((tool) => tool.name === toolName);
      if (!toolExists) {
        throw new Error(`Tool '${toolName}' not found on server '${targetServerInfo.name}'`);
      }

      // Handle OpenAPI servers differently
      if (targetServerInfo.openApiClient) {
        // For OpenAPI servers, use the OpenAPI client
        const openApiClient = targetServerInfo.openApiClient;

        // Use toolArgs if it has properties, otherwise fallback to request.params.arguments
        const finalArgs =
          toolArgs && Object.keys(toolArgs).length > 0 ? toolArgs : request.params.arguments || {};

        console.log(
          `Invoking OpenAPI tool '${toolName}' on server '${targetServerInfo.name}' with arguments: ${JSON.stringify(finalArgs)}`,
        );

        // Remove server prefix from tool name if present
        const cleanToolName = toolName.startsWith(`${targetServerInfo.name}-`)
          ? toolName.replace(`${targetServerInfo.name}-`, '')
          : toolName;

        const result = await openApiClient.callTool(cleanToolName, finalArgs);

        console.log(`OpenAPI tool invocation result: ${JSON.stringify(result)}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }

      // Call the tool on the target server (MCP servers)
      const client = targetServerInfo.client;
      if (!client) {
        throw new Error(`Client not found for server: ${targetServerInfo.name}`);
      }

      // Use toolArgs if it has properties, otherwise fallback to request.params.arguments
      const finalArgs =
        toolArgs && Object.keys(toolArgs).length > 0 ? toolArgs : request.params.arguments || {};

      console.log(
        `Invoking tool '${toolName}' on server '${targetServerInfo.name}' with arguments: ${JSON.stringify(finalArgs)}`,
      );

      toolName = toolName.startsWith(`${targetServerInfo.name}-`)
        ? toolName.replace(`${targetServerInfo.name}-`, '')
        : toolName;
      const result = await callToolWithReconnect(
        targetServerInfo,
        {
          name: toolName,
          arguments: finalArgs,
        },
        targetServerInfo.options || {},
      );

      console.log(`Tool invocation result: ${JSON.stringify(result)}`);
      return result;
    }

    // Regular tool handling
    const serverInfo = getServerByTool(request.params.name);
    if (!serverInfo) {
      throw new Error(`Server not found: ${request.params.name}`);
    }

    // Handle OpenAPI servers differently
    if (serverInfo.openApiClient) {
      // For OpenAPI servers, use the OpenAPI client
      const openApiClient = serverInfo.openApiClient;

      // Remove server prefix from tool name if present
      const cleanToolName = request.params.name.startsWith(`${serverInfo.name}-`)
        ? request.params.name.replace(`${serverInfo.name}-`, '')
        : request.params.name;

      console.log(
        `Invoking OpenAPI tool '${cleanToolName}' on server '${serverInfo.name}' with arguments: ${JSON.stringify(request.params.arguments)}`,
      );

      const result = await openApiClient.callTool(cleanToolName, request.params.arguments || {});

      console.log(`OpenAPI tool invocation result: ${JSON.stringify(result)}`);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      };
    }

    // Handle MCP servers
    const client = serverInfo.client;
    if (!client) {
      throw new Error(`Client not found for server: ${serverInfo.name}`);
    }

    request.params.name = request.params.name.startsWith(`${serverInfo.name}-`)
      ? request.params.name.replace(`${serverInfo.name}-`, '')
      : request.params.name;
    const result = await callToolWithReconnect(
      serverInfo,
      request.params,
      serverInfo.options || {},
    );
    console.log(`Tool call result: ${JSON.stringify(result)}`);
    return result;
  } catch (error) {
    console.error(`Error handling CallToolRequest: ${error}`);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error}`,
        },
      ],
      isError: true,
    };
  }
};

export const handleGetPromptRequest = async (request: any, extra: any) => {
  try {
    const { name, arguments: promptArgs } = request.params;
    let server: ServerInfo | undefined;
    if (extra && extra.server) {
      server = getServerByName(extra.server);
    } else {
      // Find the first server that has this tool
      server = serverInfos.find(
        (serverInfo) =>
          serverInfo.status === 'connected' &&
          serverInfo.enabled !== false &&
          serverInfo.prompts.find((prompt) => prompt.name === name),
      );
    }
    if (!server) {
      throw new Error(`Server not found: ${name}`);
    }

    // Remove server prefix from prompt name if present
    const cleanPromptName = name.startsWith(`${server.name}-`)
      ? name.replace(`${server.name}-`, '')
      : name;

    const promptParams = {
      name: cleanPromptName || '',
      arguments: promptArgs,
    };
    // Log the final promptParams
    console.log(`Calling getPrompt with params: ${JSON.stringify(promptParams)}`);
    const prompt = await server.client?.getPrompt(promptParams);
    console.log(`Received prompt: ${JSON.stringify(prompt)}`);
    if (!prompt) {
      throw new Error(`Prompt not found: ${cleanPromptName}`);
    }

    return prompt;
  } catch (error) {
    console.error(`Error handling GetPromptRequest: ${error}`);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error}`,
        },
      ],
      isError: true,
    };
  }
};

export const handleListPromptsRequest = async (_: any, extra: any) => {
  const sessionId = extra.sessionId || '';
  const group = getGroup(sessionId);
  console.log(`Handling ListPromptsRequest for group: ${group}`);

  // Filter servers - need to handle async getServersInGroup
  const filteredServerInfos = getDataService().filterData(serverInfos);
  const allServerInfos = [];
  
  for (const serverInfo of filteredServerInfos) {
    if (serverInfo.enabled === false) continue;
    if (!group) {
      allServerInfos.push(serverInfo);
      continue;
    }
    
    const serversInGroup = await getServersInGroup(group);
    if (!serversInGroup || serversInGroup.length === 0) {
      if (serverInfo.name === group) {
        allServerInfos.push(serverInfo);
      }
    } else if (serversInGroup.includes(serverInfo.name)) {
      allServerInfos.push(serverInfo);
    }
  }

  const allPrompts: any[] = [];
  for (const serverInfo of allServerInfos) {
    if (serverInfo.prompts && serverInfo.prompts.length > 0) {
      // Filter prompts based on server configuration
      const mcpServerService = getMcpServerService();
      const serverConfigs = await mcpServerService.getServersAsConfig();
      const serverConfig = serverConfigs[serverInfo.name];

      let enabledPrompts = serverInfo.prompts;
      if (serverConfig && serverConfig.prompts) {
        enabledPrompts = serverInfo.prompts.filter((prompt: any) => {
          const promptConfig = serverConfig.prompts?.[prompt.name];
          // If prompt is not in config, it's enabled by default
          return promptConfig?.enabled !== false;
        });
      }

      // If this is a group request, apply group-level prompt filtering
      if (group) {
        const serverConfigInGroup = await getServerConfigInGroup(group, serverInfo.name);
        if (
          serverConfigInGroup &&
          serverConfigInGroup.tools !== 'all' &&
          Array.isArray(serverConfigInGroup.tools)
        ) {
          // Note: Group config uses 'tools' field but we're filtering prompts here
          // This might be a design decision to control access at the server level
        }
      }

      // Apply custom descriptions from server configuration
      const promptsWithCustomDescriptions = enabledPrompts.map((prompt: any) => {
        const promptConfig = serverConfig?.prompts?.[prompt.name];
        return {
          ...prompt,
          description: promptConfig?.description || prompt.description, // Use custom description if available
        };
      });

      allPrompts.push(...promptsWithCustomDescriptions);
    }
  }

  return {
    prompts: allPrompts,
  };
};

// Create McpServer instance
export const createMcpServer = async (name: string, version: string, group?: string): Promise<Server> => {
  // Determine server name based on routing type
  let serverName = name;

  if (group) {
    // Check if it's a group or a single server
    const serversInGroup = await getServersInGroup(group);
    if (!serversInGroup || serversInGroup.length === 0) {
      // Single server routing
      serverName = `${name}_${group}`;
    } else {
      // Group routing
      serverName = `${name}_${group}_group`;
    }
  }
  // If no group, use default name (global routing)

  const server = new Server(
    { name: serverName, version },
    { capabilities: { tools: {}, prompts: {}, resources: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, handleListToolsRequest);
  server.setRequestHandler(CallToolRequestSchema, handleCallToolRequest);
  server.setRequestHandler(GetPromptRequestSchema, handleGetPromptRequest);
  server.setRequestHandler(ListPromptsRequestSchema, handleListPromptsRequest);
  return server;
};
