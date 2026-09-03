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
  it('يمرر إنشاء العقد ومعرف العميل إلى Apps Script', async () => {
    const data = {
      customer_id: 15,
      principal: 5_000_000,
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
    };
    const response = await POST(
      new Request('http://localhost/api/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_contract', data }),
      }),
    );

    expect(response.status).toBe(200);
    expect(callAppsScript).toHaveBeenCalledWith('add_contract', data);
    expect(callAppsScript).toHaveBeenCalledTimes(1);
  });
});
