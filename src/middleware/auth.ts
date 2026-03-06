import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

export interface AuthenticatedRequest extends Request {
  recipientId?: string;
  recipientEmail?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  // Check cookie first, then Authorization header
  const token = req.cookies?.session
    || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);

  if (!token) {
    res.status(401).json({ error: 'unauthorized', message: 'No session token' });
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string; email: string };
    req.recipientId = payload.sub;
    req.recipientEmail = payload.email;
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized', message: 'Invalid or expired token' });
  }
}
