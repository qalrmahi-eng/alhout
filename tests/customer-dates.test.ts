import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ContractFormDialog from '@/features/contracts/contract-form-dialog';
import { buildContractFormPayload } from '@/lib/contract-form';
import {
  formatBaghdadDateTime,
  formatDateForDisplay,
  normalizeDateInput,
  normalizeSheetDate,
  normalizeSheetDateTime,
  parseDateOnly,
} from '@/lib/dates';

function contractForm(deliveryDate: string, firstDueDate: string): FormData {
  const form = new FormData();
  form.set('customer_id', '15');
  form.set('principal', '5000000');
  form.set('profit_percent', '20');
  form.set('installments', '10');
  form.set('delivery_date', deliveryDate);
  form.set('first_due_date', firstDueDate);
  form.set('expected_end_date', '2027-05-10');
  return form;
}

describe('تواريخ العقود', () => {
  it('يطبع قيم Google Sheets إلى تاريخ بغداد دون انزياح UTC', () => {
    expect(normalizeSheetDate('2026-07-27')).toBe('2026-07-27');
    expect(normalizeSheetDate('2026-07-26T21:00:00.000Z')).toBe('2026-07-26');
    expect(normalizeSheetDate(new Date('2026-07-26T21:00:00.000Z'))).toBe('2026-07-26');
    expect(normalizeSheetDate(46_230)).toBe('2026-07-27');
  });

  it('يفصل اليوم والشهر صراحة في التواريخ الملتبسة', () => {
    expect(normalizeDateInput('04/09/2026')).toBe('2026-09-04');
    expect(normalizeDateInput('09/04/2026')).toBe('2026-04-09');
    expect(normalizeDateInput('06/10/2026')).toBe('2026-10-06');
    expect(normalizeDateInput('10/06/2026')).toBe('2026-06-10');
    expect(formatDateForDisplay('2026-10-06')).toBe('06/10/2026');
    expect(parseDateOnly('2026-10-06')).toEqual({ year: 2026, month: 10, day: 6 });
  });

  it('لا يسمح للمنطقة الزمنية بتغيير يوم التاريخ المخزن', () => {
    expect(normalizeDateInput('2026-10-06T23:30:00-10:00')).toBe('2026-10-06');
    expect(normalizeDateInput('2026-10-06T00:30:00+14:00')).toBe('2026-10-06');
  });

  it('تعرض معاينة العقد أول وآخر استحقاق بصيغة DD/MM/YYYY', () => {
    const contract = {
      id: 1, customer_id: 15, principal: 1_000_000, profit_percent: 20,
      profit_amount: 200_000, contract_total: 1_200_000, installments: 10,
      installment_value: 120_000, delivery_date: '2026-09-01',
      first_due_date: '2026-10-06', expected_end_date: '2027-07-06',
      paid_amount: 0, remaining_amount: 1_200_000, current_installment_paid: 0,
      current_installment_remaining: 120_000, next_due_date: '2026-10-06',
      status: 'منتظم' as const,
    };
    const html = renderToStaticMarkup(createElement(ContractFormDialog, {
      value: { contract },
      customers: [{ id: 15, name: 'أحمد', phone: '07700000000' }],
      defaults: { system_name: 'الحوت', capital: 0, default_profit_percent: 20 },
      today: '2026-10-06',
      onClose: () => undefined,
      onSaved: () => undefined,
    }));
    expect(html).toContain('أول استحقاق');
    expect(html).toContain('06/10/2026');
    expect(html).toContain('آخر استحقاق متوقع');
    expect(html).toContain('06/07/2027');
  });

  it('يرفض القيم غير الصالحة ولا ينتج Invalid Date', () => {
    for (const value of [null, '', 'not-a-date', '2026-02-30', 20_260_727]) {
      expect(normalizeSheetDate(value)).toBe('');
    }
  });

  it('يحافظ على الطابع الزمني ويعرضه بتوقيت بغداد', () => {
    expect(normalizeSheetDateTime('2026-07-27T15:45:00')).toBe('2026-07-27T15:45:00+03:00');
    expect(formatBaghdadDateTime('2026-07-27T12:45:00.000Z')).toBe('27/07/2026 — 3:45 م');
  });

  it('يبني عقداً بتواريخ منفصلة ويرفض التاريخ المستحيل', () => {
    expect(buildContractFormPayload(contractForm('2026-07-27', '2026-08-10'))).toMatchObject({
      customer_id: 15,
      delivery_date: '2026-07-27',
      first_due_date: '2026-08-10',
    });
    expect(() => buildContractFormPayload(contractForm('2026-02-30', '2026-08-10'))).toThrow(/تاريخ تسليم المبلغ غير صالح/);
  });
});
