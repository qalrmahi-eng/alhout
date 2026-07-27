import 'server-only';

import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto';
import { cookies } from 'next/headers';

function deriveKey(
  password: string,
  salt: Buffer,
  length: number,
  options: { N: number; r: number; p: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, length, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}
export const SESSION_COOKIE = 'alhout_session';
const SESSION_DURATION_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  username: string;
  expiresAt: number;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) return null;
  return secret;
}

function sign(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function createSessionToken(username: string, now = Date.now()): string {
  const secret = getSessionSecret();
  if (!secret) throw new Error('SESSION_SECRET_MISSING');
  const payload: SessionPayload = {
    username,
    expiresAt: now + SESSION_DURATION_SECONDS * 1_000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifySessionToken(token?: string, now = Date.now()): SessionPayload | null {
  const secret = getSessionSecret();
  if (!secret || !token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;
  const expected = sign(encoded, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload;
    if (!payload.username || payload.expiresAt <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function getSession() {
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const cost = 16_384;
  const blockSize = 8;
  const parallelization = 1;
  const derived = await deriveKey(password, salt, 64, {
    N: cost,
    r: blockSize,
    p: parallelization,
  });
  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPassword(password: string, encodedHash?: string) {
  if (!encodedHash) return false;
  const [algorithm, costRaw, blockSizeRaw, parallelRaw, saltHex, expectedHex] =
    encodedHash.split('$');
  if (algorithm !== 'scrypt' || !saltHex || !expectedHex) return false;
  const cost = Number(costRaw);
  const blockSize = Number(blockSizeRaw);
  const parallelization = Number(parallelRaw);
  if (
    !Number.isInteger(cost) ||
    cost < 16_384 ||
    !Number.isInteger(blockSize) ||
    !Number.isInteger(parallelization)
  ) {
    return false;
  }
  try {
    const expected = Buffer.from(expectedHex, 'hex');
    const actual = await deriveKey(password, Buffer.from(saltHex, 'hex'), expected.length, {
      N: cost,
      r: blockSize,
      p: parallelization,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const sessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DURATION_SECONDS,
};
