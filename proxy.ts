import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/manifest.webmanifest', '/sw.js'];

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

async function validSession(token?: string) {
  const secret = process.env.SESSION_SECRET;
  if (!token || !secret || secret.length < 32) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(signature),
      new TextEncoder().encode(payload),
    );
    if (!valid) return false;
    const decoded = JSON.parse(new TextDecoder().decode(decodeBase64Url(payload))) as {
      expiresAt?: number;
    };
    return Boolean(decoded.expiresAt && decoded.expiresAt > Date.now());
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (
    PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/')
  ) {
    return NextResponse.next();
  }
  const authenticated = await validSession(request.cookies.get('alhout_session')?.value);
  if (authenticated) {
    if (pathname === '/login') return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, message: 'يلزم تسجيل الدخول' }, { status: 401 });
  }
  const login = new URL('/login', request.url);
  login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!favicon.ico|robots.txt).*)'],
};

