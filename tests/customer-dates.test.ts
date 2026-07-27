import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCustomerFormPayload,
  customerDeliveryInputValue,
  customerFirstDueInputValue,
} from '@/lib/customer-form';
import {
  formatBaghdadDateTime,
  normalizeSheetDate,
  normalizeSheetDateTime,
} from '@/lib/dates';
import { addCustomer, getCustomers } from '@/lib/sheets';

function customerForm(deliveryDate: string, firstDueDate: string): FormData {
  const form = new FormData();
  form.set('name', 'عميل اختبار');
  form.set('phone', '07700000000');
  form.set('principal', '1000000');
  form.set('profit_percent', '10');
  form.set('installments', '10');
  form.set('installment_type', 'monthly');
  form.set('delivery_date', deliveryDate);
  form.set('first_due_date', firstDueDate);
  return form;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('تواريخ العملاء', () => {
  it('يطبع قيم Google Sheets إلى تاريخ صالح لحقل HTML دون انزياح UTC', () => {
    expect(normalizeSheetDate('2026-07-27')).toBe('2026-07-27');
    expect(normalizeSheetDate('2026-07-26T21:00:00.000Z')).toBe('2026-07-27');
    expect(normalizeSheetDate('2026-07-27T00:00:00+03:00')).toBe('2026-07-27');
    expect(normalizeSheetDate('2026-07-27T08:30:00')).toBe('2026-07-27');
    expect(normalizeSheetDate(new Date('2026-07-26T21:00:00.000Z'))).toBe(
      '2026-07-27',
    );
    expect(normalizeSheetDate(46_230)).toBe('2026-07-27');
  });

  it('يعيد نصا فارغا للقيم الفارغة وغير الصالحة ولا ينتج Invalid Date', () => {
    for (const value of [
      null,
      undefined,
      '',
      'not-a-date',
      '2026-02-30',
      '2026-02-30T00:00:00.000Z',
      20_260_727,
    ]) {
      expect(normalizeSheetDate(value)).toBe('');
      expect(normalizeSheetDate(value)).not.toContain('Invalid Date');
    }
  });

  it('يحافظ على ISO داخلي مناسب ويعرض الطابع الزمني بتوقيت بغداد', () => {
    expect(normalizeSheetDateTime('2026-07-27T15:45:00')).toBe(
      '2026-07-27T15:45:00+03:00',
    );
    expect(formatBaghdadDateTime('2026-07-27T12:45:00.000Z')).toBe(
      '27/07/2026 — 3:45 م',
    );
    expect(formatBaghdadDateTime('invalid')).toBe('—');
  });

  it('يبني طلب العميل بتاريخ تسليم وتاريخ استحقاق منفصلين', () => {
    const payload = buildCustomerFormPayload(
      customerForm('2026-07-27', '2026-08-10'),
    );

    expect(payload).toMatchObject({
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
    });
    expect(payload).not.toHaveProperty('start_date');
  });

  it('يرسل طلب الإنشاء التاريخين المنفصلين إلى API دون اتصال حقيقي', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              id: 1,
              name: 'عميل اختبار',
              delivery_date: '2026-07-27',
              first_due_date: '2026-08-10',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const payload = buildCustomerFormPayload(
      customerForm('2026-07-27', '2026-08-10'),
    );

    await addCustomer(payload);

    expect(fetch).toHaveBeenCalledTimes(1);
    const request = JSON.parse(
      String(vi.mocked(fetch).mock.calls[0]?.[1]?.body),
    ) as { action: string; data: Record<string, unknown> };
    expect(request).toEqual({
      action: 'add_customer',
      data: expect.objectContaining({
        delivery_date: '2026-07-27',
        first_due_date: '2026-08-10',
      }),
    });
  });

  it('تعيد قراءة العميل تاريخ التسليم المحفوظ بصيغة يقبلها نموذج التعديل', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: [
              {
                id: 1,
                name: 'عميل اختبار',
                delivery_date: '2026-07-26T21:00:00.000Z',
                first_due_date: '2026-08-10',
                created_at: '2026-07-27T12:45:00.000Z',
                updated_at: '2026-07-28T13:30:00.000Z',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    const [customer] = await getCustomers();

    expect(customer).toMatchObject({
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
      created_at: '2026-07-27T12:45:00.000Z',
      updated_at: '2026-07-28T13:30:00.000Z',
    });
    expect(customerDeliveryInputValue(customer)).toBe('2026-07-27');
  });

  it('يعرض start_date كبديل للتسليم فقط ولا يخلطه مع أول استحقاق', () => {
    const oldCustomer = {
      id: 9,
      name: 'عميل قديم',
      phone: '07700000000',
      principal: 100,
      profit_percent: 10,
      installments: 2,
      start_date: '2026-07-01',
    };

    expect(customerDeliveryInputValue(oldCustomer)).toBe('2026-07-01');
    expect(customerFirstDueInputValue(oldCustomer)).toBe('');
  });

  it('يرفض تاريخ النموذج غير الصالح برسالة عربية واضحة', () => {
    expect(() =>
      buildCustomerFormPayload(customerForm('2026-02-30', '2026-08-10')),
    ).toThrowError(/تاريخ تسليم المبلغ غير صالح/);
  });
});
