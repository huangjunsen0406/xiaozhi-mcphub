import os from 'os';
import path from 'path';
import fs from 'fs';
import { createHash } from 'node:crypto';
import treeKill from 'tree-kill';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import {
  type Client,
  SSEClientTransport,
  StreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/client';
import {
  Server,
  type ServerCapabilities,
  type Prompt as McpPrompt,
  type Resource as McpResource,
  type Tool as McpTool,
} from '@modelcontextprotocol/server';
import { LegacyMcpClient } from '../clients/legacyMcpClient.js';
import { LEGACY_PROTOCOL_VERSIONS, resolveUpstreamProtocolMode } from '../utils/mcpProtocol.js';
import { getMcpRequestGroup } from '../utils/mcpRequestGroup.js';
import { remainingListTtl } from '../utils/listFreshness.js';
import {
  applyHiddenParams,
  findToolConfig,
  removeHiddenArguments,
  type ToolConfig,
} from '../utils/toolConfig.js';
import { projectGroupToolName, assertValidGroupToolNames } from '../utils/groupToolNames.js';
import { compatibleToolNames } from '../utils/compatibleToolNames.js';
import { createFetchWithProxy, getProxyConfigFromEnv } from './proxy.js';
import { assertSafeUrl, createRedirectValidatingFetch } from '../utils/ssrf.js';
import { getUserDao } from '../dao/index.js';
import {
  ServerInfo,
  ServerConfig,
  Tool,
  Resource,
  ProxychainsConfig,
  IGroupServerConfig,
} from '../types/index.js';
import { expandEnvVars, replaceEnvVars, getNameSeparator } from '../config/index.js';
import config from '../config/index.js';
import { getGroup } from './sseService.js';
import { getServerConfigInGroup, normalizeGroupServers } from './groupService.js';
import { removeServerToolEmbeddings, saveToolsAsVectorEmbeddings } from './vectorSearchService.js';
import { OpenAPIClient } from '../clients/openapi.js';
import { RequestContextService } from './requestContextService.js';
import { UserContextService } from './userContextService.js';
import { getDataService } from './services.js';
import {
  getServerDao,
  getGroupDao,
  getSystemConfigDao,
  getBuiltinPromptDao,
  getBuiltinResourceDao,
  ServerConfigWithName,
} from '../dao/index.js';
import { initializeAllOAuthClients } from './oauthService.js';
import { createOAuthProvider } from './mcpOAuthProvider.js';
import {
  initSmartRoutingService,
  getSmartRoutingTools,
  handleSearchToolsRequest,
  handleDescribeToolRequest,
  isSmartRoutingGroup,
} from './smartRoutingService.js';
import { getActivityLoggingService } from './activityLoggingService.js';
import { maybeCompressToolResult } from './toolResultCompressionService.js';
import {
  getUserConfigOrEmpty,
  mergeModelscope,
} from '../utils/effectiveConfig.js';
import {
  assertHostedToolAllowed,
  filterHostedTools,
  HostedCreditReservation,
  reserveHostedToolCall,
  settleHostedToolCall,
} from './hostedAuthService.js';
import {
  formatErrorForLogging,
  sanitizeStringForLogging,
  summarizeErrorForLogging,
} from '../utils/serialization.js';
import {
  MCP_APPS_CAPABILITIES,
  filterModelVisibleTools,
  hasMcpAppsCapability,
  isAppOnlyTool,
  stripMcpAppsMetadata,
} from '../utils/mcpApps.js';
import { supportsCacheRefresh, injectRefreshFlag, clearRunnerCache } from '../utils/cacheUtils.js';
import { expandServerConfig, getServerEnvironment } from './serverConfigEnvironment.js';

const servers: { [sessionId: string]: Server } = {};

import { setupClientKeepAlive } from './keepAliveService.js';

type FetchLike = (url: string | URL, init?: RequestInit) => Promise<Response>;

/**
 * Check if proxychains4 is available on the system (Linux/macOS only).
 * Returns the path to proxychains4 if found, null otherwise.
 */
const findProxychains4 = (): string | null => {
  // Windows is not supported
  if (process.platform === 'win32') {
    return null;
  }

  // Common proxychains4 binary paths
  const possiblePaths = [
    '/usr/bin/proxychains4',
    '/usr/local/bin/proxychains4',
    '/opt/homebrew/bin/proxychains4', // macOS Homebrew ARM
    '/usr/local/Cellar/proxychains-ng/*/bin/proxychains4', // macOS Homebrew Intel
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Try to find in PATH
  const pathEnv = process.env.PATH || '';
  const pathDirs = pathEnv.split(path.delimiter);
  for (const dir of pathDirs) {
    const fullPath = path.join(dir, 'proxychains4');
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
};

/**
 * Generate a temporary proxychains4 configuration file.
 * Returns the path to the generated config file.
 */
const generateProxychainsConfig = (
  serverName: string,
  proxyConfig: ProxychainsConfig,
): string | null => {
  // If a custom config path is provided, use it directly
  if (proxyConfig.configPath) {
    if (fs.existsSync(proxyConfig.configPath)) {
      return proxyConfig.configPath;
    }
    console.warn(`[${serverName}] Custom proxychains config not found: ${proxyConfig.configPath}`);
    return null;
  }

  // Validate required fields
  if (!proxyConfig.host || !proxyConfig.port) {
    console.warn(`[${serverName}] Proxy host and port are required for proxychains4`);
    return null;
  }

  const proxyType = proxyConfig.type || 'socks5';
  const proxyLine =
    proxyConfig.username && proxyConfig.password
      ? `${proxyType} ${proxyConfig.host} ${proxyConfig.port} ${proxyConfig.username} ${proxyConfig.password}`
      : `${proxyType} ${proxyConfig.host} ${proxyConfig.port}`;

  const configContent = `# Proxychains4 configuration for MCP server: ${serverName}
# Generated by MCPHub

localnet 127.0.0.0/255.0.0.0
localnet 10.0.0.0/255.0.0.0
localnet 172.16.0.0/255.240.0.0
localnet 192.168.0.0/255.255.0.0

strict_chain
proxy_dns
remote_dns_subnet 224
tcp_read_time_out 15000
tcp_connect_time_out 8000

[ProxyList]
${proxyLine}
`;

  // Create temp directory if needed
  const tempDir = path.join(os.tmpdir(), 'mcphub-proxychains');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Write config file
  const configPath = path.join(tempDir, `${serverName.replace(/[^a-zA-Z0-9-_]/g, '_')}.conf`);
  fs.writeFileSync(configPath, configContent, 'utf-8');
  console.log(`[${serverName}] Generated proxychains4 config: ${configPath}`);

  return configPath;
};

/**
 * Validate that a command is safe to execute.
 * Blocks shell builtins and common injection patterns.
 */
const isSafeCommand = (command: string): boolean => {
  // Block shell builtins that could be used for command injection
  const blockedCommands = new Set([
    'sh', 'bash', 'zsh', 'fish', 'csh', 'ksh', 'tcsh',
    'cmd', 'powershell', 'pwsh',
    'eval', 'exec', 'source', '.',
  ]);

  const basename = command.split('/').pop()?.split('\\').pop()?.toLowerCase() || '';
  if (blockedCommands.has(basename)) {
    return false;
  }

  // Block commands with shell metacharacters
  if (/[;&|`$(){}[\]!]/.test(command)) {
    return false;
  }

  return true;
};

/**
 * Sanitize arguments to prevent command injection.
 * Removes shell metacharacters and dangerous patterns.
 */
const sanitizeArgs = (args: string[]): string[] => {
  return args.map(arg => {
    // Remove shell metacharacters that could be used for injection
    // Allow common flags (-f, --flag, -vvv) and paths
    if (/^[a-zA-Z0-9._/\\:@=+,-]+$/.test(arg)) {
      return arg;
    }
    // For arguments with special characters, log a warning
    // Also block redirection operators (>, <, >>) and newlines
    console.warn(`[proxychains] Potentially unsafe argument blocked: ${arg}`);
    return arg.replace(/[;&|`$(){}[\]!><\n\r]/g, '');
  });
};

/**
 * Wrap a command with proxychains4 if proxy is configured and available.
 * Returns modified command and args if proxychains4 is used, original values otherwise.
 */
const wrapWithProxychains = (
  serverName: string,
  command: string,
  args: string[],
  proxyConfig?: ProxychainsConfig,
): { command: string; args: string[] } => {
  // Skip if proxy is not enabled or not configured
  if (!proxyConfig?.enabled) {
    return { command, args };
  }

  // Check platform - Windows is not supported
  if (process.platform === 'win32') {
    console.warn(
      `[${serverName}] proxychains4 proxy is not supported on Windows, ignoring proxy configuration`,
    );
    return { command, args };
  }

  // SECURITY: Validate command is safe
  if (!isSafeCommand(command)) {
    console.error(
      `[${serverName}] Blocked unsafe command for proxychains4 wrapping: ${command}`,
    );
    throw new Error(
      `[${serverName}] Unsafe command blocked: ${command}. Shell builtins and metacharacters are not allowed.`,
    );
  }

  // Find proxychains4 binary
  const proxychains4Path = findProxychains4();
  if (!proxychains4Path) {
    console.warn(
      `[${serverName}] proxychains4 not found on system, install it with: apt install proxychains4 (Debian/Ubuntu) or brew install proxychains-ng (macOS)`,
    );
    return { command, args };
  }

  // Generate or get config file
  const configPath = generateProxychainsConfig(serverName, proxyConfig);
  if (!configPath) {
    console.warn(`[${serverName}] Failed to setup proxychains4 configuration, skipping proxy`);
    return { command, args };
  }

  // SECURITY: Sanitize arguments
  const sanitizedArgs = sanitizeArgs(args);

  // Wrap command with proxychains4
  console.log(
    `[${serverName}] Using proxychains4 proxy: ${proxyConfig.type || 'socks5'}://${proxyConfig.host}:${proxyConfig.port}`,
  );

  return {
    command: proxychains4Path,
    args: ['-f', configPath, command, ...sanitizedArgs],
  };
};

export const initUpstreamServers = async (): Promise<void> => {
  // Initialize OAuth clients for servers with dynamic registration
  await initializeAllOAuthClients();

  // Register all tools from upstream servers
  await registerAllTools(true);

  // Initialize smart routing service with references to mcpService functions
  initSmartRoutingService(() => serverInfos, filterToolsByConfig, filterToolsByGroup);

  // 小智客户端需等待上游服务器稳定后再连接，但不能阻塞 initUpstreamServers —
  // 调用方要等它 resolve 后才注册 /mcp 与 /sse 路由。
  void startXiaozhiWhenServersSettle();
};

/**
 * Waits for every upstream server to settle (connected or disconnected), then brings up
 * the Xiaozhi client so it advertises a complete tool list. Runs detached from startup.
 */
const startXiaozhiWhenServersSettle = async (): Promise<void> => {
  const maxWaitTime = 30000; // 最多等待30秒
  const checkInterval = 1000; // 每1秒检查一次
  let waited = 0;

  console.log('等待所有 MCP 服务器完全初始化...');
  while (waited < maxWaitTime) {
    const allConnected = serverInfos.every(
      (server) => server.status === 'connected' || server.status === 'disconnected',
    );

    if (allConnected) {
      const connectedServers = serverInfos.filter((server) => server.status === 'connected');
      const totalTools = connectedServers.reduce(
        (sum, server) => sum + (server.tools?.length || 0),
        0,
      );
      console.log(
        `所有 MCP 服务器初始化完成！连接的服务器: ${connectedServers.length}, 总工具数: ${totalTools}`,
      );
      break;
    }

    await new Promise((resolve) => {
      const timer = setTimeout(resolve, checkInterval);
      timer.unref?.();
    });
    waited += checkInterval;
  }

  if (waited >= maxWaitTime) {
    console.warn('等待 MCP 服务器初始化超时，继续启动小智客户端');
  }

  // 初始化小智客户端服务
  try {
    const { xiaozhiEndpointService } = await import('./xiaozhiEndpointService.js');
    if (xiaozhiEndpointService.isEnabled()) {
      await xiaozhiEndpointService.initializeEndpoints();
      console.log('小智客户端服务已启动');

      // 在所有服务器稳定后，立即通知小智工具列表可用
      try {
        await xiaozhiEndpointService.notifyToolsChanged();
        console.log('已通知小智初始工具列表');
      } catch (error) {
        console.error('通知小智初始工具列表失败:', error);
      }
    } else {
      console.log('小智客户端服务未启用');
    }
  } catch (error) {
    console.error('小智客户端服务启动失败:', error);
  } finally {
    // Reprint any newly generated initial admin password at the very end of startup logs
    // so operators inspecting `docker logs --tail` can spot it immediately.
    try {
      const { logPendingGeneratedAdminPassword } = await import('../models/User.js');
      logPendingGeneratedAdminPassword?.();
    } catch {
      // Ignore if User module is partially mocked in unit tests
    }
  }
};

type McpServerDescriptor = {
  name: string;
  version: string;
  group?: string;
  instructions?: string;
  appendGroupSuffix?: boolean;
};

const getMcpServerDescriptor = async (group?: string): Promise<McpServerDescriptor> => {
  if (!group || isSmartRoutingGroup(group)) {
    return {
      name: config.mcpHubName,
      version: config.mcpHubVersion,
      group,
    };
  }

  const { filteredServerInfos } = await getFilteredServerInfosForGroup(group);
  if (filteredServerInfos.length === 1) {
    const [serverInfo] = filteredServerInfos;
    return {
      name: serverInfo.name,
      version: serverInfo.version || config.mcpHubVersion,
      instructions: serverInfo.instructions,
      appendGroupSuffix: false,
    };
  }

  return {
    name: config.mcpHubName,
    version: config.mcpHubVersion,
    group,
    appendGroupSuffix: true,
  };
};

export const getMcpServer = async (sessionId?: string, group?: string): Promise<Server> => {
  const descriptor = await getMcpServerDescriptor(
    group || (sessionId ? getGroup(sessionId) : group),
  );

  if (!sessionId) {
    return createMcpServer(descriptor.name, descriptor.version, {
      ...descriptor,
      modern: RequestContextService.getInstance().getRequestContext()?.stateless === true,
    });
  }

  if (!servers[sessionId]) {
    servers[sessionId] = createMcpServer(descriptor.name, descriptor.version, descriptor);
  } else {
    console.log(`MCP server already exists for sessionId: ${sessionId}`);
  }
  return servers[sessionId];
};

export const deleteMcpServer = (sessionId: string): void => {
  delete servers[sessionId];
  // Clean up any per-session isolated upstream clients for this session
  cleanupIsolatedSession(sessionId);
};

/**
 * Close an isolated upstream client and its transport, killing the whole stdio
 * process tree (to avoid orphaned wrappers like `npx`) when applicable.
 */
const closeIsolatedClient = (serverName: string, client: Client, transport: any): void => {
  try {
    client.close();
  } catch (e) {
    console.warn(`[${serverName}] Error closing isolated client:`, e);
  }

  const candidateTransport = transport as { pid?: unknown };
  const stdioPid = typeof candidateTransport.pid === 'number' ? candidateTransport.pid : null;

  try {
    transport.close();
  } catch (e) {
    console.warn(`[${serverName}] Error closing isolated transport:`, e);
  }

  // For stdio transports, kill the whole process tree to avoid orphans
  if (stdioPid) {
    killStdioProcessTree(serverName, stdioPid);
  }
};

/**
 * Clean up per-session isolated upstream clients for a given session.
 * Closes all clients and transports, then removes the session entry.
 */
const cleanupIsolatedSession = (sessionId: string): void => {
  const sessionClients = sessionIsolatedClients.get(sessionId);
  if (sessionClients) {
    for (const [serverName, { client, transport }] of sessionClients) {
      closeIsolatedClient(serverName, client, transport);
    }

    sessionIsolatedClients.delete(sessionId);

    // Clean up any leftover creation locks for this session
    for (const key of isolatedClientCreationLocks.keys()) {
      if (key.startsWith(`${sessionId}:`)) {
        isolatedClientCreationLocks.delete(key);
      }
    }
    console.log(`Cleaned up isolated clients for session: ${sessionId}`);
  }
};

/** Helper to write an isolated session upstream client into the tracking map. */
const setSessionIsolatedClient = (
  sessionId: string,
  serverName: string,
  client: Client,
  transport: any,
): void => {
  let sessionClients = sessionIsolatedClients.get(sessionId);
  if (!sessionClients) {
    sessionClients = new Map();
    sessionIsolatedClients.set(sessionId, sessionClients);
  }
  sessionClients.set(serverName, { client, transport });
};

/**
 * Get or create a per-session isolated upstream client for a server.
 * Used when the server has `perSessionClient: true` in its config.
 * Uses a creation lock to prevent duplicate connections from concurrent calls.
 */
const getOrCreateIsolatedClient = async (
  sessionId: string,
  serverInfo: ServerInfo,
): Promise<{ client: Client; transport: any }> => {
  // Quick check without lock — already exists
  const sessionClients = sessionIsolatedClients.get(sessionId);
  if (sessionClients) {
    const existing = sessionClients.get(serverInfo.name);
    if (existing) {
      return existing;
    }
  }

  // Use a lock keyed by session+server to prevent concurrent duplicate creation
  const lockKey = `${sessionId}:${serverInfo.name}`;
  const existingLock = isolatedClientCreationLocks.get(lockKey);
  if (existingLock) {
    return existingLock;
  }

  const createPromise = (async (): Promise<{ client: Client; transport: any }> => {
    // Re-check after acquiring the lock — another call may have created it
    const sessionClientsAfterLock = sessionIsolatedClients.get(sessionId);
    if (sessionClientsAfterLock) {
      const existing = sessionClientsAfterLock.get(serverInfo.name);
      if (existing) {
        return existing;
      }
    }

    const serverConfig = serverInfo.config;
    if (!serverConfig) {
      throw new Error(`Server config not found for isolated server: ${serverInfo.name}`);
    }

    if (!sessionIsolatedClients.has(sessionId)) {
      sessionIsolatedClients.set(sessionId, new Map());
    }

    const reservedClients = sessionIsolatedClients.get(sessionId);
    const transport = await createTransportFromConfig(serverInfo.name, serverConfig);
    const client = createUpstreamMcpClient(serverInfo.name, () => serverInfo, serverInfo.config);

    try {
      await client.connect(transport, serverInfo.options || {});
    } catch (connectError) {
      // Connect failed — close the client/transport and kill any spawned
      // process tree so a failed handshake doesn't leak resources.
      closeIsolatedClient(serverInfo.name, client, transport);
      throw connectError;
    }

    // Guard: the session was cleaned up during the async connect if its map was
    // deleted (identity no longer matches) — close the just-created connection.
    if (sessionIsolatedClients.get(sessionId) !== reservedClients) {
      console.warn(
        `Session ${sessionId} was deleted during isolated client creation for ${serverInfo.name}, closing new client`,
      );
      closeIsolatedClient(serverInfo.name, client, transport);
      throw new Error(`Session ${sessionId} no longer exists`);
    }

    setSessionIsolatedClient(sessionId, serverInfo.name, client, transport);
    console.log(`Created isolated client for session ${sessionId} -> ${serverInfo.name}`);

    return { client, transport };
  })();

  isolatedClientCreationLocks.set(lockKey, createPromise);
  // Release the lock once creation settles. The rejection itself is surfaced to
  // (and handled by) the awaiting caller below; swallow it here so this
  // bookkeeping chain never becomes an unhandled promise rejection.
  void createPromise
    .finally(() => {
      isolatedClientCreationLocks.delete(lockKey);
    })
    .catch(() => undefined);

  return createPromise;
};

export const notifyToolChanged = async (
  name?: string,
  options?: { reportEmbeddingProgress?: boolean },
) => {
  await registerAllTools(false, name, options);
  broadcastToolListChanged();

  // 重连小智以同步最新工具列表。这里不能 await —— notifyToolChanged 由增删服务器的
  // API 请求直接调用，重连耗时会转嫁成请求延迟。
  void reconnectXiaozhiForToolSync();
};

/** Reconnects the Xiaozhi client so it picks up the current tool list. Fire-and-forget. */
const reconnectXiaozhiForToolSync = async (): Promise<void> => {
  try {
    const { xiaozhiEndpointService } = await import('./xiaozhiEndpointService.js');
    if (!xiaozhiEndpointService.isEnabled()) {
      return;
    }
    console.log('MCP服务器状态已稳定，重连小智客户端以同步最新工具列表...');

    // 先断开连接
    await xiaozhiEndpointService.disconnect();

    // 等待一小段时间确保断开完成
    await new Promise((resolve) => setTimeout(resolve, 500));

    // 重新初始化连接
    await xiaozhiEndpointService.initializeEndpoints();

    // 连接建立后再通知工具列表已更新
    await new Promise((resolve) => setTimeout(resolve, 1000));
    await xiaozhiEndpointService.notifyToolsChanged();
    console.log('小智客户端已重连并同步最新工具列表');
  } catch (error) {
    console.error('重连小智客户端失败:', error);
  }
};

const broadcastListChanged = (
  listType: 'tool' | 'resource' | 'prompt',
  sendNotification: (server: Server) => Promise<void>,
): void => {
  Object.values(servers).forEach((server) => {
    sendNotification(server)
      .then(() => {
        console.log(`${listType} list changed notification sent successfully`);
      })
      .catch((error) => {
        console.warn(`Failed to send ${listType} list changed notification:`, error.message);
      });
  });
};

export const broadcastToolListChanged = (): void => {
  broadcastListChanged('tool', (server) => server.sendToolListChanged());
  void import('./xiaozhiEndpointService.js')
    .then(({ xiaozhiEndpointService }) => {
      if (xiaozhiEndpointService.isEnabled()) {
        return xiaozhiEndpointService.notifyToolsChanged();
      }
      return undefined;
    })
    .catch(() => {
      // Ignore notification failures when Xiaozhi endpoint service is inactive
    });
};

export const broadcastResourceListChanged = (): void => {
  broadcastListChanged('resource', (server) => server.sendResourceListChanged());
};

export const broadcastPromptListChanged = (): void => {
  broadcastListChanged('prompt', (server) => server.sendPromptListChanged());
};

export const updateServerInfoVisibility = (
  serverName: string,
  visibility: ServerConfig['visibility'],
): void => {
  const serverInfo = getServerByName(serverName);
  if (!serverInfo) {
    return;
  }

  serverInfo.visibility = visibility;

  if (serverInfo.config) {
    serverInfo.config = {
      ...serverInfo.config,
      visibility,
    };
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
  if (isAppOnlyTool(tool)) {
    return;
  }
  // Save tool as vector embedding for search
  syncToolsAsVectorEmbeddings(serverName, [tool]).catch((error) => {
    console.warn(
      `[EMBED_SYNC_ERROR] Failed to sync embedding for tool "${toolName}" on server "${serverName}"`,
    );
    console.error('Error syncing single tool embedding', { serverName, toolName, error });
  });
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

export const normalizeToolForCache = (serverName: string, tool: McpTool): Tool => {
  return {
    ...tool,
    name: `${serverName}${getNameSeparator()}${tool.name}`,
    description: tool.description || '',
    inputSchema: cleanInputSchema(tool.inputSchema || {}),
  };
};

const hasDescriptionOverride = (config?: { description?: string }): boolean => {
  return Boolean(config && typeof config.description === 'string');
};

const resolveDescriptionOverride = (
  defaultDescription: string | undefined,
  config?: { description?: string },
): string => {
  return hasDescriptionOverride(config) ? config?.description || '' : defaultDescription || '';
};

const buildToolWithDescriptionMetadata = (tool: Tool, toolConfig?: ToolConfig): Tool => {
  const upstreamDescription = tool.description || '';

  return {
    ...tool,
    description: resolveDescriptionOverride(upstreamDescription, toolConfig),
    defaultDescription: upstreamDescription,
    hasDescriptionOverride: hasDescriptionOverride(toolConfig),
    ...(toolConfig?.hiddenParams?.length ? { hiddenParams: toolConfig.hiddenParams } : {}),
    enabled: toolConfig?.enabled !== false,
  };
};

const syncToolsAsVectorEmbeddings = async (
  serverName: string,
  tools: Tool[],
  options?: { reportProgress?: boolean },
): Promise<void> => {
  const modelVisibleTools = filterModelVisibleTools(tools);
  if (modelVisibleTools.length === 0) {
    await removeServerToolEmbeddings(serverName);
    return;
  }

  await saveToolsAsVectorEmbeddings(serverName, modelVisibleTools, options);
};

// Normalize prompt payload to satisfy MCP ListPrompts response schema
const normalizePromptForList = (prompt: {
  name: string;
  title?: string;
  description?: string;
  arguments?: any[];
  [key: string]: unknown;
}) => {
  return {
    ...prompt,
    name: prompt.name,
    title: prompt.title || prompt.name,
    description: prompt.description || '',
    arguments: Array.isArray(prompt.arguments) ? prompt.arguments : [],
  };
};

const normalizePromptForCache = (serverName: string, prompt: McpPrompt) => {
  return normalizePromptForList({
    ...prompt,
    name: `${serverName}${getNameSeparator()}${prompt.name}`,
  });
};

// Normalize resource payload to avoid nullable DB fields violating MCP schema
const normalizeResourceForList = (resource: {
  uri: string;
  name?: string | null;
  description?: string | null;
  mimeType?: string | null;
  [key: string]: unknown;
}): Resource => {
  return {
    ...resource,
    uri: resource.uri,
    name: resource.name || '',
    description: resource.description || '',
    mimeType: resource.mimeType || '',
  };
};

const normalizeResourceForCache = (resource: McpResource): Resource => {
  return normalizeResourceForList(resource);
};

// Store all server information
let serverInfos: ServerInfo[] = [];

// Per-session upstream clients for isolated servers (perSessionClient: true).
// Map<sessionId, Map<serverName, { client, transport }>>
const sessionIsolatedClients = new Map<string, Map<string, { client: Client; transport: any }>>();

// Locks to prevent concurrent creation of the same isolated client
const isolatedClientCreationLocks = new Map<string, Promise<any>>();

// Track servers pending a cache-refresh reinstall.
// Consumed once by createTransportFromConfig on the next reconnect.
const pendingReinstalls = new Set<string>();

// Grace period after sending SIGTERM to a stdio process tree before falling back
// to SIGKILL. Long enough to let well-behaved servers shut down cleanly, short
// enough that a hung child does not block the container indefinitely.
const STDIO_KILL_GRACE_PERIOD_MS = 2000;

// Test-only helper to set serverInfos directly. Not for production use.
export const setServerInfosForTest = (infos: ServerInfo[]): void => {
  serverInfos = infos;
};

export const updateServerToolsCache = (
  serverInfo: ServerInfo,
  tools: McpTool[],
  options?: { reportEmbeddingProgress?: boolean },
): void => {
  serverInfo.tools = tools.map((tool) => normalizeToolForCache(serverInfo.name, tool));
  syncToolsAsVectorEmbeddings(serverInfo.name, serverInfo.tools, {
    reportProgress: options?.reportEmbeddingProgress === true,
  }).catch(() => {
    console.warn('[EMBED_SYNC_ERROR] Failed to sync tool embeddings');
  });
};

const updateServerPromptsCache = (serverInfo: ServerInfo, prompts: McpPrompt[]): void => {
  serverInfo.prompts = prompts.map((prompt) => normalizePromptForCache(serverInfo.name, prompt));
};

const updateServerResourcesCache = (serverInfo: ServerInfo, resources: McpResource[]): void => {
  serverInfo.resources = resources.map(normalizeResourceForCache);
};

const logListChangedRefreshError = (listType: 'tool' | 'prompt' | 'resource'): void => {
  console.warn(`Failed to refresh ${listType} list after upstream notification`);
};

const createUpstreamMcpClient = (
  name: string,
  getServerInfo: () => ServerInfo | undefined,
  serverConfig?: ServerConfig,
): Client => {
  const mode = serverConfig ? resolveUpstreamProtocolMode(serverConfig) : 'legacy';
  return new LegacyMcpClient(
    {
      name: `mcp-client-${name}`,
      version: '1.0.0',
    },
    {
      versionNegotiation: { mode },
      capabilities: MCP_APPS_CAPABILITIES,
      listChanged: {
        tools: {
          onChanged: (error, tools) => {
            const serverInfo = getServerInfo();
            if (error) {
              logListChangedRefreshError('tool');
              return;
            }
            if (!serverInfo || !tools) {
              return;
            }
            updateServerToolsCache(serverInfo, tools);
            broadcastToolListChanged();
          },
        },
        prompts: {
          onChanged: (error, prompts) => {
            const serverInfo = getServerInfo();
            if (error) {
              logListChangedRefreshError('prompt');
              return;
            }
            if (!serverInfo || !prompts) {
              return;
            }
            updateServerPromptsCache(serverInfo, prompts);
            broadcastPromptListChanged();
          },
        },
        resources: {
          onChanged: (error, resources) => {
            const serverInfo = getServerInfo();
            if (error) {
              logListChangedRefreshError('resource');
              return;
            }
            if (!serverInfo || !resources) {
              return;
            }
            updateServerResourcesCache(serverInfo, resources);
            broadcastResourceListChanged();
          },
        },
      },
    },
  );
};

export interface ServerConnectionStats {
  total: number;
  connected: number;
  disconnected: number;
}

// Normalize and infer server type for safe client display
const normalizeServerType = (
  type?: string,
): 'stdio' | 'sse' | 'streamable-http' | 'openapi' | undefined => {
  if (!type) return undefined;
  const allowed = ['stdio', 'sse', 'streamable-http', 'openapi'];
  return allowed.includes(type) ? (type as any) : undefined;
};

const inferServerType = (
  conf?: ServerConfig,
): 'stdio' | 'sse' | 'streamable-http' | 'openapi' | undefined => {
  if (!conf) return undefined;

  const normalized = normalizeServerType(conf.type);
  if (normalized) return normalized;

  // OpenAPI configs should be treated as openapi even when type is omitted
  if (conf.openapi?.url || conf.openapi?.schema) {
    return 'openapi';
  }

  // Streamable HTTP must be explicit; otherwise, fall back to SSE when URL is present
  if (conf.url) {
    return conf.type === 'streamable-http' ? 'streamable-http' : 'sse';
  }

  // Command-based servers default to stdio
  if (conf.command || (conf.args && conf.args.length > 0)) {
    return 'stdio';
  }

  return undefined;
};

export const summarizeServerConnections = (
  infos: Pick<ServerInfo, 'status' | 'enabled'>[],
): ServerConnectionStats => {
  const enabledServers = infos.filter((serverInfo) => serverInfo.enabled !== false);
  const connectedServers = enabledServers.filter((serverInfo) => serverInfo.status === 'connected');

  return {
    total: enabledServers.length,
    connected: connectedServers.length,
    disconnected: enabledServers.length - connectedServers.length,
  };
};

export const getServerConnectionStats = (): ServerConnectionStats => {
  return summarizeServerConnections(serverInfos);
};

// Returns true if all enabled servers are connected
export const connected = (): boolean => {
  const { total, connected: connectedServers } = getServerConnectionStats();
  return total === connectedServers;
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
      console.warn('Error closing server', { serverName: serverInfo.name, error });
    }
  }
  serverInfos = [];

  // Drain all per-session isolated upstream clients (perSessionClient: true),
  for (const sessionId of [...sessionIsolatedClients.keys()]) {
    cleanupIsolatedSession(sessionId);
  }

  // Clear session servers as well
  Object.keys(servers).forEach((sessionId) => {
    delete servers[sessionId];
  });
};

const headerValueToString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) {
    return value[0];
  }

  return typeof value === 'string' ? value : undefined;
};

