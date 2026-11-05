import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';

const parameters = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => scrypt(password, salt, 64, parameters, (error, key) => error ? reject(error) : resolve(key)));
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt-v1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hex] = encoded.split('$');
  if (algorithm !== 'scrypt-v1' || !/^[a-f0-9]{32}$/.test(salt ?? '') || !/^[a-f0-9]{128}$/.test(hex ?? '')) return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(hex, 'hex'));
}
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
export const csrfFor = (token: string) => digest(`csrf:${token}`);
export const newToken = () => randomBytes(32).toString('hex');
// Equal-cost fallback prevents the missing-email path from skipping the password KDF.
export const dummyPasswordHash = 'scrypt-v1$' + '0'.repeat(32) + '$' + '0'.repeat(128);
