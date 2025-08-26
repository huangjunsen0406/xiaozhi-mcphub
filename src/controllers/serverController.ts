import { Request, Response } from 'express';
import { ApiResponse, AddServerRequest } from '../types/index.js';
import {
  getServersInfo,
  addServer,
  addOrUpdateServer,
  removeServer,
  notifyToolChanged,
  syncToolEmbedding,
  toggleServerStatus,
} from '../services/mcpService.js';
import { loadSettings, saveSettings } from '../config/index.js';
import { createSafeJSON } from '../utils/serialization.js';

export const getAllServers = (_: Request, res: Response): void => {
  try {
    const serversInfo = getServersInfo();
    const response: ApiResponse = {
      success: true,
      data: createSafeJSON(serversInfo),
    };
    res.json(response);
  } catch (error) {
    console.error('Failed to get servers information:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get servers information',
    });
  }
};

export const getAllSettings = (_: Request, res: Response): void => {
  try {
    const settings = loadSettings();
    const response: ApiResponse = {
      success: true,
      data: createSafeJSON(settings),
    };
    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get server settings',
    });
  }
};

export const createServer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, config } = req.body as AddServerRequest;
    if (!name || typeof name !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Server name is required',
      });
      return;
    }

    if (!config || typeof config !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Server configuration is required',
      });
      return;
    }

    if (
      !config.url &&
      !config.openapi?.url &&
      !config.openapi?.schema &&
      (!config.command || !config.args)
    ) {
      res.status(400).json({
        success: false,
        message:
          'Server configuration must include either a URL, OpenAPI specification URL or schema, or command with arguments',
      });
      return;
    }

    // Validate the server type if specified
    if (config.type && !['stdio', 'sse', 'streamable-http', 'openapi'].includes(config.type)) {
      res.status(400).json({
        success: false,
        message: 'Server type must be one of: stdio, sse, streamable-http, openapi',
      });
      return;
    }

    // Validate that URL is provided for sse and streamable-http types
    if ((config.type === 'sse' || config.type === 'streamable-http') && !config.url) {
      res.status(400).json({
        success: false,
        message: `URL is required for ${config.type} server type`,
      });
      return;
    }

    // Validate that OpenAPI specification URL or schema is provided for openapi type
    if (config.type === 'openapi' && !config.openapi?.url && !config.openapi?.schema) {
      res.status(400).json({
        success: false,
        message: 'OpenAPI specification URL or schema is required for openapi server type',
      });
      return;
    }

    // Validate headers if provided
    if (config.headers && typeof config.headers !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Headers must be an object',
      });
      return;
    }

    // Validate that headers are only used with sse, streamable-http, and openapi types
    if (config.headers && config.type === 'stdio') {
      res.status(400).json({
        success: false,
        message: 'Headers are not supported for stdio server type',
      });
      return;
    }

    // Set default keep-alive interval for SSE servers if not specified
    if ((config.type === 'sse' || (!config.type && config.url)) && !config.keepAliveInterval) {
      config.keepAliveInterval = 60000; // Default 60 seconds for SSE servers
    }

    // Set owner property - use current user's username, default to 'admin'
    if (!config.owner) {
      const currentUser = (req as any).user;
      config.owner = currentUser?.username || 'admin';
    }

    const result = await addServer(name, config);
    if (result.success) {
      notifyToolChanged();
      res.json({
        success: true,
        message: 'Server added successfully',
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Failed to add server',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const deleteServer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Server name is required',
      });
      return;
    }

    const result = removeServer(name);
    if (result.success) {
      notifyToolChanged();
      res.json({
        success: true,
        message: 'Server removed successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message || 'Server not found or failed to remove',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const updateServer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const { config } = req.body;
    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Server name is required',
      });
      return;
    }

    if (!config || typeof config !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Server configuration is required',
      });
      return;
    }

    if (
      !config.url &&
      !config.openapi?.url &&
      !config.openapi?.schema &&
      (!config.command || !config.args)
    ) {
      res.status(400).json({
        success: false,
        message:
          'Server configuration must include either a URL, OpenAPI specification URL or schema, or command with arguments',
      });
      return;
    }

    // Validate the server type if specified
    if (config.type && !['stdio', 'sse', 'streamable-http', 'openapi'].includes(config.type)) {
      res.status(400).json({
        success: false,
        message: 'Server type must be one of: stdio, sse, streamable-http, openapi',
      });
      return;
    }

    // Validate that URL is provided for sse and streamable-http types
    if ((config.type === 'sse' || config.type === 'streamable-http') && !config.url) {
      res.status(400).json({
        success: false,
        message: `URL is required for ${config.type} server type`,
      });
      return;
    }

    // Validate that OpenAPI specification URL or schema is provided for openapi type
    if (config.type === 'openapi' && !config.openapi?.url && !config.openapi?.schema) {
      res.status(400).json({
        success: false,
        message: 'OpenAPI specification URL or schema is required for openapi server type',
      });
      return;
    }

    // Validate headers if provided
    if (config.headers && typeof config.headers !== 'object') {
      res.status(400).json({
        success: false,
        message: 'Headers must be an object',
      });
      return;
    }

    // Validate that headers are only used with sse, streamable-http, and openapi types
    if (config.headers && config.type === 'stdio') {
      res.status(400).json({
        success: false,
        message: 'Headers are not supported for stdio server type',
      });
      return;
    }

    // Set default keep-alive interval for SSE servers if not specified
    if ((config.type === 'sse' || (!config.type && config.url)) && !config.keepAliveInterval) {
      config.keepAliveInterval = 60000; // Default 60 seconds for SSE servers
    }

    // Set owner property if not provided - use current user's username, default to 'admin'
    if (!config.owner) {
      const currentUser = (req as any).user;
      config.owner = currentUser?.username || 'admin';
    }

    const result = await addOrUpdateServer(name, config, true); // Allow override for updates
    if (result.success) {
      notifyToolChanged(name);
      res.json({
        success: true,
        message: 'Server updated successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message || 'Server not found or failed to update',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const getServerConfig = (req: Request, res: Response): void => {
  try {
    const { name } = req.params;
    const settings = loadSettings();
    if (!settings.mcpServers || !settings.mcpServers[name]) {
      res.status(404).json({
        success: false,
        message: 'Server not found',
      });
      return;
    }

    const serverInfo = getServersInfo().find((s) => s.name === name);
    const serverConfig = settings.mcpServers[name];
    const response: ApiResponse = {
      success: true,
      data: {
        name,
        status: serverInfo ? serverInfo.status : 'disconnected',
        tools: serverInfo ? serverInfo.tools : [],
        config: serverConfig,
      },
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get server configuration',
    });
  }
};

export const toggleServer = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name } = req.params;
    const { enabled } = req.body;
    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Server name is required',
      });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'Enabled status must be a boolean',
      });
      return;
    }

    const result = await toggleServerStatus(name, enabled);
    if (result.success) {
      notifyToolChanged();
      res.json({
        success: true,
        message: result.message || `Server ${enabled ? 'enabled' : 'disabled'} successfully`,
      });
    } else {
      res.status(404).json({
        success: false,
        message: result.message || 'Server not found or failed to toggle status',
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Toggle tool status for a specific server
export const toggleTool = async (req: Request, res: Response): Promise<void> => {
  try {
    const { serverName, toolName } = req.params;
    const { enabled } = req.body;

    if (!serverName || !toolName) {
      res.status(400).json({
        success: false,
        message: 'Server name and tool name are required',
      });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'Enabled status must be a boolean',
      });
      return;
    }

    const settings = loadSettings();
    if (!settings.mcpServers[serverName]) {
      res.status(404).json({
        success: false,
        message: 'Server not found',
      });
      return;
    }

    // Initialize tools config if it doesn't exist
    if (!settings.mcpServers[serverName].tools) {
      settings.mcpServers[serverName].tools = {};
    }

    // Set the tool's enabled state
    settings.mcpServers[serverName].tools![toolName] = { enabled };

    if (!saveSettings(settings)) {
      res.status(500).json({
        success: false,
        message: 'Failed to save settings',
      });
      return;
    }

    // Notify that tools have changed
    notifyToolChanged();

    res.json({
      success: true,
      message: `Tool ${toolName} ${enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update tool description for a specific server
export const updateToolDescription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { serverName, toolName } = req.params;
    const { description } = req.body;

    if (!serverName || !toolName) {
      res.status(400).json({
        success: false,
        message: 'Server name and tool name are required',
      });
      return;
    }

    if (typeof description !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Description must be a string',
      });
      return;
    }

    const settings = loadSettings();
    if (!settings.mcpServers[serverName]) {
      res.status(404).json({
        success: false,
        message: 'Server not found',
      });
      return;
    }

    // Initialize tools config if it doesn't exist
    if (!settings.mcpServers[serverName].tools) {
      settings.mcpServers[serverName].tools = {};
    }

    // Set the tool's description
    if (!settings.mcpServers[serverName].tools![toolName]) {
      settings.mcpServers[serverName].tools![toolName] = { enabled: true };
    }

    settings.mcpServers[serverName].tools![toolName].description = description;

    if (!saveSettings(settings)) {
      res.status(500).json({
        success: false,
        message: 'Failed to save settings',
      });
      return;
    }

    // Notify that tools have changed
    notifyToolChanged();

    syncToolEmbedding(serverName, toolName);

    res.json({
      success: true,
      message: `Tool ${toolName} description updated successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

export const updateSystemConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { routing, install, smartRouting, mcpRouter } = req.body;

    if (
      (!routing ||
        (typeof routing.enableGlobalRoute !== 'boolean' &&
          typeof routing.enableGroupNameRoute !== 'boolean' &&
          typeof routing.enableBearerAuth !== 'boolean' &&
          typeof routing.bearerAuthKey !== 'string' &&
          typeof routing.skipAuth !== 'boolean')) &&
      (!install ||
        (typeof install.pythonIndexUrl !== 'string' &&
          typeof install.npmRegistry !== 'string' &&
          typeof install.baseUrl !== 'string')) &&
      (!smartRouting ||
        (typeof smartRouting.enabled !== 'boolean' &&
          typeof smartRouting.dbUrl !== 'string' &&
          typeof smartRouting.openaiApiBaseUrl !== 'string' &&
          typeof smartRouting.openaiApiKey !== 'string' &&
          typeof smartRouting.openaiApiEmbeddingModel !== 'string')) &&
      (!mcpRouter ||
        (typeof mcpRouter.apiKey !== 'string' &&
          typeof mcpRouter.referer !== 'string' &&
          typeof mcpRouter.title !== 'string' &&
          typeof mcpRouter.baseUrl !== 'string'))
    ) {
      res.status(400).json({
        success: false,
        message: 'Invalid system configuration provided',
      });
      return;
    }

    // Use the system config service to update configuration in database
    const { getSystemConfigService } = await import('../services/systemConfigService.js');
    const systemConfigService = getSystemConfigService();
    
    try {
      const updatedConfig = await systemConfigService.updateSystemConfig({
        routing,
        install,
        smartRouting,
        mcpRouter
      });

      res.json({
        success: true,
        data: updatedConfig,
        message: 'System configuration updated successfully'
      });
    } catch (error: any) {
      console.error('Failed to update system config:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update system configuration',
        error: error.message
      });
    }
  } catch (error) {
    console.error('Error in updateSystemConfig:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Add new endpoint to get system config from database
export const getSystemConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { getSystemConfigService } = await import('../services/systemConfigService.js');
    const systemConfigService = getSystemConfigService();
    
    const config = await systemConfigService.getSystemConfig();
    
    if (!config) {
      res.status(404).json({
        success: false,
        message: 'System configuration not found'
      });
      return;
    }

    res.json({
      success: true,
      data: config
    });
  } catch (error) {
    console.error('Error getting system config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system configuration'
    });
  }
};


// Toggle prompt status for a specific server
export const togglePrompt = async (req: Request, res: Response): Promise<void> => {
  try {
    const { serverName, promptName } = req.params;
    const { enabled } = req.body;

    if (!serverName || !promptName) {
      res.status(400).json({
        success: false,
        message: 'Server name and prompt name are required',
      });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        message: 'Enabled status must be a boolean',
      });
      return;
    }

    const settings = loadSettings();
    if (!settings.mcpServers[serverName]) {
      res.status(404).json({
        success: false,
        message: 'Server not found',
      });
      return;
    }

    // Initialize prompts config if it doesn't exist
    if (!settings.mcpServers[serverName].prompts) {
      settings.mcpServers[serverName].prompts = {};
    }

    // Set the prompt's enabled state
    settings.mcpServers[serverName].prompts![promptName] = { enabled };

    if (!saveSettings(settings)) {
      res.status(500).json({
        success: false,
        message: 'Failed to save settings',
      });
      return;
    }

    // Notify that tools have changed (as prompts are part of the tool listing)
    notifyToolChanged();

    res.json({
      success: true,
      message: `Prompt ${promptName} ${enabled ? 'enabled' : 'disabled'} successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Update prompt description for a specific server
export const updatePromptDescription = async (req: Request, res: Response): Promise<void> => {
  try {
    const { serverName, promptName } = req.params;
    const { description } = req.body;

    if (!serverName || !promptName) {
      res.status(400).json({
        success: false,
        message: 'Server name and prompt name are required',
      });
      return;
    }

    if (typeof description !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Description must be a string',
      });
      return;
    }

    const settings = loadSettings();
    if (!settings.mcpServers[serverName]) {
      res.status(404).json({
        success: false,
        message: 'Server not found',
      });
      return;
    }

    // Initialize prompts config if it doesn't exist
    if (!settings.mcpServers[serverName].prompts) {
      settings.mcpServers[serverName].prompts = {};
    }

    // Set the prompt's description
    if (!settings.mcpServers[serverName].prompts![promptName]) {
      settings.mcpServers[serverName].prompts![promptName] = { enabled: true };
    }

    settings.mcpServers[serverName].prompts![promptName].description = description;

    if (!saveSettings(settings)) {
      res.status(500).json({
        success: false,
        message: 'Failed to save settings',
      });
      return;
    }

    // Notify that tools have changed (as prompts are part of the tool listing)
    notifyToolChanged();

    res.json({
      success: true,
      message: `Prompt ${promptName} description updated successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
