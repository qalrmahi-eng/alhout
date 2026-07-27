import { beforeEach, describe, expect, it, vi } from 'vitest';

const { callAppsScript, getSession } = vi.hoisted(() => ({
  callAppsScript: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getSession }));
vi.mock('@/lib/apps-script', () => ({ callAppsScript }));

import { POST } from '@/app/api/sheets/route';

beforeEach(() => {
  vi.clearAllMocks();
  getSession.mockResolvedValue({ username: 'test' });
  callAppsScript.mockResolvedValue({
    status: 200,
    response: { ok: true, data: { id: 1 } },
  });
});

describe('/api/sheets', () => {
  it('يمرر تاريخ التسليم وأول استحقاق منفصلين إلى Apps Script', async () => {
    const data = {
      name: 'عميل اختبار',
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
    };
    const response = await POST(
      new Request('http://localhost/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_customer', data }),
      }),
    );

    expect(response.status).toBe(200);
    expect(callAppsScript).toHaveBeenCalledWith('add_customer', data);
    expect(callAppsScript).toHaveBeenCalledTimes(1);
  });
});
