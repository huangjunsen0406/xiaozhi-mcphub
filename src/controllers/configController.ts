import { Request, Response } from 'express';
import config from '../config/index.js';
import { getDataService } from '../services/services.js';
import { DataService } from '../services/dataService.js';
import { IUser } from '../types/index.js';

const dataService: DataService = getDataService();

/**
 * Get runtime configuration for frontend
 */
export const getRuntimeConfig = (req: Request, res: Response): void => {
  try {
    const runtimeConfig = {
      basePath: config.basePath,
      version: config.mcpHubVersion,
      name: config.mcpHubName,
    };

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true,
      data: runtimeConfig,
    });
  } catch (error) {
    console.error('Error getting runtime config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get runtime configuration',
    });
  }
};

/**
 * Get public system configuration (only skipAuth setting)
 * This endpoint doesn't require authentication to allow checking if auth should be skipped
 */
export const getPublicConfig = async (_req: Request, res: Response): Promise<void> => {
  try {
    // Get config from database only
    const { getSystemConfigService } = await import('../services/systemConfigService.js');
    const systemConfigService = getSystemConfigService();
    const publicConfig = await systemConfigService.getPublicConfig();
    
    let permissions = {};
    if (publicConfig.skipAuth) {
      const user: IUser = {
        username: 'guest',
        password: '',
        isAdmin: true,
      };
      permissions = dataService.getPermissions(user);
    }

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    res.json({
      success: true,
      data: {
        skipAuth: publicConfig.skipAuth,
        permissions,
      },
    });
  } catch (error) {
    console.error('Error getting public config from database:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get public configuration',
    });
  }
};
