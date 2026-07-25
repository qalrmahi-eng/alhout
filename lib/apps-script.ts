import 'server-only';

import type { ApiResponse } from '@/types/domain';

export async function callAppsScript<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<{ response: ApiResponse<T>; status: number }> {
  const url = process.env.SHEETS_API_URL;
  const secret = process.env.SHEETS_API_SECRET;
  if (!url || !secret) {
    return {
      response: {
        ok: false,
        code: 'SERVICE_NOT_CONFIGURED',
        message: 'خدمة Google Sheets غير مهيأة بعد',
      },
      status: 503,
    };
  }

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, secret, data }),
      cache: 'no-store',
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    const text = await upstream.text();
    const parsed = JSON.parse(text) as ApiResponse<T> & { status?: number };
    const status = parsed.status && parsed.status >= 400 ? parsed.status : upstream.ok ? 200 : 502;
    return { response: parsed, status };
  } catch {
    return {
      response: {
        ok: false,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'تعذر الاتصال بخدمة البيانات. حاول مرة أخرى.',
      },
      status: 502,
    };
  }
}