const getHeaderValue = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | string[] | undefined => {
  if (headers[name]) {
    return headers[name];
  }

  const lowerName = name.toLowerCase();
  if (headers[lowerName]) {
    return headers[lowerName];
  }

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  return undefined;
};

const LOG_SUMMARY_LIMIT = 8;

const getValueTypeForLogging = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `array(${value.length})`;
  }
  if (value === null) {
    return 'null';
  }
  if (value && typeof value === 'object') {
    return `object(${Object.keys(value as Record<string, unknown>).length} keys)`;
  }
  return typeof value;
};

const summarizeObjectShapeForLogging = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const entries = Object.entries(value);
  return {
    keyCount: entries.length,
    keys: entries.slice(0, LOG_SUMMARY_LIMIT).map(([key]) => key),
    valueTypes: Object.fromEntries(
      entries
        .slice(0, LOG_SUMMARY_LIMIT)
        .map(([key, entryValue]) => [key, getValueTypeForLogging(entryValue)]),
    ),
    truncated: entries.length > LOG_SUMMARY_LIMIT || undefined,
  };
};

export const summarizeArgumentsForLogging = (value: unknown): Record<string, unknown> => {
  if (value === undefined) {
    return { present: false };
  }

  if (Array.isArray(value)) {
    return {
      present: true,
      type: 'array',
      length: value.length,
      itemTypes: Array.from(new Set(value.slice(0, LOG_SUMMARY_LIMIT).map(getValueTypeForLogging))),
      truncated: value.length > LOG_SUMMARY_LIMIT || undefined,
    };
  }

  if (value && typeof value === 'object') {
    return {
      present: true,
      type: 'object',
      ...summarizeObjectShapeForLogging(value as Record<string, unknown>),
    };
  }

  return {
    present: true,
    type: getValueTypeForLogging(value),
  };
};

const summarizeTextPayloadForLogging = (text: string): Record<string, unknown> => ({
  textLength: text.length,
  looksLikeJson: /^[[{]/.test(text.trim()) || undefined,
  wasSanitized: sanitizeStringForLogging(text) !== text || undefined,
});

const getHttpErrorStatusCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const err = error as {
    code?: unknown;
    status?: unknown;
    response?: { status?: unknown };
  };
  const code = err.status ?? err.response?.status ?? err.code;
  if (typeof code === 'number' && Number.isFinite(code)) {
    return code;
  }

  if (typeof code === 'string') {
    const parsedCode = Number.parseInt(code, 10);
    return Number.isFinite(parsedCode) ? parsedCode : undefined;
  }

  return undefined;
};

const isRecoverableHttp4xxError = (error: unknown): boolean => {
  const statusCode = getHttpErrorStatusCode(error);
  if (statusCode !== undefined) {
    return statusCode === 401 || statusCode === 404;
  }

  const message =
    typeof (error as { message?: unknown })?.message === 'string'
      ? (error as { message: string }).message
      : '';

  return /Error POSTing to endpoint \(HTTP 40[14]/.test(message);
};

const summarizeContentItemForLogging = (item: unknown): Record<string, unknown> => {
  if (!item || typeof item !== 'object') {
    return { type: getValueTypeForLogging(item) };
  }

  const record = item as Record<string, unknown>;
  return {
    type: typeof record.type === 'string' ? record.type : 'object',
    keys: Object.keys(record).slice(0, LOG_SUMMARY_LIMIT),
    text: typeof record.text === 'string' ? summarizeTextPayloadForLogging(record.text) : undefined,
    truncated: Object.keys(record).length > LOG_SUMMARY_LIMIT || undefined,
  };
};

export const summarizeToolResultForLogging = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object') {
    return { type: getValueTypeForLogging(value) };
  }

  const record = value as Record<string, unknown>;
  const summary: Record<string, unknown> = {
    type: 'object',
    ...summarizeObjectShapeForLogging(record),
  };

  if (typeof record.isError === 'boolean') {
    summary.isError = record.isError;
  }

  if (Array.isArray(record.content)) {
    summary.contentCount = record.content.length;
    summary.content = record.content
      .slice(0, LOG_SUMMARY_LIMIT)
      .map((item) => summarizeContentItemForLogging(item));
    summary.contentTruncated = record.content.length > LOG_SUMMARY_LIMIT || undefined;
  }

  return summary;
};

