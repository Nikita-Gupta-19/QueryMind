import Redis from 'ioredis';
import winston from 'winston';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [new winston.transports.Console()],
});

const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: null, // Essential for BullMQ compatibility
});

redis.on('connect', () => {
  logger.info('Successfully connected to Redis');
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

/**
 * Returns the Redis connection instance.
 * Useful for BullMQ or other modules requiring a raw connection.
 */
export function getRedisConnection(): Redis {
  return redis;
}

/**
 * Blacklists a JWT refresh token hash.
 * @param tokenHash The cryptographic hash of the refresh token.
 * @param ttlSeconds Token expiration duration remaining in seconds.
 */
export async function blacklistToken(tokenHash: string, ttlSeconds: number): Promise<void> {
  if (ttlSeconds <= 0) return;
  // Store it with prefix 'blacklist:' to avoid conflicts
  await redis.set(`blacklist:${tokenHash}`, 'true', 'EX', Math.ceil(ttlSeconds));
}

/**
 * Checks whether a token hash is present in the Redis blacklist.
 * @param tokenHash The cryptographic hash of the token.
 */
export async function isTokenBlacklisted(tokenHash: string): Promise<boolean> {
  const result = await redis.get(`blacklist:${tokenHash}`);
  return result === 'true';
}

/**
 * Cache a value with a TTL (seconds). Used for query result caching.
 */
export async function cacheSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  await redis.set(key, value, 'EX', ttlSeconds);
}

/**
 * Retrieve a cached value. Returns null if not found or expired.
 */
export async function cacheGet(key: string): Promise<string | null> {
  return redis.get(key);
}

export default redis;
