import crypto from 'crypto';

const getEncryptionKey = (): Buffer => {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY is not defined in environment variables.');
  }
  // Hash the key using sha256 to ensure we get exactly 32 bytes,
  // regardless of whether the key is a 64-hex character string or an arbitrary random password.
  return crypto.createHash('sha256').update(rawKey).digest();
};


/**
 * Encrypts clear text using AES-256-GCM.
 * Outputs string formatted as "iv:authTag:encryptedText" (hex encoded).
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12); // 12-byte IV for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted payload in "iv:authTag:encryptedText" format.
 */
export function decrypt(encryptedPayload: string): string {
  const key = getEncryptionKey();
  const parts = encryptedPayload.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format. Expected "iv:authTag:encryptedText".');
  }
  
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encryptedText = Buffer.from(parts[2], 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedText, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
