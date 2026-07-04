import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

if (!ENCRYPTION_KEY || Buffer.from(ENCRYPTION_KEY, 'hex').length !== 32) {
  console.warn('WARNING: ENCRYPTION_KEY is missing or invalid. It must be a 32-byte hex string. Encrypt/decrypt will fail.');
}

/**
 * Encrypts a string using AES-256-GCM.
 * Returns the encrypted string formatted as "iv:encryptedData:authTag".
 */
export function encryptString(text: string): string {
  if (!ENCRYPTION_KEY) throw new Error('Encryption key not configured.');
  
  const iv = crypto.randomBytes(12); // GCM standard IV size
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${encrypted}:${authTag}`;
}

/**
 * Decrypts a string previously encrypted with encryptString.
 */
export function decryptString(encryptedText: string): string {
  if (!ENCRYPTION_KEY) throw new Error('Encryption key not configured.');
  if (!encryptedText) return '';

  const parts = encryptedText.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted string format');

  const [ivHex, encryptedData, authTagHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = Buffer.from(ENCRYPTION_KEY, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
