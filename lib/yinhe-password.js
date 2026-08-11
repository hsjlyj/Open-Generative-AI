import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);

export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('密码长度须为 8–128 个字符。');
  const salt = randomBytes(16).toString('base64url');
  const derived = await scrypt(password, salt, 64);
  return `${salt}.${Buffer.from(derived).toString('base64url')}`;
}
export async function verifyPassword(password, stored) {
  const [salt, hash, ...extra] = typeof stored === 'string' ? stored.split('.') : [];
  if (extra.length || !salt || !hash || typeof password !== 'string') return false;
  const actual = Buffer.from(await scrypt(password, salt, 64)).toString('base64url');
  return actual.length === hash.length && timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}
