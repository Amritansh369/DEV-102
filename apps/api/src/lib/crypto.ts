import bcrypt from 'bcryptjs';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const BCRYPT_COST = 12;
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PW_SYMBOLS = '@#$%!';

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string): Promise<boolean> => bcrypt.compare(plain, hash);

/** A 10-character password with upper, lower, digit and symbol, using the CSPRNG. */
export function randomPassword(): string {
  const chars = Array.from({ length: 8 }, () => PW_ALPHABET[randomInt(PW_ALPHABET.length)]);
  chars.push(PW_SYMBOLS[randomInt(PW_SYMBOLS.length)] as string, String(randomInt(10)));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
  }
  return chars.join('');
}

export const randomOtp = (): string => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const randomToken = (bytes = 16): string => randomBytes(bytes).toString('hex');

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** OTPs are short, so they are hashed with a server-side pepper rather than bcrypt to stay fast. */
export const hashOtp = (code: string, subjectId: string, secret: string): string =>
  createHmac('sha256', secret).update(`${subjectId}:${code}`).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const hmac = (value: string, secret: string): string => createHmac('sha256', secret).update(value).digest('base64url');

const key = (secret: string) => createHash('sha256').update(`credential-cipher:${secret}`).digest();

export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(secret), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string, secret: string): string | null {
  try {
    const [iv, tag, data] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !data) return null;
    const decipher = createDecipheriv('aes-256-gcm', key(secret), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
