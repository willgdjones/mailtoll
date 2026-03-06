import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err.message, err.stack);
  res.status(500).json({ error: 'internal_server_error', message: err.message });
}
