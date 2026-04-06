import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  console.error('[Error]', err.message, err.stack);

  if (req.accepts('html') && !req.path.startsWith('/registry') && !req.path.startsWith('/schedule') && !req.path.startsWith('/pay')) {
    const htmlPath = path.join(__dirname, '..', 'views', 'error.html');
    try {
      res.status(500).send(fs.readFileSync(htmlPath, 'utf-8'));
      return;
    } catch {
      // fall through to JSON
    }
  }

  res.status(500).json({ error: 'internal_server_error', message: err.message });
}
