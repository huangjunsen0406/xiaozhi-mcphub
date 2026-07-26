import { NextFunction, Request, Response } from 'express';
import { isDatabaseConnected } from '../db/connection.js';

/**
 * Guards routes whose backing store is database-only (e.g. Xiaozhi endpoints).
 * MCPHub can run in JSON-file mode when DB_URL is unset, where these repositories
 * are unavailable and would otherwise throw a 500 from deep inside TypeORM.
 */
export const requireDatabase = (_req: Request, res: Response, next: NextFunction): void => {
  if (!isDatabaseConnected()) {
    res.status(503).json({
      success: false,
      message: '该功能需要启用数据库，请配置 DB_URL 环境变量',
    });
    return;
  }
  next();
};

export default requireDatabase;
