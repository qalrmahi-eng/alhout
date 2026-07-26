import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  customerAvatar,
  customerMatchesSearch,
  getDashboard,
  getCustomers,
  getPayments,
  getSettings,
} from '@/lib/sheets';

function mockApiData(data: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, data }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('تطبيع استجابات Google Sheets', () => {
  it('يحوّل اسم العميل وهاتفه من أرقام إلى نصوص آمنة', async () => {
    mockApiData([
      {
        id: '9',
        name: 12345,
        phone: 7701234567,
        principal: '1000000',
        profit_percent: '10',
        installments: '10',
        archived: 'false',
        paid_amount: '25000',
        next_due_date: 20260801,
        updated_at: 20260727,
      },
    ]);

    const [customer] = await getCustomers();

    expect(customer).toMatchObject({
      id: 9,
      name: '12345',
      phone: '7701234567',
      principal: 1_000_000,
      profit_percent: 10,
      installments: 10,
      archived: false,
      paid_amount: 25_000,
      next_due_date: '20260801',
      updated_at: '20260727',
    });
    expect(() => customerAvatar(customer.name)).not.toThrow();
    expect(customerAvatar(customer.name)).toBe('1');
    expect(customerMatchesSearch(customer, '7701')).toBe(true);
  });

  it('يعرض الاسم البديل ويجعل الهاتف نصاً عند وصول null', async () => {
    mockApiData([{ id: 10, name: null, phone: null }]);

    const [customer] = await getCustomers();

    expect(customer.name).toBe('بدون اسم');
    expect(customer.phone).toBe('');
    expect(customerAvatar(customer.name)).toBe('ب');
    expect(() => customerMatchesSearch(customer, 'اسم')).not.toThrow();
  });

  it('يطبّع الإعدادات والأرقام ونوع الأقساط', async () => {
    mockApiData({
      id: '1',
      system_name: 2026,
      capital: 'not-a-number',
      default_profit_percent: '12.5',
      default_installment_type: 'أسبوعي',
      receipt_footer: null,
      updated_at: 20260727,
    });

    await expect(getSettings()).resolves.toMatchObject({
      id: 1,
      system_name: '2026',
      capital: 0,
      default_profit_percent: 12.5,
      default_installment_type: 'weekly',
      receipt_footer: '',
      updated_at: '20260727',
    });
  });

  it('يطبّع الدفعات والتواريخ والحالات القديمة', async () => {
    mockApiData([
      {
        id: '4',
        request_id: 88,
        receipt_number: null,
        customer_id: '9',
        amount: '25000',
        payment_date: 20260727,
        notes: null,
        status: 'ملغاة',
        cancellation_reason: 404,
        updated_at: 20260727,
      },
    ]);

    await expect(getPayments()).resolves.toEqual([
      expect.objectContaining({
        id: 4,
        request_id: '88',
        receipt_number: '',
        customer_id: 9,
        amount: 25_000,
        payment_date: '20260727',
        notes: '',
        status: 'cancelled',
        cancellation_reason: '404',
        updated_at: '20260727',
      }),
    ]);
  });

  it('لا تستخدم لوحة العملاء عمليات نصية مباشرة على بيانات غير موثوقة', () => {
    const dashboard = readFileSync('features/dashboard/dashboard-app.tsx', 'utf8');

    expect(dashboard).toContain('customerMatchesSearch(customer, normalized)');
    expect(dashboard).toContain('customerAvatar(customer.name)');
    expect(dashboard).not.toContain('customer.name.slice(');
    expect(dashboard).not.toContain('customer.name.toLowerCase(');
    expect(dashboard).not.toContain('customer.phone.toLowerCase(');
  });

  it('يطبّع أقسام dashboard الثلاثة من طلب واحد', async () => {
    mockApiData({
      settings: {
        id: '1',
        system_name: 2026,
        capital: '500000',
        default_profit_percent: '10',
      },
      customers: [{ id: '9', name: null, phone: 7701234567 }],
      payments: [{
        id: '4',
        customer_id: '9',
        amount: '25000',
        payment_date: 20260727,
      }],
    });

    await expect(getDashboard()).resolves.toMatchObject({
      settings: { id: 1, system_name: '2026', capital: 500_000 },
      customers: [{ id: 9, name: 'بدون اسم', phone: '7701234567' }],
      payments: [{ id: 4, customer_id: 9, amount: 25_000, payment_date: '20260727' }],
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body))).toMatchObject({
      action: 'dashboard',
      data: {},
    });
  });

  it('يستخدم التحميل المنطقي استجابة dashboard واحدة', () => {
    const dashboard = readFileSync('features/dashboard/dashboard-app.tsx', 'utf8');
    const loadFunction = dashboard.slice(
      dashboard.indexOf('async function load('),
      dashboard.indexOf('useEffect(() =>', dashboard.indexOf('async function load(')),
    );

    expect(loadFunction).toContain('await getDashboard()');
    expect(loadFunction).not.toContain('Promise.all');
    expect(loadFunction).not.toContain('getSettings(');
    expect(loadFunction).not.toContain('getCustomers(');
    expect(loadFunction).not.toContain('getPayments(');
  });
});
