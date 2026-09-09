import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

function getEncryptionKey() {
  const key = process.env['ENCRYPTION_KEY'];
  if (!key || key.length < 32) throw new Error('Configure ENCRYPTION_KEY no servidor com pelo menos 32 caracteres.');
  return createHash('sha256').update(key).digest();
}
export function encrypt(text: string): string {
  if (!text) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('hex'), cipher.getAuthTag().toString('hex'), data.toString('hex')].join(':');
}
export function decrypt(value: string): string {
  if (!value) return '';
  const parts = value.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1' || !/^[a-f0-9]{24}$/.test(parts[1]!) || !/^[a-f0-9]{32}$/.test(parts[2]!) || !/^(?:[a-f0-9]{2})+$/.test(parts[3]!)) {
    throw new Error('Configuração criptografada inválida. Cadastre novamente a integração neste servidor.');
  }
  const decipher = createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(parts[1]!, 'hex'));
  decipher.setAuthTag(Buffer.from(parts[2]!, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(parts[3]!, 'hex')), decipher.final()]).toString('utf8');
}

/**
 * Generates a secure random secret for callback verification.
 */
export function generateCallbackSecret(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hashes a secret for secure storage.
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Securely compares a secret with its stored hash.
 */
export function verifySecret(secret: string, hash: string): boolean {
  if (!secret || !hash) return false;
  const secretHash = hashSecret(secret);
  if (!/^[a-f0-9]{64}$/i.test(hash)) return false;
  return timingSafeEqual(Buffer.from(secretHash, 'hex'), Buffer.from(hash, 'hex'));
}

