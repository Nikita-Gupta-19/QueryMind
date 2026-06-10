import { Request, Response, NextFunction } from 'express';
import passport from 'passport';
import crypto from 'crypto';
import { isTokenBlacklisted } from '../lib/redis';

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function authenticateJWT(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token missing or invalid' });
  }

  const token = authHeader.split(' ')[1];
  const tokenHash = hashToken(token);

  try {
    // Check if token is blacklisted in Redis
    const blacklisted = await isTokenBlacklisted(tokenHash);
    if (blacklisted) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }

    // Authenticate using Passport JWT Strategy
    passport.authenticate('jwt', { session: false }, (err: Error | null, user: any, info: any) => {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ error: info?.message || 'Unauthorized access' });
      }

      req.user = user;
      next();
    })(req, res, next);
  } catch (error) {
    return next(error);
  }
}
