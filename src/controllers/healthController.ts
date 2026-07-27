import { Request, Response } from 'express';
import { isDatabaseModeEnabled } from '../config/dbEnv.js';
import { getDatabaseHealth } from '../db/connection.js';
import { getServerConnectionStats } from '../services/mcpService.js';
import { xiaozhiEndpointService } from '../services/xiaozhiEndpointService.js';

/**
 * Health check endpoint.
 * 200 when core is up (possibly degraded); 503 when unhealthy.
 * Includes Xiaozhi endpoint summary when the DB-backed subsystem is available.
 */
export const healthCheck = (_req: Request, res: Response): void => {
  try {
    const serverStats = getServerConnectionStats();
    const xiaozhi = xiaozhiEndpointService.getHealthSummary();

    if (isDatabaseModeEnabled()) {
      const databaseHealth = getDatabaseHealth();
      if (!databaseHealth.healthy) {
        res.status(503).json({
          status: 'unhealthy',
          message: databaseHealth.lastError || 'Database health check failed',
          servers: serverStats,
          xiaozhi,
          timestamp: new Date().toISOString(),
        });
        return;
      }
    }

    const xiaozhiDegraded =
      xiaozhi.available && xiaozhi.enabledTotal > 0 && xiaozhi.disconnected > 0;

    if (serverStats.disconnected === 0 && !xiaozhiDegraded) {
      res.status(200).json({
        status: 'healthy',
        message: 'All enabled MCP servers are ready',
        servers: serverStats,
        xiaozhi,
        timestamp: new Date().toISOString(),
      });
    } else {
      const parts: string[] = [];
      if (serverStats.disconnected > 0) {
        parts.push('Some enabled MCP servers are not ready');
      }
      if (xiaozhiDegraded) {
        parts.push(`Xiaozhi endpoints: ${xiaozhi.connected}/${xiaozhi.enabledTotal} connected`);
      }
      res.status(200).json({
        status: 'degraded',
        message: parts.join('; ') || 'Degraded',
        servers: serverStats,
        xiaozhi,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      message: 'Internal server error during health check',
      timestamp: new Date().toISOString(),
    });
  }
};
