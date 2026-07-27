import { beforeEach, describe, expect, it } from 'vitest';
import { createSessionToken, hashPassword, verifyPassword, verifySessionToken } from '@/lib/auth';

describe('الحماية', () => {
  beforeEach(() => {
    Object.assign(process.env, { SESSION_SECRET: `test-${'x'.repeat(40)}` });
  });

  it('يوقع جلسة صالحة ويرفض العبث بها', () => {
    const token = createSessionToken('admin', 1_000);
    expect(verifySessionToken(token, 2_000)?.username).toBe('admin');
    expect(verifySessionToken(`${token}x`, 2_000)).toBeNull();
  });

  it('يرفض الجلسة المنتهية', () => {
    const token = createSessionToken('admin', 1_000);
    expect(verifySessionToken(token, 1_000 + 13 * 60 * 60 * 1_000)).toBeNull();
  });

  it('يخزن كلمة المرور كـscrypt ولا يقبل كلمة خاطئة', async () => {
    const hash = await hashPassword('a-very-strong-password');
    expect(hash).not.toContain('a-very-strong-password');
    expect(await verifyPassword('a-very-strong-password', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