const summarizeToolRequestForLogging = (params: any): Record<string, unknown> => ({
  name: typeof params?.name === 'string' ? params.name : 'unknown',
  arguments: summarizeArgumentsForLogging(params?.arguments),
});

const getActivityInputFromToolRequest = (request: any): unknown => {
  if (request?.params?.name === 'call_tool') {
    return request?.params?.arguments?.arguments;
  }

  return request?.params?.arguments;
};

const getActivityToolNameFromRequest = (request: any): string => {
  if (request?.params?.name === 'call_tool') {
    const nestedToolName = request?.params?.arguments?.toolName;
    return typeof nestedToolName === 'string' ? nestedToolName : 'call_tool';
  }

  return typeof request?.params?.name === 'string' ? request.params.name : 'unknown';
};

const stripToolServerPrefix = (toolName: string, serverName?: string): string => {
  if (!serverName) {
    return toolName;
  }

  const separator = getNameSeparator();
  const prefix = `${serverName}${separator}`;
  return toolName.startsWith(prefix) ? toolName.substring(prefix.length) : toolName;
};

const summarizePromptForLogging = (prompt: unknown): Record<string, unknown> => {
  if (!prompt || typeof prompt !== 'object') {
    return { type: getValueTypeForLogging(prompt) };
  }

  const record = prompt as Record<string, unknown>;
  const summary: Record<string, unknown> = {
    type: 'object',
    ...summarizeObjectShapeForLogging(record),
  };

  if (Array.isArray(record.messages)) {
    const messages = record.messages as Array<Record<string, unknown>>;
    summary.messageCount = messages.length;
    summary.messages = messages.slice(0, LOG_SUMMARY_LIMIT).map((message) => ({
      role: typeof message.role === 'string' ? message.role : undefined,
      contentType:
        message.content && typeof message.content === 'object'
          ? (message.content as Record<string, unknown>).type
          : getValueTypeForLogging(message.content),
      text:
        message.content &&
        typeof message.content === 'object' &&
        typeof (message.content as Record<string, unknown>).text === 'string'
          ? summarizeTextPayloadForLogging(
              String((message.content as Record<string, unknown>).text),
            )
          : undefined,
    }));
    summary.messagesTruncated = messages.length > LOG_SUMMARY_LIMIT || undefined;
  }

  return summary;
};

export const collectPassthroughHeaders = (
  requestHeaders: Record<string, string | string[] | undefined> | null,
  passthroughHeaderNames?: string[],
): Record<string, string> => {
  if (
    !requestHeaders ||
    !Array.isArray(passthroughHeaderNames) ||
    passthroughHeaderNames.length === 0
  ) {
    return {};
  }

  const passthroughHeaders: Record<string, string> = {};

  for (const headerName of passthroughHeaderNames) {
    const normalizedHeaderName = headerName.trim();
    if (!normalizedHeaderName) {
      continue;
    }

    const headerValue = headerValueToString(getHeaderValue(requestHeaders, normalizedHeaderName));

    if (headerValue !== undefined) {
      passthroughHeaders[normalizedHeaderName] = headerValue;
    }
  }

  return passthroughHeaders;
};

export const createRequestContextAwareFetch = (
  baseFetch: FetchLike,
  passthroughHeaderNames?: string[],
): FetchLike => {
  if (!Array.isArray(passthroughHeaderNames) || passthroughHeaderNames.length === 0) {
    return baseFetch;
  }

  return async (url: string | URL, init?: RequestInit) => {
    const requestHeaders = RequestContextService.getInstance().getHeaders();
    const passthroughHeaders = collectPassthroughHeaders(requestHeaders, passthroughHeaderNames);

    if (Object.keys(passthroughHeaders).length === 0) {
      return baseFetch(url, init);
    }

    const headers = init?.headers;
    const entries =
      headers instanceof Headers
        ? [...headers.entries()]
        : Array.isArray(headers)
          ? headers
          : Object.entries(headers ?? {});
    const replacedNames = new Set(
      Object.keys(passthroughHeaders).map((name) => name.toLowerCase()),
    );
    return baseFetch(url, {
      ...init,
      headers: {
        ...Object.fromEntries(entries.filter(([name]) => !replacedNames.has(name.toLowerCase()))),
        ...passthroughHeaders,
      },
    });
  };
};

const MODELSCOPE_MCP_HOST = 'mcp.api-inference.modelscope.net';

/**
 * Returns the configured ModelScope API key when the target URL points at ModelScope's
 * MCP inference host, so the Bearer token can be attached automatically.
 * Prefer the server owner's UserConfig.modelscope key; fall back to system default.
 */
const getModelScopeToken = async (
  url: string | undefined,
  owner?: string | null,
): Promise<string | undefined> => {
  if (!url || !url.includes(MODELSCOPE_MCP_HOST)) {
    return undefined;
  }
  try {
    const systemConfig = await getSystemConfigDao().get();
    const userConfig = owner ? await getUserConfigOrEmpty(owner) : {};
    const modelscope = mergeModelscope(systemConfig?.modelscope, userConfig.modelscope);
    return modelscope?.apiKey || undefined;
  } catch {
    // A missing or unreadable config must not block transport creation
    return undefined;
  }
};

