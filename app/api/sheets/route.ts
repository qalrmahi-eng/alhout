import { getSession } from '@/lib/auth';
import { callAppsScript } from '@/lib/apps-script';

const ALLOWED_ACTIONS = new Set([
  'dashboard',
  'settings',
  'customers',
  'contracts',
  'payments',
  'reports_summary',
  'add_customer',
  'update_customer',
  'archive_customer',
  'restore_customer',
  'delete_customer_permanently',
  'add_contract',
  'update_contract',
  'archive_contract',
  'restore_contract',
  'add_payment',
  'cancel_payment',
  'update_settings',
]);

export async function GET() {
  return Response.json(
    { ok: false, message: 'استخدم POST لحماية بيانات الطلب' },
    { status: 405, headers: { Allow: 'POST' } },
  );
}
export async function POST(request: Request) {
  if (!(await getSession())) {
    return Response.json({ ok: false, message: 'يلزم تسجيل الدخول' }, { status: 401 });
  }

  let body: { action?: string; data?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, message: 'صيغة الطلب غير صالحة' }, { status: 400 });
  }

  const action = body.action ?? '';
  if (!ALLOWED_ACTIONS.has(action)) {
    return Response.json({ ok: false, message: 'الإجراء غير مسموح' }, { status: 400 });
  }

  const result = await callAppsScript(action, body.data ?? {});
  return Response.json(result.response, {
    status: result.status,
    headers: { 'Cache-Control': 'no-store, private' },
  });
}
