import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import passport from 'passport';
import rateLimit from 'express-rate-limit';
import prisma from '../../config/db';
import { blacklistToken, isTokenBlacklisted } from '../../lib/redis';
import { authenticateJWT, hashToken } from '../../middleware/auth.middleware';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'querymind_super_secret_jwt_sign_key_123';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'querymind_super_secret_jwt_refresh_sign_key_456';

// Expiry values
const ACCESS_TOKEN_EXPIRY = (process.env.JWT_ACCESS_TOKEN_EXPIRY || (process.env.NODE_ENV === 'development' ? '24h' : '15m')) as any;
const REFRESH_TOKEN_EXPIRY = '7d'; // 7 days

// Helper to generate tokens
function generateTokens(userId: string) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

// Helper to get remaining TTL in seconds from a JWT token
function getRemainingTTL(token: string, fallbackSec: number): number {
  try {
    const decoded = jwt.decode(token) as any;
    if (decoded && decoded.exp) {
      const remaining = decoded.exp - Math.floor(Date.now() / 1000);
      return remaining > 0 ? remaining : 0;
    }
  } catch (err) {
    // Ignore decode error
  }
  return fallbackSec;
}

// 1. Rate Limiting Middleware
const standardAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many authentication attempts. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const devAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { error: 'Too many developer bypass requests. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// 2. Local Registration
router.post('/register', standardAuthLimiter, async (req: Request, res: Response, next: NextFunction) => {
  const { email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'A user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || email.split('@')[0],
      },
    });

    const { accessToken, refreshToken } = generateTokens(user.id);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Store session
    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return res.status(201).json({
      message: 'User registered successfully',
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    return next(err);
  }
});

// 3. Local Login
router.post('/login', standardAuthLimiter, (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate('local', { session: false }, async (err: Error | null, user: any, info: any) => {
    if (err) {
      return next(err);
    }
    if (!user) {
      return res.status(401).json({ error: info?.message || 'Invalid email or password' });
    }

    try {
      const { accessToken, refreshToken } = generateTokens(user.id);
      const tokenHash = hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      // Store session
      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
        },
      });

      return res.json({
        accessToken,
        refreshToken,
        user: { id: user.id, email: user.email, name: user.name },
      });
    } catch (dbErr) {
      return next(dbErr);
    }
  })(req, res, next);
});

// 4. Developer Authentication Bypass
router.post('/dev-login', devAuthLimiter, async (req: Request, res: Response, next: NextFunction) => {
  const isDevBypassEnabled = process.env.DEV_AUTH_BYPASS === 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isDevBypassEnabled || isProduction) {
    return res.status(403).json({ error: 'Developer bypass authentication is disabled.' });
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    let user = await prisma.user.findUnique({ where: { email } });

    if (!user) {
      user = await prisma.user.create({
        data: {
          email,
          name: `Dev ${email.split('@')[0]}`,
        },
      });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return res.json({
      message: 'Bypassed login successfully in development mode',
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    return next(err);
  }
});

// 5. Token Refresh
router.post('/refresh', async (req: Request, res: Response) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  const tokenHash = hashToken(refreshToken);

  try {
    // Check if token is blacklisted in Redis
    const isBlacklisted = await isTokenBlacklisted(tokenHash);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Refresh token is revoked' });
    }

    // Check if session exists in Postgres
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Verify JWT payload
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as any;
    if (decoded.userId !== session.userId) {
      return res.status(401).json({ error: 'Token user mismatch' });
    }

    // Generate new access token
    const accessToken = jwt.sign({ userId: session.userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });

    return res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// 6. Logout
router.post('/logout', async (req: Request, res: Response, next: NextFunction) => {
  const { accessToken, refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required to log out' });
  }

  try {
    // Delete session from DB
    const refreshHash = hashToken(refreshToken);
    await prisma.session.deleteMany({ where: { tokenHash: refreshHash } });

    // Blacklist refresh token in Redis
    const refreshTTL = getRemainingTTL(refreshToken, 604800); // fallback to 7 days
    await blacklistToken(refreshHash, refreshTTL);

    // Blacklist access token in Redis if provided
    if (accessToken) {
      const accessHash = hashToken(accessToken);
      const accessTTL = getRemainingTTL(accessToken, 900); // fallback to 15 mins
      await blacklistToken(accessHash, accessTTL);
    }

    return res.json({ message: 'Logged out successfully' });
  } catch (err) {
    return next(err);
  }
});

// 7. Protected Current User Profile Route
router.get('/me', authenticateJWT, (req: Request, res: Response) => {
  return res.json({ user: req.user });
});

export default router;