/** Adds an Authorization header unless the server config already provides one. */
const withModelScopeAuth = (
  existing: Record<string, any> | undefined,
  token: string,
): Record<string, any> => {
  const headers = { ...(existing || {}) };
  if (!headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

// Helper function to create transport based on server configuration
export const createTransportFromConfig = async (name: string, conf: ServerConfig): Promise<any> => {
  let transport;
  const env = await getServerEnvironment(conf);

  // SSRF guard: block URL/streamable-http transports from reaching
  // loopback / RFC1918 / link-local targets (e.g. cloud metadata service).
  // Admin-owned servers may legitimately target internal services, so they
  // skip the internal-IP blocklist. allowInternal also governs per-hop
  // redirect validation in createRedirectValidatingFetch below.
  const ownerUser = conf.owner
    ? await getUserDao().findByUsername(conf.owner)
    : null;
  const allowInternal = !!ownerUser?.isAdmin;

  if (conf.url) {
    await assertSafeUrl(conf.url, { allowInternal, serverId: name });
  }

  if (conf.type === 'streamable-http') {
    const options: StreamableHTTPClientTransportOptions = {};
    const headers = conf.headers ? replaceEnvVars(conf.headers, env) : {};
    const baseFetch = createFetchWithProxy(getProxyConfigFromEnv(env));
    const requestAwareFetch = createRedirectValidatingFetch(
      createRequestContextAwareFetch(baseFetch, conf.passthroughHeaders),
      allowInternal,
      undefined,
      name,
    );

    if (Object.keys(headers).length > 0) {
      options.requestInit = {
        headers,
      };
    }

    // Create OAuth provider if configured - SDK will handle authentication automatically
    const authProvider = await createOAuthProvider(name, conf);
    if (authProvider) {
      options.authProvider = authProvider;
      console.log(`OAuth provider configured for server: ${name}`);
    }

    options.fetch = requestAwareFetch;

    // Auto-attach ModelScope Bearer using the server owner's personal key when present
    const modelScopeToken = await getModelScopeToken(conf.url, conf.owner);
    if (modelScopeToken) {
      options.requestInit = {
        ...(options.requestInit || {}),
        headers: withModelScopeAuth(options.requestInit?.headers as any, modelScopeToken),
      };
    }

    transport = new StreamableHTTPClientTransport(new URL(conf.url || ''), options);
  } else if (conf.url) {
    // SSE transport
    const options: any = {};
    const headers = conf.headers ? replaceEnvVars(conf.headers, env) : {};
    const baseFetch = createFetchWithProxy(getProxyConfigFromEnv(env));
    const requestAwareFetch = createRedirectValidatingFetch(
      createRequestContextAwareFetch(baseFetch, conf.passthroughHeaders),
      allowInternal,
      undefined,
      name,
    );

    if (Object.keys(headers).length > 0) {
      options.eventSourceInit = {
        headers,
        fetch: requestAwareFetch,
      };
      options.requestInit = {
        headers,
      };
    } else {
      options.eventSourceInit = {
        fetch: requestAwareFetch,
      };
    }

    // Create OAuth provider if configured - SDK will handle authentication automatically
    const authProvider = await createOAuthProvider(name, conf);
    if (authProvider) {
      options.authProvider = authProvider;
      console.log(`OAuth provider configured for server: ${name}`);
    }

    options.fetch = requestAwareFetch;

    // Auto-attach ModelScope Bearer using the server owner's personal key when present
    // (do not override a manually configured Authorization header)
    const modelScopeToken = await getModelScopeToken(conf.url, conf.owner);
    if (modelScopeToken) {
      options.eventSourceInit = {
        ...(options.eventSourceInit || {}),
        headers: withModelScopeAuth(options.eventSourceInit?.headers, modelScopeToken),
      };
      options.requestInit = {
        ...(options.requestInit || {}),
        headers: withModelScopeAuth(options.requestInit?.headers, modelScopeToken),
      };
    }

    transport = new SSEClientTransport(new URL(conf.url), options);
  } else if (conf.command && conf.args) {
    // Stdio transport
    env['PATH'] = expandEnvVars(process.env.PATH as string) || '';

    const systemConfigDao = getSystemConfigDao();
    const systemConfig = await systemConfigDao.get();
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

    // Apply proxychains4 wrapper if proxy is configured (Linux/macOS only)
    let resolvedArgs = replaceEnvVars(conf.args, env) as string[];

    // If this server is pending a reinstall, inject cache-busting flags (uvx only).
    // For npx, the cache directory was already cleared before reconnect.
    if (pendingReinstalls.has(name)) {
      resolvedArgs = injectRefreshFlag(conf.command, resolvedArgs);
      pendingReinstalls.delete(name);
      console.log(`[${name}] Injected cache refresh flags for reinstall`);
    }

    const { command: finalCommand, args: finalArgs } = wrapWithProxychains(
      name,
      conf.command,
      resolvedArgs,
      conf.proxy,
    );

    // Create STDIO transport with potentially wrapped command
    transport = new StdioClientTransport({
      cwd: process.cwd(),
      command: finalCommand,
      args: finalArgs,
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


type IsolatedClientContext = {
  sessionId: string;
  client: Client;
  transport: any;
};

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Resolve the isolated-client key for a `perSessionClient` tool call.
 * - Legacy stateful requests use `sessionId`.
 * - Stateless 2026-07-28 requests require an authenticated credential scope and
 *   an explicit `X-MCPHub-State-Id` UUID v4 header (or `_meta['openai/session']`
 *   fallback when the header is omitted) (#1245, #1307).
 */
const resolveIsolatedClientKey = (
  serverName: string,
  sessionId: string,
  requestMeta?: Record<string, unknown>,
): string => {
  const reqCtx = RequestContextService.getInstance().getRequestContext();
  if (!reqCtx?.stateless) {
    return sessionId;
  }

  const scope = reqCtx.clientStateScope;
  if (!scope) {
    throw new Error(
      `Server '${serverName}' requires bearer authentication and X-MCPHub-State-Id on stateless MCP requests`,
    );
  }

  const rawHeader = RequestContextService.getInstance().getHeader('x-mcphub-state-id');
  const explicitHeader = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (explicitHeader !== undefined) {
    const trimmed = explicitHeader.trim();
    if (!UUID_V4_RE.test(trimmed)) {
      throw new Error('Invalid X-MCPHub-State-Id header: must be a UUID v4');
    }
    return `state:${scope}:${trimmed.toLowerCase()}`;
  }

  const openAiSession = requestMeta?.['openai/session'];
  if (typeof openAiSession === 'string' && openAiSession.trim().length > 0) {
    const hashed = createHash('sha256').update(openAiSession.trim()).digest('hex');
    return `state:${scope}:openai:${hashed}`;
  }

  throw new Error(
    `Server '${serverName}' requires X-MCPHub-State-Id (UUID v4) on stateless MCP requests`,
  );
};

// Helper function to handle client.callTool with reconnection logic
const callToolWithReconnect = async (
  serverInfo: ServerInfo,
  toolParams: any,
  options?: any,
  maxRetries: number = 1,
  isolated?: IsolatedClientContext,
): Promise<any> => {
  // Local, reassignable refs so a reconnect can swap in the new connection for
  // the next retry attempt. For isolated calls these track the per-session
  // client/transport; otherwise they mirror the shared serverInfo connection.
  let client = isolated ? isolated.client : serverInfo.client;
  let transport = isolated ? isolated.transport : serverInfo.transport;
  if (!client) {
    throw new Error(`Client not found for server: ${serverInfo.name}`);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await client.callTool(toolParams, options || {});
      // Check auth error
      checkAuthError(result);
      return result;
    } catch (error: any) {
      const isHttp40xError = isRecoverableHttp4xxError(error);
      // Only retry for StreamableHTTPClientTransport and SSE transports
      const isStreamableHttp = transport instanceof StreamableHTTPClientTransport;
      const isSSE = transport instanceof SSEClientTransport;
      if (attempt < maxRetries && transport && ((isStreamableHttp && isHttp40xError) || isSSE)) {
        console.warn(
          `${isHttp40xError ? 'HTTP 40x error' : 'error'} detected for ${isStreamableHttp ? 'StreamableHTTP' : 'SSE'} server ${serverInfo.name}${isolated ? ` (isolated session ${isolated.sessionId})` : ''}, attempting reconnection (attempt ${attempt + 1}/${maxRetries + 1})`,
        );

        try {
          const rawServer = await getServerDao().findById(serverInfo.name);
          if (!rawServer) {
            throw new Error(`Server configuration not found for: ${serverInfo.name}`);
          }

          const server = await expandServerConfig(rawServer);
          const newTransport = await createTransportFromConfig(serverInfo.name, server);
          const newClient = createUpstreamMcpClient(serverInfo.name, () => serverInfo, server);

          // Reconnect with new transport
          await newClient.connect(newTransport, serverInfo.options || {});

          if (isolated) {
            // Isolated path: close only this session's stale connection and
            // replace its entry in the per-session map. Never touch the shared
            // serverInfo client/transport.
            try { client.close(); } catch { /* empty */ }
            try { transport.close(); } catch { /* empty */ }
            
            setSessionIsolatedClient(isolated.sessionId, serverInfo.name, newClient, newTransport);
          } else {
            // Shared path: tear down and replace the shared connection.
            if (serverInfo.keepAliveIntervalId) {
              clearInterval(serverInfo.keepAliveIntervalId);
              serverInfo.keepAliveIntervalId = undefined;
            }
            try { serverInfo.client?.close(); } catch { /* empty */ }
            try { transport.close(); } catch { /* empty */ }

            serverInfo.client = newClient;
            serverInfo.transport = newTransport;
            serverInfo.status = 'connected';
            serverInfo.recovery = undefined;
            setupServerKeepAlive(serverInfo, server);
          }

          // Point the local refs at the new connection for the next attempt.
          client = newClient;
          transport = newTransport;

          // Reload tools list after reconnection
          try {
            const tools = await newClient.listTools({}, serverInfo.options || {});
            updateServerToolsCache(serverInfo, tools.tools);
          } catch (listToolsError) {
            console.warn('Failed to reload tools after reconnection', {
              serverName: serverInfo.name,
              error: summarizeErrorForLogging(listToolsError),
            });
            // Continue anyway, as the connection might still work for the current tool
          }

          console.log(`Successfully reconnected to server: ${serverInfo.name}`);

          // Continue to next attempt
          continue;
        } catch (reconnectError) {
          console.error('Failed to reconnect to server', {
            serverName: serverInfo.name,
            error: summarizeErrorForLogging(reconnectError),
          });

          if (!isolated) {
            serverInfo.status = 'disconnected';
            serverInfo.error = `Failed to reconnect: ${formatErrorForLogging(reconnectError)}`;
            if (serverInfo.config) {
              setupServerKeepAlive(serverInfo, serverInfo.config);
            }
          }

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

const setupServerKeepAlive = (serverInfo: ServerInfo, serverConfig: ServerConfig): void => {
  setupClientKeepAlive(serverInfo, serverConfig, {
    reconnectServer: async (serverName) => {
      try {
        await reconnectServer(serverName);
      } catch (error) {
        setupServerKeepAlive(serverInfo, serverConfig);
        throw error;
      }
    },
  }).catch((error) =>
    console.warn('Keepalive setup failed', {
      serverName: serverInfo.name,
      error: summarizeErrorForLogging(error),
    }),
  );
};

/**
 * How many upstream connections an initialization pass may open at once.
 * Unset, empty or `0` keeps the previous behaviour of connecting every enabled
 * server in parallel. Read per pass so a restart is enough to change it.
 */
const resolveStartupConcurrency = (): number => {
  const raw = process.env.STARTUP_CONNECT_CONCURRENCY?.trim();
  if (!raw) {
    return 0;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    console.warn(
      `Ignoring invalid STARTUP_CONNECT_CONCURRENCY="${raw}"; expected a non-negative integer. Connecting without a limit.`,
    );
    return 0;
  }

  return parsed;
};

type ConnectGate = {
  run: <T>(start: () => Promise<T>, isStillWanted?: () => boolean) => Promise<T>;
};

/**
 * Rejection reason for a queued connection that was dropped before it started,
 * because the server it belonged to was disabled, removed or superseded while
 * it waited for a slot. Not a connection failure: nothing was spawned and there
 * is nothing wrong with the server, so callers report it as a cancellation
 * rather than marking the server as failed.
 */
class QueuedConnectCancelledError extends Error {
  constructor() {
    super('Queued connection was cancelled before it started');
    this.name = 'QueuedConnectCancelledError';
  }
}

/**
 * Defers the *invocation* of a connect rather than wrapping its promise, so a
 * server waiting for a slot has not started its request yet and its timeout
 * budget is not spent queueing. A limit of 0 runs everything immediately.
 *
 * Because work waits here, what the operator wants can change while it waits -
 * a queued server may be disabled, removed or replaced by a later pass. The
 * `isStillWanted` guard is therefore evaluated when the slot is granted, not
 * when the work is queued; a queued entry that is no longer wanted is cancelled
 * and its slot handed straight to the next in line.
 */
const createConnectGate = (limit: number): ConnectGate => {
  if (limit <= 0) {
    // Nothing queues, so nothing can go stale while it waits.
    return { run: (start) => start() };
  }

  let active = 0;
  const waiting: Array<() => void> = [];

  const startNextWaiting = () => {
    waiting.shift()?.();
  };

  const release = () => {
    active -= 1;
    startNextWaiting();
  };

  return {
    run: <T>(start: () => Promise<T>, isStillWanted?: () => boolean): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        const begin = () => {
          if (isStillWanted && !isStillWanted()) {
            // The slot was never taken, so pass it on rather than release it.
            reject(new QueuedConnectCancelledError());
            startNextWaiting();
            return;
          }

          active += 1;
          start().then(resolve, reject).finally(release);
        };

        if (active < limit) {
          begin();
        } else {
          waiting.push(begin);
        }
      }),
  };
};

// Initialize MCP server clients
export const initializeClientsFromSettings = async (
  isInit: boolean,
  serverName?: string,
  options?: { reportEmbeddingProgress?: boolean },
): Promise<ServerInfo[]> => {
  const allServers: ServerConfigWithName[] = await getServerDao().findAll();
  const existingServerInfos = serverInfos;
  const nextServerInfos: ServerInfo[] = [];
  const concurrency = resolveStartupConcurrency();
  const connectGate = createConnectGate(concurrency);
  // Set once this pass swaps its entries into `serverInfos`. Until then a
  // queued server cannot have been retired by anyone, because the entry that
  // `closeServer` / `toggleServerStatus` would act on is not published yet.
  let entriesPublished = false;
  if (isInit && concurrency > 0) {
    console.log(`Connecting upstream servers with a concurrency limit of ${concurrency}`);
  }

  try {
    for (const conf of allServers) {
      const { name } = conf;

      // Expand environment variables in all configuration values
      const expandedConf = await expandServerConfig(conf);

      // Skip disabled servers
      if (expandedConf.enabled === false) {
        console.log(`Skipping disabled server: ${name}`);
        nextServerInfos.push({
          name,
          owner: expandedConf.owner,
          visibility: expandedConf.visibility,
          status: 'disconnected',
          error: null,
          tools: [],
          prompts: [],
          resources: [],
          createTime: Date.now(),
          enabled: false,
        });
        continue;
      }

      // On-demand stdio servers: skip startup connect unless explicitly targeted;
      // preserve cached tools/prompts/resources so agents can still discover and wake them (#1012).
      if (
        expandedConf.startOnDemand === true &&
        serverName !== name &&
        (!expandedConf.type || expandedConf.type === 'stdio')
      ) {
        const existingOnDemand = existingServerInfos.find((s) => s.name === name);
        nextServerInfos.push({
          ...(existingOnDemand ?? {
            name,
            status: 'disconnected' as const,
            error: null,
            tools: [],
            prompts: [],
            resources: [],
            createTime: Date.now(),
          }),
          owner: expandedConf.owner,
          visibility: expandedConf.visibility,
          enabled: true,
          config: expandedConf,
        });
        console.log(`Skipping startup connect for on-demand server: ${name}`);
        continue;
      }

      // Reuse this server's existing runtime state instead of reconnecting when:
      // - a targeted reload/reconnect (serverName) was requested for a
      //   *different* server — preserve its current state regardless of
      //   status. Reloading one server must not reconnect unrelated servers
      //   (e.g. failed/disconnected ones), which would also leak their
      //   previous stdio child processes. See #921.
      // - a general/full initialization (no serverName) — preserve this
      //   server's state if it is already connected, or if an OAuth
      //   authorization is in flight. Reconnecting during PKCE authorization
      //   would replace the pending code verifier and break the callback.
      // Match by (owner, name) when available so same-named servers of different users stay separate
      const existingServer = existingServerInfos.find(
        (s) =>
          s.name === name &&
          (s.owner || 'admin') === (expandedConf.owner || 'admin'),
      );
      const isDifferentServer = Boolean(serverName) && serverName !== name;
      const hasInflightOAuthAuthorization =
        existingServer?.status === 'oauth_required' &&
        Boolean(
          expandedConf.oauth?.pendingAuthorization?.state ||
            existingServer.oauth?.state,
        );
      if (
        existingServer &&
        (isDifferentServer ||
          (!serverName && (existingServer.status === 'connected' || hasInflightOAuthAuthorization)))
      ) {
        nextServerInfos.push({
          ...existingServer,
          enabled: expandedConf.enabled === undefined ? true : expandedConf.enabled,
        });
        console.log(
          hasInflightOAuthAuthorization
            ? `Server '${name}' has an in-flight OAuth authorization; preserving existing state.`
            : `Server '${name}' is already connected.`,
        );
        continue;
      }

      let transport;
      let openApiClient;
      if (expandedConf.type === 'openapi') {
        // Handle OpenAPI type servers
        if (!expandedConf.openapi?.url && !expandedConf.openapi?.schema) {
          console.warn(
            `Skipping OpenAPI server '${name}': missing OpenAPI specification URL or schema`,
          );
          nextServerInfos.push({
            name,
            owner: expandedConf.owner,
            visibility: expandedConf.visibility,
            status: 'disconnected',
            error: 'Missing OpenAPI specification URL or schema',
            tools: [],
            prompts: [],
            resources: [],
            createTime: Date.now(),
          });
          continue;
        }

        // Create server info first and keep reference to it
        const serverInfo: ServerInfo = {
          name,
          owner: expandedConf.owner,
          visibility: expandedConf.visibility,
          status: 'connecting',
          error: null,
          tools: [],
          prompts: [],
          resources: [],
          createTime: Date.now(),
          enabled: expandedConf.enabled === undefined ? true : expandedConf.enabled,
          config: expandedConf, // Store reference to expanded config for OpenAPI passthrough headers
        };
        nextServerInfos.push(serverInfo);

        try {
          // Create OpenAPI client instance
          openApiClient = new OpenAPIClient(expandedConf, {
            persistOAuth2Token: async (oauth2) => {
              const openapiConfig = {
                ...(expandedConf.openapi || {}),
                security: {
                  ...(expandedConf.openapi?.security || { type: 'oauth2' as const }),
                  type: 'oauth2' as const,
                  oauth2: { ...oauth2 },
                },
              };

              expandedConf.openapi = openapiConfig;
              serverInfo.config = {
                ...expandedConf,
                openapi: openapiConfig,
              };

              await getServerDao().update(name, {
                openapi: openapiConfig,
              });
            },
          });

          console.log(`Initializing OpenAPI server: ${name}...`);

          // Perform async initialization
          await openApiClient.initialize();

          // Convert OpenAPI tools to MCP tool format
          const openApiTools = openApiClient.getTools();
          const mcpTools: Tool[] = openApiTools.map((tool) => ({
            name: `${name}${getNameSeparator()}${tool.name}`,
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

          // Broadcast now that tools are loaded. OpenAPI servers expose tools
          // only (no prompts/resources). See the standard-path note above.
          broadcastToolListChanged();

          // Save tools as vector embeddings for search
          syncToolsAsVectorEmbeddings(name, mcpTools, {
            reportProgress: options?.reportEmbeddingProgress === true && serverName === name,
          }).catch((error) => {
            console.warn(
              `[EMBED_SYNC_ERROR] Failed to sync OpenAPI embeddings for server "${name}"`,
            );
            console.error('Error syncing OpenAPI tool embeddings', {
              serverName: name,
              error: summarizeErrorForLogging(error),
            });
          });
          continue;
        } catch (error) {
          console.error('Failed to initialize OpenAPI server', {
            serverName: name,
            error: summarizeErrorForLogging(error),
          });

          // Update the already pushed server info with error status
          serverInfo.status = 'disconnected';
          serverInfo.error = `Failed to initialize OpenAPI server: ${formatErrorForLogging(error)}`;
          continue;
        }
      } else {
        transport = await createTransportFromConfig(name, expandedConf);
      }

      const serverInfoRef: { current?: ServerInfo } = {};
      const client = createUpstreamMcpClient(name, () => serverInfoRef.current, expandedConf);

      // Get request options from server configuration, with fallbacks
      const serverRequestOptions = expandedConf.options || {};
      const defaultRequestTimeout = Number(process.env.DEFAULT_REQUEST_TIMEOUT) || 60000;
      const requestOptions = {
        timeout: serverRequestOptions.timeout || defaultRequestTimeout,
        resetTimeoutOnProgress: serverRequestOptions.resetTimeoutOnProgress ?? true,
        maxTotalTimeout: serverRequestOptions.maxTotalTimeout,
      };
      const initRequestOptions = isInit
        ? {
            ...requestOptions,
            timeout: Number(config.initTimeout) || 60000,
          }
        : undefined;

      // Create server info first and keep reference to it
      const serverInfo: ServerInfo = {
        name,
        owner: expandedConf.owner,
        visibility: expandedConf.visibility,
        status: 'connecting',
        error: null,
        tools: [],
        prompts: [],
        resources: [],
        client,
        transport,
        options: requestOptions,
        createTime: Date.now(),
        config: expandedConf, // Store reference to expanded config
      };
      serverInfoRef.current = serverInfo;

      const pendingAuth = expandedConf.oauth?.pendingAuthorization;
      if (pendingAuth) {
        serverInfo.status = 'oauth_required';
        serverInfo.error = null;
        serverInfo.oauth = {
          authorizationUrl: pendingAuth.authorizationUrl,
          state: pendingAuth.state,
          codeVerifier: pendingAuth.codeVerifier,
        };
      }
      nextServerInfos.push(serverInfo);

      // A queued connection has not spawned anything yet, so cancelling it is
      // free - and necessary: `closeServerRuntime` clears the client/transport
      // references that would later own the child process, so connecting after
      // a disable strands a process nothing can clean up.
      const connectStillWanted = (): boolean => {
        // Until this pass publishes its entries, nothing else can have retired
        // this server: the entry a disable would act on does not exist yet.
        if (!entriesPublished) return true;

        const current = serverInfos.find(
          (si) =>
            si.name === name &&
            (si.owner || 'admin') === (expandedConf.owner || 'admin'),
        );
        // Gone from the configuration while it waited.
        if (!current) return false;
        // Client identity, not the pass, decides whether anyone is still
        // waiting on this connect - the same rule liveServerInfo() applies to
        // the result. A later pass that *preserved* this server spreads our
        // client into its entry and relies on this very connect to complete it
        // (a scoped reload preserves every other server whatever its status,
        // see #921), so cancelling on the pass alone would strand it on
        // 'connecting' for good - the failure #1150 was about. A later pass
        // that rebuilt the server carries a client of its own, and disabling
        // closes the runtime before replacing the entry, so in both of those
        // cases the published entry no longer carries our client.
        return current.client === client && current.enabled !== false;
      };

      connectGate
        .run(
          () => client.connect(transport, initRequestOptions || requestOptions),
          connectStillWanted,
        )
        .then(() => {
          console.log(`Successfully connected client for server: ${name}`);
          const serverVersion = client.getServerVersion?.();
          serverInfo.version = serverVersion?.version;
          serverInfo.instructions = client.getInstructions?.();
          const capabilities: ServerCapabilities | undefined = client.getServerCapabilities();
          console.log('Server capabilities', JSON.stringify(capabilities));

          let dataError: Error | null = null;
          if (capabilities?.tools) {
            client
              .listTools({}, initRequestOptions || requestOptions)
              .then((tools) => {
                console.log(`Successfully listed ${tools.tools.length} tools for server: ${name}`);
                updateServerToolsCache(serverInfo, tools.tools, {
                  reportEmbeddingProgress:
                    options?.reportEmbeddingProgress === true && serverName === name,
                });
                // Broadcast only after tools are actually loaded into the cache.
                // The connection completes asynchronously, so callers (e.g. enabling
                // a server) cannot broadcast a correct tool list themselves — doing so
                // would race ahead of this point and push a stale (empty) list.
                broadcastToolListChanged();
              })
              .catch((error) => {
                console.error('Failed to list tools for server', {
                  serverName: name,
                  error: summarizeErrorForLogging(error),
                });
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
                updateServerPromptsCache(serverInfo, prompts.prompts);
                broadcastPromptListChanged();
              })
              .catch((error) => {
                console.error('Failed to list prompts for server', {
                  serverName: name,
                  error: summarizeErrorForLogging(error),
                });
                dataError = error;
              });
          }

          if (capabilities?.resources) {
            client
              .listResources({}, initRequestOptions || requestOptions)
              .then((resources) => {
                console.log(
                  `Successfully listed ${resources.resources.length} resources for server: ${name}`,
                );
                updateServerResourcesCache(serverInfo, resources.resources);
                broadcastResourceListChanged();
              })
              .catch((error) => {
                console.error('Failed to list resources for server', {
                  serverName: name,
                  error: summarizeErrorForLogging(error),
                });
                dataError = error;
              });
          }

          if (!dataError) {
            serverInfo.status = 'connected';
            serverInfo.error = null;
            // Set up keep-alive ping for SSE connections via shared service
            setupServerKeepAlive(serverInfo, expandedConf);
          } else {
            serverInfo.status = 'disconnected';
            serverInfo.error = `Failed to list data: ${formatErrorForLogging(dataError)}`;
            setupServerKeepAlive(serverInfo, expandedConf);
          }
        })
        .catch(async (error) => {
          if (error instanceof QueuedConnectCancelledError) {
            console.log(
              `Cancelled queued connection for server: ${name} (disabled, removed or superseded while queued)`,
            );
            closeServerRuntime(serverInfo);
            return;
          }

          // Check if this is an OAuth authorization error
          const isOAuthError =
            error?.message?.includes('OAuth authorization required') ||
            error?.message?.includes('Authorization required');

          if (isOAuthError) {
            // OAuth provider should have already set the status to 'oauth_required'
            // and stored the authorization URL in serverInfo.oauth
            console.log(
              `OAuth authorization required for server ${name}. Status should be set to 'oauth_required'.`,
            );
            // Make sure status is set correctly
            if (serverInfo.status !== 'oauth_required') {
              serverInfo.status = 'oauth_required';
            }
            serverInfo.error = null;
          } else {
            console.error('Failed to connect client for server', {
              serverName: name,
              error: summarizeErrorForLogging(error),
            });
            // Other connection errors
            serverInfo.status = 'disconnected';
            serverInfo.error = `Failed to connect: ${formatErrorForLogging(error)}`;
            setupServerKeepAlive(serverInfo, expandedConf);
          }
        });
      console.log(`Initialized client for server: ${name}`);
    }
  } catch (error) {
    // Restore previous state if initialization fails to avoid exposing an empty server list
    serverInfos = existingServerInfos;
    throw error;
  }

  serverInfos = nextServerInfos;
  entriesPublished = true;
  return serverInfos;
};

// Register all MCP tools
export const registerAllTools = async (
  isInit: boolean,
  serverName?: string,
  options?: { reportEmbeddingProgress?: boolean },
): Promise<void> => {
  await initializeClientsFromSettings(isInit, serverName, options);
};

// Get all server information
export const getServersInfo = async (
  page?: number,
  limit?: number,
  user?: any,
): Promise<Omit<ServerInfo, 'client' | 'transport'>[]> => {
  const dataService = getDataService();
  const isNonAdminUser = Boolean(user && !user.isAdmin);

  const isPaginated = limit !== undefined && page !== undefined;
  const allServers: ServerConfigWithName[] = isPaginated
    ? (isNonAdminUser
        ? await getServerDao().findVisibleToUserPaginated(user.username, page, limit)
        : await getServerDao().findAllPaginated(page, limit)
      ).data
    : await getServerDao().findAll();

  // Ensure that servers recently added via DAO but not yet initialized in serverInfos
  // are still visible in the servers list. This avoids a race condition where
  // a POST /api/servers immediately followed by GET /api/servers would not
  // return the newly created server until background initialization completes.
  const combinedServerInfos: ServerInfo[] = [...serverInfos];
  const existingNames = new Set(combinedServerInfos.map((s) => s.name));

  // Create a set of server names we're interested in (for pagination)
  const requestedServerNames = new Set(allServers.map((s) => s.name));

  // Filter serverInfos to only include requested servers if pagination is used
  const filteredServerInfos = isPaginated
    ? combinedServerInfos.filter((s) => requestedServerNames.has(s.name))
    : combinedServerInfos;

  // Add servers from DAO that don't have runtime info yet
  for (const server of allServers) {
    if (!existingNames.has(server.name)) {
      const isEnabled = server.enabled === undefined ? true : server.enabled;
      filteredServerInfos.push({
        name: server.name,
        owner: server.owner,
        visibility: server.visibility,
        // Newly created servers that are enabled should appear as "connecting"
        // until the MCP client initialization completes. Disabled servers remain
        // in the "disconnected" state.
        status: isEnabled ? 'connecting' : 'disconnected',
        error: null,
        tools: [],
        prompts: [],
        resources: [],
        createTime: Date.now(),
        enabled: isEnabled,
      });
    }
  }

  // Apply user filtering only when NOT using pagination.
  // Paginated non-admin requests are filtered at DAO level; paginated admin requests
  // should remain unfiltered as well.
  const shouldApplyUserFilter = !isPaginated;
  const filterServerInfos: ServerInfo[] =
    shouldApplyUserFilter && dataService.filterData
      ? dataService.filterData(filteredServerInfos, user)
      : filteredServerInfos;

  const infos = filterServerInfos
    .filter((info) => requestedServerNames.has(info.name)) // Only include requested servers
    .map(
      ({
        name,
        version,
        client,
        instructions,
        owner,
        visibility,
        status,
        tools,
        prompts,
        resources,
        createTime,
        error,
        oauth,
      }) => {
        const serverConfig = allServers.find((server) => server.name === name);
        const enabled = serverConfig ? serverConfig.enabled !== false : true;
        const resolvedType = inferServerType(serverConfig);
        const oauthConnected = Boolean(
          serverConfig?.oauth?.accessToken || serverConfig?.oauth?.refreshToken,
        );

        // Add enabled status and custom description to each tool.
        // Check both prefixed and bare tool names (#1178).
        const toolsWithEnabled = tools.map((tool) => {
          const bareToolName = normalizeToolNameForServer(name, tool.name);
          const toolConfig = serverConfig?.tools?.[tool.name] ?? serverConfig?.tools?.[bareToolName];
          return buildToolWithDescriptionMetadata(tool, toolConfig);
        });

        const promptsWithEnabled = prompts.map((prompt) => {
          const barePromptName = normalizeToolNameForServer(name, prompt.name);
          const promptConfig =
            serverConfig?.prompts?.[prompt.name] ?? serverConfig?.prompts?.[barePromptName];
          return {
            ...prompt,
            description: resolveDescriptionOverride(prompt.description, promptConfig),
            enabled: promptConfig?.enabled !== false, // Default to true if not explicitly disabled
          };
        });

        return {
          name,
          version,
          protocolVersion:
            enabled && status === 'connected' && resolvedType !== 'openapi'
              ? (client as { getNegotiatedProtocolVersion?: () => string | undefined })
                  ?.getNegotiatedProtocolVersion?.()
              : undefined,
          instructions,
          owner,
          visibility,
          status,
          error,
          tools: toolsWithEnabled,
          prompts: promptsWithEnabled,
          resources,
          createTime,
          enabled,
          oauth:
            oauth || oauthConnected
              ? {
                  ...(oauth
                    ? {
                        authorizationUrl: oauth.authorizationUrl,
                        state: oauth.state,
                        // Don't expose codeVerifier to frontend for security
                      }
                    : {}),
                  ...(oauthConnected ? { connected: true } : {}),
                }
              : undefined,
          config:
            resolvedType || serverConfig?.description || serverConfig?.command
              ? {
                  ...(resolvedType ? { type: resolvedType } : {}),
                  ...(serverConfig?.description ? { description: serverConfig.description } : {}),
                  // Expose command so the frontend can determine if reinstall is
                  // supported (npx/uvx only). This is not a secret — it's the
                  // runner binary name (e.g. "npx", "uvx").
                  ...(serverConfig?.command ? { command: serverConfig.command } : {}),
                }
              : undefined,
        };
      },
    );
  // Sorting is now handled at DAO layer for consistent pagination results
  return infos;
};

// Get server by name. When owner is provided, match (owner, name); otherwise
// prefer a unique name, then the current user's own instance if present.
export const getServerByName = (
  name: string,
  owner?: string | null,
): ServerInfo | undefined => {
  const matches = serverInfos.filter((serverInfo) => serverInfo.name === name);
  if (matches.length === 0) return undefined;
  if (owner) {
    const owned = matches.find((s) => (s.owner || 'admin') === owner);
    if (owned) return owned;
  }
  if (matches.length === 1) return matches[0];
  // Prefer current user context when multiple owners share the display name
  try {
    const current = UserContextService.getInstance().getCurrentUser()?.username;
    if (current) {
      const owned = matches.find((s) => (s.owner || 'admin') === current);
      if (owned) return owned;
    }
  } catch {
    /* ignore */
  }
  // Own-before-public: private/own entries first
  const nonPublic = matches.find((s) => s.visibility !== 'public');
  return nonPublic || matches[0];
};

// Get server by OAuth state parameter
export const getServerByOAuthState = (state: string): ServerInfo | undefined => {
  return serverInfos.find((serverInfo) => serverInfo.oauth?.state === state);
};

// Get server by persisted pending-authorization state (restart recovery, GHSA-vc28-27px-x492)
export const getServerByPendingOAuthState = (state: string): ServerInfo | undefined => {
  return serverInfos.find(
    (serverInfo) => serverInfo.config?.oauth?.pendingAuthorization?.state === state,
  );
};

/**
 * Reconnect a server after OAuth authorization or configuration change
 * This will close the existing connection and reinitialize the server
 */
export const reconnectServer = async (serverName: string): Promise<void> => {
  console.log(`Reconnecting server: ${serverName}`);

  const serverInfo = getServerByName(serverName);
  if (!serverInfo) {
    throw new Error(`Server not found: ${serverName}`);
  }

  const serverConfig = await getServerDao().findById(serverName);
  if (serverConfig?.enabled === false) {
    console.log(`Skipping reconnect for disabled server: ${serverName}`);
    return;
  }

  // Close existing connection if any
  if (serverInfo.client) {
    try {
      serverInfo.client.close();
    } catch (error) {
      console.warn('Error closing client for server', { serverName, error });
    }
  }

  if (serverInfo.transport) {
    try {
      serverInfo.transport.close();
    } catch (error) {
      console.warn('Error closing transport for server', { serverName, error });
    }
  }

  if (serverInfo.keepAliveIntervalId) {
    clearInterval(serverInfo.keepAliveIntervalId);
    serverInfo.keepAliveIntervalId = undefined;
  }

  // Reinitialize the server
  await initializeClientsFromSettings(false, serverName);

  console.log(`Successfully reconnected server: ${serverName}`);
};

// Reinstall server: clear package cache and reconnect.
// For npx: deletes ~/.npm/_npx before reconnect (--ignore-existing removed in npm 7+).
// For uvx: schedules --refresh flag injection on next spawn via pendingReinstalls Set.
export const reinstallServer = async (serverName: string): Promise<void> => {
  console.log(`Reinstalling server: ${serverName}`);

  const serverInfo = getServerByName(serverName);
  if (!serverInfo) {
    throw new Error(`Server not found: ${serverName}`);
  }

  const serverConfig = await getServerDao().findById(serverName);
  if (!serverConfig) {
    throw new Error(`Server configuration not found: ${serverName}`);
  }

  if (serverConfig.enabled === false) {
    throw new Error(`Cannot reinstall a disabled server: ${serverName}`);
  }

  const command = serverConfig.command;
  if (!command || !supportsCacheRefresh(command)) {
    throw new Error(
      `Server "${serverName}" does not support cache refresh (command: ${command || 'none'}). Only npx and uvx servers are supported.`,
    );
  }

  // Mark server as pending reinstall (consumed by createTransportFromConfig for uvx)
  pendingReinstalls.add(serverName);

  try {
    // For npx, clear cache directory synchronously before reconnect.
    // For uvx, this is a no-op — refresh is handled via --refresh flag injection.
    await clearRunnerCache(command);

    // Close and reconnect (will pick up pendingReinstalls flag for uvx)
    await reconnectServer(serverName);

    console.log(`Successfully initiated reinstall for server: ${serverName}`);
  } catch (error) {
    // Clean up pendingReinstalls on failure to avoid stale entries
    pendingReinstalls.delete(serverName);
    throw error;
  }
};

// Filter tools by server configuration
const filterToolsByConfig = async (serverName: string, tools: Tool[]): Promise<Tool[]> => {
  const serverConfig = await getServerDao().findById(serverName);
  if (!serverConfig || !serverConfig.tools) {
    // If no tool configuration exists, all tools are enabled by default
    return tools;
  }

  return tools.filter((tool) => {
    const bareToolName = normalizeToolNameForServer(serverName, tool.name);
    const toolConfig = serverConfig.tools?.[tool.name] ?? serverConfig.tools?.[bareToolName];
    // If tool is not in config, it's enabled by default
    return toolConfig?.enabled !== false;
  });
};

// Get server by tool name
const getServerByTool = (toolName: string): ServerInfo | undefined => {
  return serverInfos.find((serverInfo) => serverInfo.tools.some((tool) => tool.name === toolName));
};

// Add new server (uniqueness is per-owner)
export const addServer = async (
  name: string,
  config: ServerConfig,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const server: ServerConfigWithName = { name, ...config };
    const result = await getServerDao().create(server);
    if (result) {
      return { success: true, message: 'Server added successfully' };
    }
    return { success: false, message: 'Failed to add server' };
  } catch (error) {
    if (error instanceof Error && error.message.includes('already exists')) {
      return { success: false, message: 'You already have a server with this name' };
    }
    console.error('Failed to add server', { serverName: name, error });
    return { success: false, message: 'Failed to add server' };
  }
};

// Remove server. When owner is provided, only remove that owner's instance.
export const removeServer = async (
  name: string,
  owner?: string | null,
): Promise<{ success: boolean; message?: string }> => {
  const dao = getServerDao();
  let result = false;

  if (owner) {
    result = await dao.deleteByOwnerAndName(owner, name);
  } else {
    result = await dao.delete(name);
  }

  if (!result) {
    return { success: false, message: 'Failed to remove server' };
  }

  // Close the client and terminate the underlying child process tree BEFORE
  // dropping the serverInfos reference. Without this, a stdio child launched
  // via npx / npm exec outlives the request and becomes an unkillable orphan
  // that leaks memory until the container is restarted.
  closeServer(name, owner);

  try {
    await removeServerToolEmbeddings(name);
  } catch (error) {
    console.warn('Failed to remove embeddings for server', { serverName: name, error });
  }

  serverInfos = serverInfos.filter((serverInfo) => {
    if (serverInfo.name !== name) return true;
    if (owner) return (serverInfo.owner || 'admin') !== owner;
    return false;
  });
  return { success: true, message: 'Server removed successfully' };
};

// Add or update server (supports overriding existing servers for MCPB)
export const addOrUpdateServer = async (
  name: string,
  config: ServerConfig,
  allowOverride: boolean = false,
): Promise<{ success: boolean; message?: string }> => {
  try {
    const owner = config.owner || 'admin';
    // Uniqueness is per-owner
    const exists = await getServerDao().existsForOwner(owner, name);
    if (exists && !allowOverride) {
      return { success: false, message: 'You already have a server with this name' };
    }

    // If overriding an existing server, close connections and clear keep-alive timers
    if (exists) {
      // Close existing server connections (clears keep-alive intervals as well)
      closeServer(name, owner);
      // Remove from server infos (scoped to owner)
      serverInfos = serverInfos.filter(
        (serverInfo) =>
          !(serverInfo.name === name && (serverInfo.owner || 'admin') === owner),
      );
    }

    if (exists) {
      await getServerDao().update(name, config);
    } else {
      await getServerDao().create({ name, ...config });
    }

    const action = exists ? 'updated' : 'added';
    return { success: true, message: `Server ${action} successfully` };
  } catch (error) {
    console.error('Failed to add/update server', { serverName: name, error });
    // Surface uniqueness errors from DAO
    if (error instanceof Error && error.message.includes('already exists')) {
      return { success: false, message: 'You already have a server with this name' };
    }
    return { success: false, message: 'Failed to add/update server' };
  }
};

// Check for authentication error in tool call result
function checkAuthError(result: any) {
  if (Array.isArray(result.content) && result.content.length > 0) {
    const text = result.content[0]?.text;
    if (typeof text === 'string') {
      let errorContent;
      try {
        errorContent = JSON.parse(text);
      } catch (e) {
        // Ignore JSON parse errors and continue
        return;
      }
      // JSON.parse can yield null or a primitive (e.g. text "null", "42",
      // "true") — only an object payload can carry an auth error code, so guard
      // the property access to avoid crashing on non-object results.
      if (errorContent && typeof errorContent === 'object' && errorContent.code === 401) {
        throw new Error('Error POSTing to endpoint (HTTP 401 Unauthorized)');
      }
    }
  }
}

const closeServerRuntime = (serverInfo: ServerInfo): void => {
  if (serverInfo.idleTimeoutId) {
    clearTimeout(serverInfo.idleTimeoutId);
    serverInfo.idleTimeoutId = undefined;
  }
  if (serverInfo.keepAliveIntervalId) {
    clearInterval(serverInfo.keepAliveIntervalId);
    serverInfo.keepAliveIntervalId = undefined;
    console.log('Cleared MCP server keep-alive interval');
  }

  const candidateTransport = serverInfo.transport as
    | {
        pid?: unknown;
      }
    | undefined;
  const stdioPid = typeof candidateTransport?.pid === 'number' ? candidateTransport.pid : null;

  if (serverInfo.client) {
    try {
      serverInfo.client.close();
    } catch {
      console.warn('Error closing MCP client during runtime shutdown');
    }
    serverInfo.client = undefined;
  }

  if (serverInfo.transport) {
    try {
      serverInfo.transport.close();
    } catch {
      console.warn('Error closing MCP transport during runtime shutdown');
    }
    serverInfo.transport = undefined;
  }

  if (stdioPid) {
    killStdioProcessTree(serverInfo.name, stdioPid);
  }

  console.log('Closed MCP server client and transport');
};

// Close server client and transport
// On-demand stdio spawning helpers (#1012)
const shutdownOnDemandServer = (serverInfo: ServerInfo): void => {
  if (serverInfo.idleTimeoutId) {
    clearTimeout(serverInfo.idleTimeoutId);
    serverInfo.idleTimeoutId = undefined;
  }
  closeServerRuntime(serverInfo);
  serverInfo.status = 'disconnected';
  console.log(
    `[${serverInfo.name}] On-demand server shut down after idle; ${serverInfo.tools.length} tools cached`,
  );
};

const scheduleIdleShutdown = (serverInfo: ServerInfo): void => {
  if (!serverInfo.config?.startOnDemand) return;
  if (serverInfo.idleTimeoutId) {
    clearTimeout(serverInfo.idleTimeoutId);
  }
  const idleMs = serverInfo.config.idleTimeoutMs ?? 300_000;
  const timer = setTimeout(() => {
    if (serverInfo.status === 'connected') {
      shutdownOnDemandServer(serverInfo);
    }
  }, idleMs);
  timer.unref?.();
  serverInfo.idleTimeoutId = timer;
};

const ensureServerReady = async (serverInfo: ServerInfo): Promise<void> => {
  if (serverInfo.status === 'connected') return;
  if (serverInfo.spawningPromise) {
    await serverInfo.spawningPromise;
    return;
  }

  console.log(`[${serverInfo.name}] Cold-starting on-demand server...`);
  const spawnPromise = reconnectServer(serverInfo.name);
  serverInfo.spawningPromise = spawnPromise;
  try {
    await spawnPromise;
  } finally {
    serverInfo.spawningPromise = undefined;
  }
};

function closeServer(name: string, owner?: string | null) {
  const serverInfo = getServerByName(name, owner);
  if (serverInfo) {
    closeServerRuntime(serverInfo);
  }
}

export const resetServerOAuthConnection = (name: string, owner?: string | null): boolean => {
  const serverInfo = getServerByName(name, owner);
  if (!serverInfo) {
    return false;
  }

  closeServerRuntime(serverInfo);
  serverInfo.status = 'oauth_required';
  serverInfo.error = null;
  serverInfo.tools = [];
  serverInfo.prompts = [];
  serverInfo.resources = [];
  serverInfo.oauth = undefined;

  broadcastToolListChanged();
  broadcastPromptListChanged();
  broadcastResourceListChanged();

  return true;
};

// Kill the entire process tree of a stdio transport's child process.
//
// transport.close() only sends SIGTERM to the direct child. When the server is
// launched through a wrapper like `npx` / `npm exec`, the wrapper does not
// forward signals to its descendants, so the real server process is left
// running as an orphan. Walk the whole tree and force-kill it.
function killStdioProcessTree(name: string, pid: number): void {
  const safeTreeKill = (signal: 'SIGTERM' | 'SIGKILL'): void => {
    try {
      treeKill(pid, signal, (err) => {
        if (err) {
          // ESRCH (no such process) is expected when the process already exited
          // — treat as success. Anything else is worth a warning.
          const code = (err as NodeJS.ErrnoException).code;
          if (code !== 'ESRCH') {
            // Pass the user-controlled `name` as a separate argument so a
            // server named e.g. "%s" cannot inject format specifiers into the
            // log line (CodeQL: use-of-externally-controlled-format-string).
            console.warn('Failed to send signal to process tree', {
              serverName: name,
              pid,
              signal,
              err,
            });
          }
        }
      });
    } catch (err) {
      console.warn('Failed to send signal to process tree', {
        serverName: name,
        pid,
        signal,
        err,
      });
    }
  };

  safeTreeKill('SIGTERM');

  setTimeout(() => {
    if (!isProcessAlive(pid)) {
      return;
    }
    safeTreeKill('SIGKILL');
  }, STDIO_KILL_GRACE_PERIOD_MS);
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but we don't have permission to signal
    // it — count it as alive so the SIGKILL fallback still fires. Any other
    // error (typically ESRCH) means the process is gone.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

// Toggle server enabled status
export const toggleServerStatus = async (
  name: string,
  enabled: boolean,
): Promise<{ success: boolean; message?: string }> => {
  try {
    await getServerDao().setEnabled(name, enabled);
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

      // Remove tool embeddings when server is disabled (for smart routing consistency)
      try {
        await removeServerToolEmbeddings(name);
        console.log(`Removed tool embeddings for disabled server: ${name}`);
      } catch (embeddingError) {
        console.warn('Failed to remove embeddings for server', {
          serverName: name,
          error: summarizeErrorForLogging(embeddingError),
        });
      }
    } else {
      // If enabling, reconnect the server to restore connection and sync tool embeddings
      try {
        await initializeClientsFromSettings(false, name);
        console.log(`Re-enabled server ${name} and triggered tool embedding sync`);
      } catch (reconnectError) {
        console.warn('Failed to reconnect server during enable', {
          serverName: name,
          error: summarizeErrorForLogging(reconnectError),
        });
      }
    }

    return { success: true, message: `Server ${enabled ? 'enabled' : 'disabled'} successfully` };
  } catch (error) {
    console.error('Failed to toggle server status', { serverName: name, error });
    return { success: false, message: 'Failed to toggle server status' };
  }
};

type McpAppsRouteContext = {
  enabled: boolean;
  serverInfo?: ServerInfo;
};

const getMcpAppsRouteContext = async (
  sessionId: string,
  group: string | undefined,
): Promise<McpAppsRouteContext> => {
  const reqCtx = RequestContextService.getInstance().getRequestContext();
  // Stateless (2026-07-28) requests have no session; capabilities arrive per request (#1263).
  const clientCapabilities = reqCtx?.stateless
    ? reqCtx.clientCapabilities
    : sessionId
      ? servers[sessionId]?.getClientCapabilities()
      : undefined;

  if (isSmartRoutingGroup(group) || !hasMcpAppsCapability(clientCapabilities)) {
    return { enabled: false };
  }

  const { filteredServerInfos } = await getFilteredServerInfosForGroup(group);
  if (
    filteredServerInfos.length !== 1 ||
    filteredServerInfos[0].status !== 'connected' ||
    !filteredServerInfos[0].client
  ) {
    return { enabled: false };
  }

  return {
    enabled: true,
    serverInfo: filteredServerInfos[0],
  };
};

const normalizeToolNameForServer = (serverName: string, toolName: string): string => {
  const prefix = `${serverName}${getNameSeparator()}`;
  return toolName.startsWith(prefix) ? toolName.substring(prefix.length) : toolName;
};

const getGroupLookupName = (group: string | undefined): string | undefined => {
  if (group === '$smart') {
    return undefined;
  }
  if (group?.startsWith('$smart/')) {
    return group.substring(7) || undefined;
  }
  return group;
};

const getExposedServerName = (serverName: string, serverConfig?: IGroupServerConfig): string => {
  return serverConfig?.alias?.trim() || serverName;
};

const replacePrefixedServerName = (
  name: string,
  fromServerName: string,
  toServerName: string,
): string => {
  if (fromServerName === toServerName) {
    return name;
  }

  const separator = getNameSeparator();
  const prefix = `${fromServerName}${separator}`;
  return name.startsWith(prefix)
    ? `${toServerName}${separator}${name.substring(prefix.length)}`
    : name;
};

const projectNameForGroup = (
  name: string,
  serverName: string,
  serverConfig?: IGroupServerConfig,
): string => {
  return replacePrefixedServerName(
    name,
    serverName,
    getExposedServerName(serverName, serverConfig),
  );
};

const resolveNameFromGroup = (
  name: string,
  serverName: string,
  serverConfig?: IGroupServerConfig,
): string => {
  return replacePrefixedServerName(
    name,
    getExposedServerName(serverName, serverConfig),
    serverName,
  );
};

const findToolOnServer = (
  serverInfo: ServerInfo,
  toolName: string,
  allowRawName: boolean,
): Tool | undefined => {
  const tool = serverInfo.tools.find(
    (item) =>
      item.name === toolName ||
      (allowRawName && normalizeToolNameForServer(serverInfo.name, item.name) === toolName),
  );
  if (!tool) {
    return undefined;
  }
  // A tool disabled via toggleTool must also be blocked at execution time (#1178).
  const bareToolName = normalizeToolNameForServer(serverInfo.name, tool.name);
  const toolConfig =
    serverInfo.config?.tools?.[tool.name] ?? serverInfo.config?.tools?.[bareToolName];
  if (toolConfig && toolConfig.enabled === false) {
    return undefined;
  }
  return tool;
};

const assertToolAvailableForRoute = (tool: Tool, appsRouteContext: McpAppsRouteContext): void => {
  if (isAppOnlyTool(tool) && !appsRouteContext.enabled) {
    throw new Error(`Tool '${tool.name}' is only available to MCP Apps`);
  }
};

const resolveToolInGroup = async (
  group: string | undefined,
  toolName: string,
  allowRawName: boolean,
): Promise<{ serverInfo: ServerInfo; toolName: string; tool: Tool } | undefined> => {
  const lookupGroup = getGroupLookupName(group);
  if (!lookupGroup) {
    return undefined;
  }

  const { filteredServerInfos, serverConfigsByName } =
    await getFilteredServerInfosForGroup(lookupGroup);

  // Validate full group catalog when preserveToolNames is active so collisions fail closed (#1391).
  const hasOriginalToolNames = [...serverConfigsByName.values()].some(
    (cfg) => cfg.preserveToolNames === true,
  );
  if (hasOriginalToolNames) {
    await listGroupTools(lookupGroup, filteredServerInfos, serverConfigsByName, {
      enabled: allowRawName,
    });
  }

  for (const serverInfo of filteredServerInfos) {
    if (
      (serverInfo.status !== 'connected' && serverInfo.config?.startOnDemand !== true) ||
      serverInfo.enabled === false
    ) {
      continue;
    }

    const serverConfig = serverConfigsByName.get(serverInfo.name);
    const internalToolName = serverConfig?.preserveToolNames
      ? `${serverInfo.name}${getNameSeparator()}${toolName}`
      : resolveNameFromGroup(toolName, serverInfo.name, serverConfig);
    const tool = findToolOnServer(serverInfo, internalToolName, allowRawName);
    if (!tool) {
      continue;
    }

    const filteredTools = await filterToolsByGroup(
      lookupGroup,
      serverInfo.name,
      [tool],
      serverConfig,
    );
    if (filteredTools.length === 0) {
      continue;
    }

    return { serverInfo, toolName: internalToolName, tool };
  }

  return undefined;
};

const findEnabledPromptOnServer = async (
  serverInfo: ServerInfo,
  name: string,
  allowRawName = false,
) => {
  if (serverInfo.status !== 'connected' || serverInfo.enabled === false) {
    return undefined;
  }
  const prompt = serverInfo.prompts.find(
    (item) =>
      item.name === name ||
      (allowRawName && item.name === `${serverInfo.name}${getNameSeparator()}${name}`),
  );
  if (!prompt) {
    return undefined;
  }
  const config = await getServerDao().findById(serverInfo.name);
  const barePromptName = normalizeToolNameForServer(serverInfo.name, prompt.name);
  const promptConfig = config?.prompts?.[prompt.name] ?? config?.prompts?.[barePromptName];
  return config?.enabled === false || promptConfig?.enabled === false ? undefined : prompt;
};

async function resolvePromptInGroup(
  group: string | undefined,
  promptName: string,
): Promise<{ serverInfo: ServerInfo; promptName: string } | undefined> {
  const lookupGroup = getGroupLookupName(group);
  if (!lookupGroup) {
    return undefined;
  }

  const { filteredServerInfos, serverConfigsByName } =
    await getFilteredServerInfosForGroup(lookupGroup);

  for (const serverInfo of filteredServerInfos) {
    if (
      (serverInfo.status !== 'connected' && serverInfo.config?.startOnDemand !== true) ||
      serverInfo.enabled === false
    ) {
      continue;
    }

    const serverConfig = serverConfigsByName.get(serverInfo.name);
    const internalPromptName = resolveNameFromGroup(promptName, serverInfo.name, serverConfig);
    const prompt = await findEnabledPromptOnServer(serverInfo, internalPromptName);
    if (!prompt) {
      continue;
    }

    const filteredPrompts = await filterPromptsByGroup(
      lookupGroup,
      serverInfo.name,
      [prompt],
      serverConfig,
    );
    if (filteredPrompts.length === 0) {
      continue;
    }

    return { serverInfo, promptName: internalPromptName };
  }

  return undefined;
}

const projectToolForDownstream = (
  serverName: string,
  tool: Tool,
  appsRouteContext: McpAppsRouteContext,
  serverConfig?: IGroupServerConfig,
): Tool | undefined => {
  if (!appsRouteContext.enabled && isAppOnlyTool(tool)) {
    return undefined;
  }

  const projectedTool = appsRouteContext.enabled ? tool : stripMcpAppsMetadata(tool);
  return {
    ...projectedTool,
    name: appsRouteContext.enabled
      ? normalizeToolNameForServer(serverName, projectedTool.name)
      : serverConfig?.preserveToolNames
        ? projectGroupToolName(projectedTool.name, serverName, serverConfig, getNameSeparator())
        : projectNameForGroup(projectedTool.name, serverName, serverConfig),
  };
};

const SMART_ROUTING_META_TOOL_NAMES = new Set(['search_tools', 'describe_tool', 'call_tool']);

const listGroupTools = async (
  group: string | undefined,
  filteredServerInfos: ServerInfo[],
  serverConfigsByName: Map<string, IGroupServerConfig>,
  appsRouteContext: McpAppsRouteContext,
  snapshots?: object[],
): Promise<Tool[]> => {
  const allTools: Tool[] = [];
  for (const serverInfo of filteredServerInfos) {
    if (serverInfo.tools && serverInfo.tools.length > 0) {
      snapshots?.push(serverInfo.tools);
      const groupServerConfig = serverConfigsByName.get(serverInfo.name);

      // Filter tools based on server configuration
      let tools = await filterToolsByConfig(serverInfo.name, serverInfo.tools);

      // If this is a group request, apply group-level tool filtering
      tools = await filterToolsByGroup(group, serverInfo.name, tools, groupServerConfig);

      // Apply custom descriptions and hidden parameters from server configuration
      const serverConfig = await getServerDao().findById(serverInfo.name);
      const runtimeNames = serverInfo.tools.map((t) => t.name);
      const toolsWithCustomDescriptions = tools.map((tool) => {
        const toolConfig = findToolConfig(serverConfig?.tools, serverInfo.name, tool.name, runtimeNames);
        const hiddenApplied = applyHiddenParams(tool, toolConfig);
        return {
          ...hiddenApplied,
          description: resolveDescriptionOverride(hiddenApplied.description, toolConfig),
        };
      });

      allTools.push(
        ...toolsWithCustomDescriptions.flatMap((tool) => {
          const projectedTool = projectToolForDownstream(
            serverInfo.name,
            tool,
            appsRouteContext,
            groupServerConfig,
          );
          return projectedTool ? [projectedTool] : [];
        }),
      );
    }
  }

  if ([...serverConfigsByName.values()].some((cfg) => cfg.preserveToolNames === true)) {
    assertValidGroupToolNames(allTools);
  }

  return allTools;
};

// Tools a $smart/<group> lists next to its meta-tools (#1238).
const getPinnedSmartRoutingTools = async (group: string | undefined): Promise<Tool[]> => {
  const lookupGroup = getGroupLookupName(group);
  if (!lookupGroup) {
    return [];
  }

  const { filteredServerInfos, serverConfigsByName } =
    await getFilteredServerInfosForGroup(lookupGroup);
  const pinnedConfigsByName = new Map<string, IGroupServerConfig>();
  for (const [serverName, serverConfig] of serverConfigsByName) {
    const selection = serverConfig.tools;
    const pinnedTools = (serverConfig.pinnedTools ?? []).filter(
      (toolName) => !Array.isArray(selection) || selection.includes(toolName),
    );
    if (pinnedTools.length > 0) {
      pinnedConfigsByName.set(serverName, { ...serverConfig, tools: pinnedTools });
    }
  }
  if (pinnedConfigsByName.size === 0) {
    return [];
  }

  return listGroupTools(
    lookupGroup,
    filteredServerInfos.filter((serverInfo) => pinnedConfigsByName.has(serverInfo.name)),
    pinnedConfigsByName,
    { enabled: false },
  );
};

const handleRawListToolsRequest = async (_: any, extra: any): Promise<any> => {
  const projectionStartedAt = performance.now();
  const sessionId = extra?.sessionId || '';
  const group = getMcpRequestGroup(extra);
  const isStateless = RequestContextService.getInstance().getRequestContext()?.stateless === true;
  console.log(`Handling ListToolsRequest for group: ${group}`);

  // Special handling for $smart group to return smart routing tools
  // Support both $smart and $smart/{group} patterns
  if (isSmartRoutingGroup(group)) {
    const smartResult = await getSmartRoutingTools(group);
    let pinnedTools: Tool[] = [];
    try {
      pinnedTools = (await getPinnedSmartRoutingTools(group)).filter(
        (tool) => !SMART_ROUTING_META_TOOL_NAMES.has(tool.name),
      );
    } catch (error) {
      console.warn(`Failed to list pinned tools for ${group}; returning meta-tools only`, error);
    }
    const merged =
      pinnedTools.length > 0
        ? { tools: [...smartResult.tools, ...pinnedTools] }
        : smartResult;
    return isStateless ? { ...merged, ttlMs: 0, cacheScope: 'private' as const } : merged;
  }

  const { filteredServerInfos, serverConfigsByName } = await getFilteredServerInfosForGroup(group);
  const appsRouteContext = await getMcpAppsRouteContext(sessionId, group);

  const snapshots: object[] = [];
  const allTools = await listGroupTools(
    group,
    filteredServerInfos,
    serverConfigsByName,
    appsRouteContext,
    snapshots,
  );

  if (isStateless) {
    const ttlMs = remainingListTtl(snapshots, projectionStartedAt, performance.now());
    return {
      tools: allTools,
      ttlMs,
      cacheScope: 'private' as const,
    };
  }

  return {
    tools: allTools,
  };
};

export const handleListToolsRequest = async (request: any, extra: any): Promise<any> => {
  const result = await handleRawListToolsRequest(request, extra);
  const shouldNormalize =
    typeof getSystemConfigDao === 'function'
      ? (await getSystemConfigDao().get())?.normalizeToolNames === true
      : false;
  if (!shouldNormalize) {
    return result;
  }
  const aliases = compatibleToolNames(result.tools);
  return {
    ...result,
    tools: result.tools.map((tool: Tool) => ({ ...tool, name: aliases.get(tool.name)! })),
  };
};

const handleOriginalCallToolRequest = async (request: any, extra: any) => {
  console.log('Handling CallToolRequest for tool', summarizeToolRequestForLogging(request.params));
  const startTime = Date.now();
  const activityLogger = getActivityLoggingService();

  // Get request context for activity logging
  const requestContextService = RequestContextService.getInstance();
  const bearerKeyContext = requestContextService.getBearerKeyContext();
  const sessionId = extra.sessionId || '';

  // Extract group and key info from request context (set by SSE/HTTP handlers)
  // Fallback to extra for backward compatibility (e.g., direct API calls)
  const group =
    requestContextService.getGroupContext() || extra?.group || getGroup(sessionId) || undefined;
  const username =
    requestContextService.getUsernameContext() ||
    extra?.username ||
    (requestContextService.getKeyKindContext() === 'system' ? 'system' : undefined) ||
    undefined;
  let appsRouteContext: McpAppsRouteContext = { enabled: false };
  const keyId = bearerKeyContext.keyId || extra?.keyId || undefined;
  const keyName = bearerKeyContext.keyName || extra?.keyName || undefined;
  const sourceIp = requestContextService.getRequestContext()?.remoteAddress || undefined;
  let hostedReservation: HostedCreditReservation | null = null;

  const reserveHostedIfNeeded = async (serverName: string, toolName: string) => {
    const hostedAuth = requestContextService.getHostedAuthContext();
    assertHostedToolAllowed(hostedAuth, serverName, toolName);
    hostedReservation = await reserveHostedToolCall(hostedAuth, serverName, toolName);
  };

  const settleHostedIfNeeded = async (input: {
    success: boolean;
    requestContent?: unknown;
    responseContent?: unknown;
  }) => {
    const reservation = hostedReservation;
    hostedReservation = null;
    await settleHostedToolCall(reservation, {
      success: input.success,
      latencyMs: Date.now() - startTime,
      requestContent: input.requestContent,
      responseContent: input.responseContent,
    });
  };

  try {
    appsRouteContext = await getMcpAppsRouteContext(sessionId, group);

    // Special handling for smart routing tools
    if (request.params.name === 'search_tools') {
      const { query, limit = 10 } = request.params.arguments || {};
      return await handleSearchToolsRequest(query, limit, sessionId, group);
    }

    // Special handling for describe_tool (progressive disclosure mode)
    if (request.params.name === 'describe_tool') {
      const { toolName } = request.params.arguments || {};
      return await handleDescribeToolRequest(toolName, sessionId, group);
    }

    // Special handling for call_tool
    if (request.params.name === 'call_tool') {
      const { toolName } = request.params.arguments || {};
      if (!toolName) {
        throw new Error('toolName parameter is required');
      }

      const { arguments: toolArgs } = request.params.arguments || {};
      let targetServerInfo: ServerInfo | undefined;
      let targetToolName = toolName;
      let targetTool: Tool | undefined;
      if (appsRouteContext.enabled) {
        targetServerInfo = appsRouteContext.serverInfo;
      } else if (extra && extra.server) {
        targetServerInfo = getServerByName(extra.server);
      } else if (getGroupLookupName(group)) {
        const groupTool = await resolveToolInGroup(group, toolName, appsRouteContext.enabled);
        if (groupTool) {
          targetServerInfo = groupTool.serverInfo;
          targetToolName = groupTool.toolName;
          targetTool = groupTool.tool;
        }
      } else {
        // Find the first server that has this tool (include sleeping on-demand servers)
        targetServerInfo = serverInfos.find(
          (serverInfo) =>
            serverInfo.enabled !== false &&
            (serverInfo.status === 'connected' || serverInfo.config?.startOnDemand === true) &&
            serverInfo.tools.some((tool) => tool.name === toolName),
        );
      }

      if (!targetServerInfo) {
        throw new Error(`No available servers found with tool: ${toolName}`);
      }

      if (targetServerInfo.config?.startOnDemand && targetServerInfo.status !== 'connected') {
        await ensureServerReady(targetServerInfo);
        if ((targetServerInfo as ServerInfo).status !== 'connected') {
          throw new Error(`Failed to start on-demand server '${targetServerInfo.name}'`);
        }
      }
      targetServerInfo.lastUsedAt = Date.now();

      // Check if the tool exists on the server
      const tool =
        targetTool ?? findToolOnServer(targetServerInfo, targetToolName, appsRouteContext.enabled);
      if (!tool) {
        throw new Error(`Tool '${toolName}' not found on server '${targetServerInfo.name}'`);
      }
      assertToolAvailableForRoute(tool, appsRouteContext);

      const targetToolConfig = findToolConfig(
        targetServerInfo.config?.tools,
        targetServerInfo.name,
        tool.name,
        targetServerInfo.tools.map((t) => t.name),
      );

      // Handle OpenAPI servers differently
      if (targetServerInfo.openApiClient) {
        // For OpenAPI servers, use the OpenAPI client
        const openApiClient = targetServerInfo.openApiClient;

        // Use toolArgs if it has properties, otherwise fallback to empty object, stripping hidden params (#1343)
        const rawFinalArgs = toolArgs && typeof toolArgs === 'object' ? toolArgs : {};
        const finalArgs = removeHiddenArguments(rawFinalArgs, tool.inputSchema, targetToolConfig);

        console.log('Invoking OpenAPI tool', {
          toolName: targetToolName,
          serverName: targetServerInfo.name,
          arguments: summarizeArgumentsForLogging(finalArgs),
        });

        // Remove server prefix from tool name if present
        const cleanToolName = normalizeToolNameForServer(targetServerInfo.name, targetToolName);

        // Extract passthrough headers from extra or request context
        let passthroughHeaders: Record<string, string> | undefined;
        let requestHeaders: Record<string, string | string[] | undefined> | null = null;

        // Try to get headers from extra parameter first (if available)
        if (extra?.headers) {
          requestHeaders = extra.headers;
        } else {
          // Fallback to request context service
          const requestContextService = RequestContextService.getInstance();
          requestHeaders = requestContextService.getHeaders();
        }

        if (requestHeaders && targetServerInfo.config?.openapi?.passthroughHeaders) {
          passthroughHeaders = {};
          for (const headerName of targetServerInfo.config.openapi.passthroughHeaders) {
            // Handle different header name cases (Express normalizes headers to lowercase)
            const headerValue =
              requestHeaders[headerName] || requestHeaders[headerName.toLowerCase()];
            if (headerValue) {
              passthroughHeaders[headerName] = Array.isArray(headerValue)
                ? headerValue[0]
                : String(headerValue);
            }
          }
        }

        await reserveHostedIfNeeded(targetServerInfo.name, cleanToolName);
        const result = await openApiClient.callTool(cleanToolName, finalArgs, passthroughHeaders);
        await settleHostedIfNeeded({
          success: true,
          requestContent: finalArgs,
          responseContent: result,
        });

        console.log('OpenAPI tool invocation result', {
          serverName: targetServerInfo.name,
          toolName: cleanToolName,
          result: summarizeToolResultForLogging(result),
        });

        // Log successful activity
        const duration = Date.now() - startTime;
        await activityLogger.logToolCall({
          server: targetServerInfo.name,
          tool: cleanToolName,
          duration,
          status: 'success',
          input: finalArgs,
          output: result,
          group,
          username,
          keyId,
          keyName,
          sourceIp,
        });

        return await maybeCompressToolResult(
          {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result),
              },
            ],
          },
          {
            serverName: targetServerInfo.name,
            toolName: cleanToolName,
            group,
          },
        );
      }

      // Call the tool on the target server (MCP servers)
      // For servers with perSessionClient: true, use a per-session or explicit-state dedicated client
      let isolatedCtx: IsolatedClientContext | undefined;
      if (targetServerInfo.config?.perSessionClient) {
        const isolatedKey = resolveIsolatedClientKey(
          targetServerInfo.name,
          sessionId,
          request.params?._meta,
        );
        if (isolatedKey) {
          const isolated = await getOrCreateIsolatedClient(isolatedKey, targetServerInfo);
          isolatedCtx = {
            sessionId: isolatedKey,
            client: isolated.client,
            transport: isolated.transport,
          };
        }
      } else if (!targetServerInfo.client) {
        throw new Error(`Client not found for server: ${targetServerInfo.name}`);
      }

      // Use toolArgs if it has properties, otherwise fallback to empty object, stripping hidden params (#1343)
      const rawFinalArgs = toolArgs && typeof toolArgs === 'object' ? toolArgs : {};
      const finalArgs = removeHiddenArguments(rawFinalArgs, tool.inputSchema, targetToolConfig);

      console.log('Invoking tool', {
        toolName: targetToolName,
        serverName: targetServerInfo.name,
        arguments: summarizeArgumentsForLogging(finalArgs),
        perSessionClient: !!targetServerInfo.config?.perSessionClient,
      });

      const cleanToolName = normalizeToolNameForServer(targetServerInfo.name, targetToolName);
      await reserveHostedIfNeeded(targetServerInfo.name, cleanToolName);
      const result = await callToolWithReconnect(
        targetServerInfo,
        {
          name: cleanToolName,
          arguments: finalArgs,
        },
        targetServerInfo.options || {},
        1,
        isolatedCtx,
      );
      scheduleIdleShutdown(targetServerInfo);
      await settleHostedIfNeeded({
        success: !result.isError,
        requestContent: finalArgs,
        responseContent: result,
      });

      console.log('Tool invocation result', {
        serverName: targetServerInfo.name,
        toolName: cleanToolName,
        result: summarizeToolResultForLogging(result),
      });

      // Log successful activity
      const duration = Date.now() - startTime;
      await activityLogger.logToolCall({
        server: targetServerInfo.name,
        tool: cleanToolName,
        duration,
        status: result.isError ? 'error' : 'success',
        input: finalArgs,
        output: result,
        group,
        username,
        keyId,
        keyName,
        sourceIp,
        errorMessage: result.isError ? 'Tool returned error response' : undefined,
      });

      return await maybeCompressToolResult(result, {
        serverName: targetServerInfo.name,
        toolName: cleanToolName,
        group,
      });
    }

    // Regular tool handling
    const lookupGroup = getGroupLookupName(group);
    const groupTool =
      !appsRouteContext.enabled && lookupGroup
        ? await resolveToolInGroup(lookupGroup, request.params.name, appsRouteContext.enabled)
        : undefined;
    const serverInfo = appsRouteContext.enabled
      ? appsRouteContext.serverInfo
      : (groupTool?.serverInfo ??
        (lookupGroup ? undefined : getServerByTool(request.params.name)));
    const routeToolName = groupTool?.toolName ?? request.params.name;
    const tool =
      groupTool?.tool ??
      (serverInfo
        ? findToolOnServer(serverInfo, routeToolName, appsRouteContext.enabled)
        : undefined);
    if (!serverInfo || !tool) {
      throw new Error(`Server not found: ${request.params.name}`);
    }
    assertToolAvailableForRoute(tool, appsRouteContext);

    const directToolConfig = findToolConfig(
      serverInfo.config?.tools,
      serverInfo.name,
      tool.name,
      serverInfo.tools.map((t) => t.name),
    );
    const sanitizedDirectArgs = removeHiddenArguments(
      request.params.arguments || {},
      tool.inputSchema,
      directToolConfig,
    );

    if (serverInfo.config?.startOnDemand && serverInfo.status !== 'connected') {
      await ensureServerReady(serverInfo);
      if ((serverInfo as ServerInfo).status !== 'connected') {
        throw new Error(`Failed to start on-demand server '${serverInfo.name}'`);
      }
    }
    serverInfo.lastUsedAt = Date.now();

    // Handle OpenAPI servers differently
    if (serverInfo.openApiClient) {
      // For OpenAPI servers, use the OpenAPI client
      const openApiClient = serverInfo.openApiClient;

      // Remove server prefix from tool name if present
      const cleanToolName = normalizeToolNameForServer(serverInfo.name, routeToolName);

      console.log('Invoking OpenAPI tool', {
        toolName: cleanToolName,
        serverName: serverInfo.name,
        arguments: summarizeArgumentsForLogging(request.params.arguments),
      });

      // Extract passthrough headers from extra or request context
      let passthroughHeaders: Record<string, string> | undefined;
      let requestHeaders: Record<string, string | string[] | undefined> | null = null;

      // Try to get headers from extra parameter first (if available)
      if (extra?.headers) {
        requestHeaders = extra.headers;
      } else {
        // Fallback to request context service
        const requestContextService = RequestContextService.getInstance();
        requestHeaders = requestContextService.getHeaders();
      }

      if (requestHeaders && serverInfo.config?.openapi?.passthroughHeaders) {
        passthroughHeaders = {};
        for (const headerName of serverInfo.config.openapi.passthroughHeaders) {
          // Handle different header name cases (Express normalizes headers to lowercase)
          const headerValue =
            requestHeaders[headerName] || requestHeaders[headerName.toLowerCase()];
          if (headerValue) {
            passthroughHeaders[headerName] = Array.isArray(headerValue)
              ? headerValue[0]
              : String(headerValue);
          }
        }
      }

      const finalArgs = sanitizedDirectArgs;
      await reserveHostedIfNeeded(serverInfo.name, cleanToolName);
      const result = await openApiClient.callTool(cleanToolName, finalArgs, passthroughHeaders);
      await settleHostedIfNeeded({
        success: true,
        requestContent: finalArgs,
        responseContent: result,
      });

      console.log('OpenAPI tool invocation result', {
        serverName: serverInfo.name,
        toolName: cleanToolName,
        result: summarizeToolResultForLogging(result),
      });

      // Log successful activity
      const duration = Date.now() - startTime;
      await activityLogger.logToolCall({
        server: serverInfo.name,
        tool: cleanToolName,
        duration,
        status: 'success',
        input: request.params.arguments,
        output: result,
        group,
        username,
        keyId,
        keyName,
        sourceIp,
      });

      return await maybeCompressToolResult(
        {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        },
        {
          serverName: serverInfo.name,
          toolName: cleanToolName,
          group,
        },
      );
    }

    // Handle MCP servers
    // For servers with perSessionClient: true, use a per-session or explicit-state dedicated client
    let isolatedCtx: IsolatedClientContext | undefined;
    if (serverInfo.config?.perSessionClient) {
      const isolatedKey = resolveIsolatedClientKey(
        serverInfo.name,
        sessionId,
        request.params?._meta,
      );
      if (isolatedKey) {
        const isolated = await getOrCreateIsolatedClient(isolatedKey, serverInfo);
        isolatedCtx = {
          sessionId: isolatedKey,
          client: isolated.client,
          transport: isolated.transport,
        };
      }
    } else if (!serverInfo.client) {
      throw new Error(`Client not found for server: ${serverInfo.name}`);
    }

    const cleanToolName = normalizeToolNameForServer(serverInfo.name, routeToolName);
    await reserveHostedIfNeeded(serverInfo.name, cleanToolName);
    const result = await callToolWithReconnect(
      serverInfo,
      { ...request.params, name: cleanToolName, arguments: sanitizedDirectArgs },
      serverInfo.options || {},
      1,
      isolatedCtx,
    );
    scheduleIdleShutdown(serverInfo);
    await settleHostedIfNeeded({
      success: !result.isError,
      requestContent: request.params.arguments,
      responseContent: result,
    });
    console.log('Tool call result', {
      serverName: serverInfo.name,
      toolName: cleanToolName,
      result: summarizeToolResultForLogging(result),
    });

    // Log successful activity
    const duration = Date.now() - startTime;
    await activityLogger.logToolCall({
      server: serverInfo.name,
      tool: cleanToolName,
      duration,
      status: result.isError ? 'error' : 'success',
      input: request.params.arguments,
      output: result,
      group,
      username,
      keyId,
      keyName,
      sourceIp,
      errorMessage: result.isError ? 'Tool returned error response' : undefined,
    });

    return await maybeCompressToolResult(result, {
      serverName: serverInfo.name,
      toolName: cleanToolName,
      group,
    });
  } catch (error) {
    console.error('Error handling CallToolRequest', summarizeErrorForLogging(error));

    // Log error activity
    const duration = Date.now() - startTime;
    await settleHostedIfNeeded({
      success: false,
      requestContent: getActivityInputFromToolRequest(request),
      responseContent: { error: formatErrorForLogging(error) },
    });
    const activityToolName = getActivityToolNameFromRequest(request);
    const serverInfo =
      (typeof extra?.server === 'string' ? getServerByName(extra.server) : undefined) ||
      getServerByTool(activityToolName);
    const cleanToolName = stripToolServerPrefix(activityToolName, serverInfo?.name);

    await activityLogger.logToolCall({
      server: serverInfo?.name || 'unknown',
      tool: cleanToolName,
      duration,
      status: 'error',
      input: getActivityInputFromToolRequest(request),
      group,
      username,
      keyId,
      keyName,
      sourceIp,
      errorMessage: formatErrorForLogging(error),
    });

    const safeErrorText = formatErrorForLogging(error);

    return {
      content: [
        {
          type: 'text',
          text: `Error: ${safeErrorText}`,
        },
      ],
      isError: true,
    };
  }
};

export const handleCallToolRequest = async (request: any, extra: any) => {
  const shouldNormalize =
    typeof getSystemConfigDao === 'function'
      ? (await getSystemConfigDao().get())?.normalizeToolNames === true
      : false;
  if (shouldNormalize && !extra?.server) {
    const requestedName = request?.params?.name;
    if (typeof requestedName === 'string' && !SMART_ROUTING_META_TOOL_NAMES.has(requestedName)) {
      const catalog = await handleRawListToolsRequest({}, extra);
      const aliases = compatibleToolNames(catalog.tools);
      const original = [...aliases].find(([, alias]) => alias === requestedName)?.[0];
      if (original !== undefined && original !== requestedName) {
        request = { ...request, params: { ...request.params, name: original } };
      }
    }
  }
  return handleOriginalCallToolRequest(request, extra);
};

export const handleGetPromptRequest = async (request: any, extra: any): Promise<any> => {
  try {
    const { name, arguments: promptArgs } = request.params;
    const sessionId = extra?.sessionId || '';
    const group = extra?.group || getGroup(sessionId) || undefined;

    // Check built-in prompts first unless the request pins a specific server (GHSA-vgj6-pm6x-8g97)
    const builtinPrompt = !extra?.server && (await getBuiltinPromptDao().findByName(name));
    if (builtinPrompt && builtinPrompt.enabled !== false) {
      // Perform {{param}} template substitution
      let content = builtinPrompt.template;
      if (promptArgs) {
        for (const [key, value] of Object.entries(promptArgs)) {
          content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value));
        }
      }
      return {
        messages: [
          {
            role: 'user',
            content: { type: 'text', text: content },
          },
        ],
      };
    }

    let server: ServerInfo | undefined;
    let promptNameForServer = name;
    const lookupGroup = getGroupLookupName(group);
    if (extra && extra.server) {
      // The caller pinned a server (REST /mcp/:serverName/prompts/:promptName):
      // resolve strictly against it and honour the per-prompt enabled flag.
      const candidate = getServerByName(extra.server);
      const prompt = candidate && (await findEnabledPromptOnServer(candidate, name, true));
      if (prompt) {
        server = candidate;
        promptNameForServer = prompt.name;
      }
    } else if (lookupGroup) {
      const groupPrompt = await resolvePromptInGroup(lookupGroup, name);
      if (groupPrompt) {
        server = groupPrompt.serverInfo;
        promptNameForServer = groupPrompt.promptName;
      }
    } else {
      // Find the first server that has this enabled prompt
      for (const candidate of serverInfos) {
        const prompt = await findEnabledPromptOnServer(candidate, name);
        if (prompt) {
          server = candidate;
          promptNameForServer = prompt.name;
          break;
        }
      }
    }
    if (!server) {
      throw new Error(`Server not found: ${name}`);
    }

    // Remove server prefix from prompt name if present
    const separator = getNameSeparator();
    const prefix = `${server.name}${separator}`;
    const cleanPromptName = promptNameForServer.startsWith(prefix)
      ? promptNameForServer.substring(prefix.length)
      : promptNameForServer;

    const promptParams = {
      name: cleanPromptName || '',
      arguments: promptArgs,
    };
    // Log the final promptParams
    console.log('Calling getPrompt with params', {
      name: cleanPromptName || '',
      arguments: summarizeArgumentsForLogging(promptArgs),
    });
    const prompt = await server.client?.getPrompt(promptParams);
    console.log('Received prompt', summarizePromptForLogging(prompt));
    if (!prompt) {
      throw new Error(`Prompt not found: ${cleanPromptName}`);
    }

    return prompt;
  } catch (error) {
    console.error('Error handling GetPromptRequest', summarizeErrorForLogging(error));
    const safeErrorText = formatErrorForLogging(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${safeErrorText}`,
        },
      ],
      isError: true,
    };
  }
};

export const handleListPromptsRequest = async (_: any, extra: any) => {
  const sessionId = extra?.sessionId || '';
  const group = getMcpRequestGroup(extra);
  const lookupGroup = getGroupLookupName(group);
  console.log(`Handling ListPromptsRequest for group: ${group}`);

  // Start with built-in prompts (only enabled ones)
  const builtinPrompts = await getBuiltinPromptDao().findEnabled();
  const allPrompts: any[] = builtinPrompts.map((bp) =>
    normalizePromptForList({
      name: bp.name,
      title: bp.title,
      description: bp.description,
      arguments: bp.arguments,
    }),
  );

  const { filteredServerInfos, serverConfigsByName } =
    await getFilteredServerInfosForGroup(lookupGroup);

  for (const serverInfo of filteredServerInfos) {
    if (serverInfo.prompts && serverInfo.prompts.length > 0) {
      const groupServerConfig = serverConfigsByName.get(serverInfo.name);

      // Filter prompts based on server configuration
      const serverConfig = await getServerDao().findById(serverInfo.name);

      let enabledPrompts = serverInfo.prompts;
      if (serverConfig && serverConfig.prompts) {
        enabledPrompts = serverInfo.prompts.filter((prompt: any) => {
          const barePromptName = normalizeToolNameForServer(serverInfo.name, prompt.name);
          const promptConfig =
            serverConfig.prompts?.[prompt.name] ?? serverConfig.prompts?.[barePromptName];
          // If prompt is not in config, it's enabled by default
          return promptConfig?.enabled !== false;
        });
      }

      enabledPrompts = await filterPromptsByGroup(
        lookupGroup,
        serverInfo.name,
        enabledPrompts,
        groupServerConfig,
      );

      // Apply custom descriptions from server configuration
      const promptsWithCustomDescriptions = enabledPrompts.map((prompt: any) => {
        const promptConfig = serverConfig?.prompts?.[prompt.name];
        return normalizePromptForList({
          ...prompt,
          name: projectNameForGroup(prompt.name, serverInfo.name, groupServerConfig),
          description: promptConfig?.description || prompt.description, // Use custom description if available
        });
      });

      allPrompts.push(...promptsWithCustomDescriptions);
    }
  }

  return {
    prompts: allPrompts,
  };
};

export const handleListResourcesRequest = async (_: any, extra: any) => {
  const sessionId = extra?.sessionId || '';
  const group = getMcpRequestGroup(extra);
  const lookupGroup = getGroupLookupName(group);
  console.log(`Handling ListResourcesRequest for group: ${group}`);
  const appsRouteContext = await getMcpAppsRouteContext(sessionId, group);

  // Start with built-in resources (only enabled ones)
  const builtinResources = await getBuiltinResourceDao().findEnabled();
  const allResources: any[] = builtinResources.map((br) =>
    normalizeResourceForList({
      uri: br.uri,
      name: br.name,
      description: br.description,
      mimeType: br.mimeType,
    }),
  );

  const { filteredServerInfos, serverConfigsByName } =
    await getFilteredServerInfosForGroup(lookupGroup);

  for (const serverInfo of filteredServerInfos) {
    if (serverInfo.resources && serverInfo.resources.length > 0) {
      // Filter resources based on server configuration
      const serverConfig = await getServerDao().findById(serverInfo.name);

      let enabledResources = serverInfo.resources;
      if (serverConfig && serverConfig.resources) {
        enabledResources = serverInfo.resources.filter((resource: any) => {
          const resourceConfig = serverConfig.resources?.[resource.uri];
          return resourceConfig?.enabled !== false;
        });
      }

      enabledResources = await filterResourcesByGroup(
        lookupGroup,
        serverInfo.name,
        enabledResources,
        serverConfigsByName.get(serverInfo.name),
      );

      // Apply custom descriptions from server configuration
      const resourcesWithCustomDescriptions = enabledResources.map((resource: any) => {
        const resourceConfig = serverConfig?.resources?.[resource.uri];
        const normalizedResource = normalizeResourceForList({
          ...resource,
          description: resourceConfig?.description || resource.description,
        });
        return appsRouteContext.enabled
          ? normalizedResource
          : stripMcpAppsMetadata(normalizedResource);
      });

      allResources.push(...resourcesWithCustomDescriptions);
    }
  }

  return {
    resources: allResources,
  };
};

export const handleListResourceTemplatesRequest = async (_: any, extra: any): Promise<any> => {
  const sessionId = extra?.sessionId || '';
  const group = getMcpRequestGroup(extra);
  const lookupGroup = getGroupLookupName(group);
  console.log(`Handling ListResourceTemplatesRequest for group: ${group}`);
  const appsRouteContext = await getMcpAppsRouteContext(sessionId, group);

  const { filteredServerInfos, serverConfigsByName } = await getFilteredServerInfosForGroup(
    lookupGroup,
    {
      requireClient: true,
    },
  );

  const results = await Promise.allSettled(
    filteredServerInfos.map(async (serverInfo) => {
      if (!serverInfo.client?.listResourceTemplates) {
        return [];
      }

      const templates = await serverInfo.client.listResourceTemplates({}, serverInfo.options || {});
      const filteredTemplates = await filterResourceTemplatesByGroup(
        lookupGroup,
        serverInfo.name,
        templates.resourceTemplates || [],
        serverConfigsByName.get(serverInfo.name),
      );
      return appsRouteContext.enabled
        ? filteredTemplates
        : filteredTemplates.map((template) => stripMcpAppsMetadata(template));
    }),
  );

  return {
    resourceTemplates: results.flatMap((result) =>
      result.status === 'fulfilled' ? result.value : [],
    ),
  };
};

export const handleReadResourceRequest = async (request: any, extra: any) => {
  try {
    const { uri } = request.params;
    const sessionId = extra?.sessionId || '';
    const group = getMcpRequestGroup(extra);
    const lookupGroup = getGroupLookupName(group);
    const appsRouteContext = await getMcpAppsRouteContext(sessionId, group);

    // Check built-in resources first
    const builtinResource = await getBuiltinResourceDao().findByUri(uri);
    if (builtinResource && builtinResource.enabled !== false) {
      return {
        contents: [
          {
            uri: builtinResource.uri,
            mimeType: builtinResource.mimeType || 'text/plain',
            text: builtinResource.content,
          },
        ],
      };
    }

    const { filteredServerInfos, serverConfigsByName } =
      await getFilteredServerInfosForGroup(lookupGroup);

    let server: ServerInfo | undefined;
    for (const serverInfo of filteredServerInfos) {
      if (serverInfo.status !== 'connected') {
        continue;
      }
      const serverConfig = await getServerDao().findById(serverInfo.name);
      let enabledResources = serverInfo.resources;
      if (serverConfig?.resources) {
        enabledResources = enabledResources.filter(
          (resource) => serverConfig.resources?.[resource.uri]?.enabled !== false,
        );
      }
      enabledResources = await filterResourcesByGroup(
        lookupGroup,
        serverInfo.name,
        enabledResources,
        serverConfigsByName.get(serverInfo.name),
      );
      if (enabledResources.some((resource) => resource.uri === uri)) {
        server = serverInfo;
        break;
      }
    }

    if (!server && appsRouteContext.enabled && uri.startsWith('ui://')) {
      const candidate = appsRouteContext.serverInfo;
      if (candidate) {
        const candidateConfig = await getServerDao().findById(candidate.name);
        if (candidateConfig?.resources?.[uri]?.enabled !== false) {
          const allowed = await filterResourcesByGroup(
            lookupGroup,
            candidate.name,
            [{ uri }],
            serverConfigsByName.get(candidate.name),
          );
          if (allowed.length > 0) {
            server = candidate;
          }
        }
      }
    }

    if (!server?.client) {
      throw new Error(`Resource not found: ${uri}`);
    }

    const result = await server.client.readResource({ uri });
    if (!result || !Array.isArray(result.contents)) {
      throw new Error(`Failed to read resource: ${uri}`);
    }

    return appsRouteContext.enabled
      ? result
      : {
          ...result,
          contents: result.contents.map((content) => stripMcpAppsMetadata(content)),
        };
  } catch (error) {
    console.error('Error handling ReadResourceRequest', summarizeErrorForLogging(error));
    const safeErrorText = formatErrorForLogging(error);
    return {
      contents: [
        {
          uri: request.params?.uri || '',
          mimeType: 'text/plain',
          text: `Error: ${safeErrorText}`,
        },
      ],
    };
  }
};

// Create McpServer instance
type CreateMcpServerOptions = {
  group?: string;
  instructions?: string;
  appendGroupSuffix?: boolean;
  modern?: boolean;
};

export const createMcpServer = (
  name: string,
  version: string,
  options?: string | CreateMcpServerOptions,
): Server => {
  const normalizedOptions = typeof options === 'string' ? { group: options } : (options ?? {});
  // Determine server name based on routing type
  let serverName = name;

  if (normalizedOptions.group && normalizedOptions.appendGroupSuffix !== false) {
    // For createMcpServer we use sync approach since it's called synchronously
    // The actual group validation happens at request time
    serverName = `${name}_${normalizedOptions.group}_group`;
  }
  // If no group, use default name (global routing)

  const server = new Server(
    { name: serverName, version },
    {
      ...(!normalizedOptions.modern
        ? { supportedProtocolVersions: LEGACY_PROTOCOL_VERSIONS }
        : {}),
      capabilities: {
        tools: { listChanged: true },
        prompts: { listChanged: true },
        resources: { listChanged: true },
        ...MCP_APPS_CAPABILITIES,
      },
      ...(normalizedOptions.instructions !== undefined
        ? { instructions: normalizedOptions.instructions }
        : {}),
    },
  );
  server.setRequestHandler('tools/list', handleListToolsRequest);
  server.setRequestHandler('tools/call', handleCallToolRequest);
  server.setRequestHandler('prompts/get', handleGetPromptRequest);
  server.setRequestHandler('prompts/list', handleListPromptsRequest);
  server.setRequestHandler('resources/list', handleListResourcesRequest);
  server.setRequestHandler('resources/templates/list', handleListResourceTemplatesRequest);
  server.setRequestHandler('resources/read', handleReadResourceRequest);
  return server;
};

type FilteredGroupServersResult = {
  filteredServerInfos: ServerInfo[];
  serverConfigsByName: Map<string, IGroupServerConfig>;
};

export const getFilteredServerInfosForGroup = async (
  group: string | undefined,
  options?: { requireClient?: boolean },
): Promise<FilteredGroupServersResult> => {
  // Resolve group server configs. We look up the group directly from the DAO
  // rather than going through getServerConfigsInGroup (which calls getAllGroups
  // and applies filterData on groups). Groups don't carry a visibility field,
  // so admin-owned groups would be filtered out for non-admin users even though
  // bearer-key auth already authorized access and individual servers inside the
  // group may be public. Server-level filterData below still enforces per-server
  // visibility. Fix for #914.
  let serverConfigs: IGroupServerConfig[] = [];
  if (group) {
    const groupDao = getGroupDao();
    let foundGroup = await groupDao.findByName(group);
    if (!foundGroup) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(group)) {
        foundGroup = await groupDao.findById(group);
      }
    }
    if (foundGroup) {
      serverConfigs = normalizeGroupServers(foundGroup.servers || []);
    }
  }

  const serverNamesInGroup = new Set(serverConfigs.map((serverConfig) => serverConfig.name));
  const serverConfigsByName = new Map(
    serverConfigs.map((serverConfig) => [serverConfig.name, serverConfig] as const),
  );

  const excludedServerNames = RequestContextService.getInstance().getBearerKeyExclusions?.();
  const excludedSet =
    excludedServerNames && excludedServerNames.length > 0 ? new Set(excludedServerNames) : null;

  const filteredServerInfos: ServerInfo[] = [];
  for (const serverInfo of getDataService().filterData(serverInfos)) {
    if (serverInfo.enabled === false) continue;
    if (excludedSet?.has(serverInfo.name)) continue;
    if (options?.requireClient && !serverInfo.client) continue;

    if (!group) {
      filteredServerInfos.push(serverInfo);
      continue;
    }

    if (serverNamesInGroup.size === 0) {
      if (serverInfo.name === group) {
        filteredServerInfos.push(serverInfo);
      }
      continue;
    }

    if (serverNamesInGroup.has(serverInfo.name)) {
      filteredServerInfos.push(serverInfo);
    }
  }

  return { filteredServerInfos, serverConfigsByName };
};

const getGroupServerConfig = async (
  group: string | undefined,
  serverName: string,
  serverConfig?: IGroupServerConfig,
) => {
  if (!group) {
    return undefined;
  }

  return serverConfig ?? getServerConfigInGroup(group, serverName);
};

// Filter tools based on group configuration
async function filterToolsByGroup(
  group: string | undefined,
  serverName: string,
  tools: Tool[],
  serverConfig?: IGroupServerConfig,
) {
  if (group) {
    const resolvedServerConfig = await getGroupServerConfig(group, serverName, serverConfig);
    if (
      resolvedServerConfig &&
      resolvedServerConfig.tools !== 'all' &&
      Array.isArray(resolvedServerConfig.tools)
    ) {
      // Filter tools based on group configuration
      const allowedToolNames = resolvedServerConfig.tools.map(
        (toolName: string) => `${serverName}${getNameSeparator()}${toolName}`,
      );
      tools = tools.filter((tool) => allowedToolNames.includes(tool.name));
    }
  }

  const hostedAuth = RequestContextService.getInstance().getHostedAuthContext();
  return filterHostedTools(hostedAuth, serverName, tools, getNameSeparator());
}

const normalizePromptNameForGroup = (serverName: string, promptName: string) => {
  const prefix = `${serverName}${getNameSeparator()}`;
  return promptName.startsWith(prefix) ? promptName.substring(prefix.length) : promptName;
};

export async function filterPromptsByGroup(
  group: string | undefined,
  serverName: string,
  prompts: Array<{ name: string }>,
  serverConfig?: IGroupServerConfig,
) {
  if (group) {
    const resolvedServerConfig = await getGroupServerConfig(group, serverName, serverConfig);
    if (
      resolvedServerConfig &&
      resolvedServerConfig.prompts !== 'all' &&
      Array.isArray(resolvedServerConfig.prompts)
    ) {
      const allowedPromptNames = new Set(resolvedServerConfig.prompts);
      return prompts.filter((prompt) =>
        allowedPromptNames.has(normalizePromptNameForGroup(serverName, prompt.name)),
      );
    }
  }

  return prompts;
}

export async function filterResourcesByGroup(
  group: string | undefined,
  serverName: string,
  resources: Array<{ uri: string }>,
  serverConfig?: IGroupServerConfig,
) {
  if (group) {
    const resolvedServerConfig = await getGroupServerConfig(group, serverName, serverConfig);
    if (
      resolvedServerConfig &&
      resolvedServerConfig.resources !== 'all' &&
      Array.isArray(resolvedServerConfig.resources)
    ) {
      const allowedResources = new Set(resolvedServerConfig.resources);
      return resources.filter((resource) => allowedResources.has(resource.uri));
    }
  }

  return resources;
}

const resourceTemplateMatchesSelection = (uriTemplate: string, allowedResources: Set<string>) => {
  if (allowedResources.has(uriTemplate)) {
    return true;
  }

  const dynamicSegmentIndex = uriTemplate.search(/[{*]/);
  if (dynamicSegmentIndex === -1) {
    return false;
  }

  const staticPrefix = uriTemplate.slice(0, dynamicSegmentIndex);
  if (!staticPrefix) {
    return false;
  }

  for (const resourceUri of allowedResources) {
    if (resourceUri.startsWith(staticPrefix)) {
      return true;
    }
  }

  return false;
};

export async function filterResourceTemplatesByGroup(
  group: string | undefined,
  serverName: string,
  resourceTemplates: Array<{ uriTemplate?: string; _meta?: Record<string, unknown> }>,
  serverConfig?: IGroupServerConfig,
) {
  if (group) {
    const resolvedServerConfig = await getGroupServerConfig(group, serverName, serverConfig);
    if (
      resolvedServerConfig &&
      resolvedServerConfig.resources !== 'all' &&
      Array.isArray(resolvedServerConfig.resources)
    ) {
      if (resolvedServerConfig.resources.length === 0) {
        return [];
      }

      const allowedResources = new Set(resolvedServerConfig.resources);
      return resourceTemplates.filter((resourceTemplate) => {
        if (typeof resourceTemplate.uriTemplate !== 'string') {
          return false;
        }

        return resourceTemplateMatchesSelection(resourceTemplate.uriTemplate, allowedResources);
      });
    }
  }

  return resourceTemplates;
}
