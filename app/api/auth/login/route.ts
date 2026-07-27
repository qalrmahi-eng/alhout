import { cookies, headers } from 'next/headers';
import { NextResponse } from 'next/server';
import {
  createSessionToken,
  SESSION_COOKIE,
  sessionCookieOptions,
  verifyPassword,
} from '@/lib/auth';
import { clearLoginAttempts, consumeLoginAttempt } from '@/lib/rate-limit';

export async function POST(request: Request) {
  const headerStore = await headers();
  const ip = headerStore.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const rate = consumeLoginAttempt(ip);
  if (!rate.allowed) {
    return NextResponse.json(
      { ok: false, message: 'محاولات كثيرة. حاول لاحقاً.' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  let credentials: { username?: string; password?: string };
  try {
    credentials = (await request.json()) as typeof credentials;
  } catch {
    return NextResponse.json({ ok: false, message: 'طلب غير صالح' }, { status: 400 });
  }

  const configuredUsername = process.env.ADMIN_USERNAME;
  const valid =
    configuredUsername &&
    credentials.username === configuredUsername &&
    (await verifyPassword(credentials.password ?? '', process.env.ADMIN_PASSWORD_HASH));

  if (!valid) {
    return NextResponse.json(
      { ok: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' },
      { status: 401 },
    );
  }

  clearLoginAttempts(ip);
  let token: string;
  try {
    token = createSessionToken(configuredUsername);
  } catch {
    return NextResponse.json(
      { ok: false, message: 'إعدادات تسجيل الدخول غير مكتملة' },
      { status: 503 },
    );
  }
  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions);
  return NextResponse.json({ ok: true });
}
