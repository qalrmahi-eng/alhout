import { describe, expect, it } from 'vitest';
import { buildContractFormPayload } from '@/lib/contract-form';
import { formatBaghdadDateTime, normalizeSheetDate, normalizeSheetDateTime } from '@/lib/dates';

function contractForm(deliveryDate: string, firstDueDate: string): FormData {
  const form = new FormData();
  form.set('customer_id', '15');
  form.set('principal', '5000000');
  form.set('profit_percent', '20');
  form.set('installments', '10');
  form.set('delivery_date', deliveryDate);
  form.set('first_due_date', firstDueDate);
  return form;
}

describe('تواريخ العقود', () => {
  it('يطبع قيم Google Sheets إلى تاريخ بغداد دون انزياح UTC', () => {
    expect(normalizeSheetDate('2026-07-27')).toBe('2026-07-27');
    expect(normalizeSheetDate('2026-07-26T21:00:00.000Z')).toBe('2026-07-27');
    expect(normalizeSheetDate(new Date('2026-07-26T21:00:00.000Z'))).toBe('2026-07-27');
    expect(normalizeSheetDate(46_230)).toBe('2026-07-27');
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
