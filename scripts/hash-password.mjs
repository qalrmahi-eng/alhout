import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { promisify } from 'node:util';

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error('استخدم كلمة مرور لا تقل عن 12 حرفاً: node scripts/hash-password.mjs "..."');
  process.exit(1);
}
const scrypt = promisify(scryptCallback);
const salt = randomBytes(16);
const cost = 16_384;
const blockSize = 8;
const parallelization = 1;
const derived = await scrypt(password, salt, 64, {
  N: cost,
  r: blockSize,
  p: parallelization,
});
console.log(
  `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString('hex')}$${derived.toString('hex')}`,
);

