// filepath: /Users/sunmeng/code/github/mcphub/src/controllers/logController.ts
import { Request, Response } from 'express';
import logService from '../services/logService.js';

type AuthUser = { username?: string; isAdmin?: boolean };

const requireAdmin = (req: Request, res: Response): boolean => {
  const user = ((req as any).user || {}) as AuthUser;
  if (user.isAdmin) {
    return true;
  }
  res.status(403).json({ success: false, error: 'Admin privileges required' });
  return false;
};

// Get all logs — system-wide, admin only
export const getAllLogs = (req: Request, res: Response): void => {
  try {
    if (!requireAdmin(req, res)) return;

    const logs = logService.getLogs();
    res.json({ success: true, data: logs });
  } catch (error) {
    console.error('Error getting logs:', error);
    res.status(500).json({ success: false, error: 'Error getting logs' });
  }
};

// Clear all logs — admin only
export const clearLogs = (req: Request, res: Response): void => {
  try {
    if (!requireAdmin(req, res)) return;

    logService.clearLogs();
    res.json({ success: true, message: 'Logs cleared successfully' });
  } catch (error) {
    console.error('Error clearing logs:', error);
    res.status(500).json({ success: false, error: 'Error clearing logs' });
  }
};

// Stream logs via SSE — admin only
export const streamLogs = (req: Request, res: Response): void => {
  try {
    if (!requireAdmin(req, res)) return;

    // Set headers for SSE
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send initial data
    const logs = logService.getLogs();
    res.write(`data: ${JSON.stringify({ type: 'initial', logs })}\n\n`);

    // Subscribe to log and auxiliary stream events
    const unsubscribe = logService.subscribeToStream((event) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });

    // Handle client disconnect
    req.on('close', () => {
      unsubscribe();
      console.log('Client disconnected from log stream');
    });
  } catch (error) {
    console.error('Error streaming logs:', error);
    res.status(500).json({ success: false, error: 'Error streaming logs' });
  }
};
