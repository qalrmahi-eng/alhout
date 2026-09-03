import { describe, expect, it } from 'vitest';
import { buildReminders } from '@/lib/reminders';
import { reportPresetRange } from '@/lib/reports';
import { buildWhatsAppMessage, buildWhatsAppUrl, normalizeIraqiPhone } from '@/lib/whatsapp';
import type { Contract, Customer } from '@/types/domain';

const customer: Customer = {
  id: 1,
  name: 'أحمد',
  phone: '0770 123-4567',
};

function contract(id: number, nextDueDate: string): Contract {
  return {
    id,
    customer_id: 1,
    principal: 1_000_000,
    profit_percent: 20,
    profit_amount: 200_000,
    contract_total: 1_200_000,
    installments: 8,
    installment_value: 150_000,
    delivery_date: '2026-08-01',
    first_due_date: nextDueDate,
    expected_end_date: '2027-03-01',
    paid_amount: 750_000,
    remaining_amount: 450_000,
    current_installment_paid: 0,
    current_installment_remaining: 150_000,
    next_due_date: nextDueDate,
    status: 'منتظم',
  };
}

describe('WhatsApp العراقي', () => {
  it('يطبع الصيغ المحلية والدولية إلى رقم wa.me واحد', () => {
    expect(normalizeIraqiPhone('07701234567')).toBe('9647701234567');
    expect(normalizeIraqiPhone('+9647701234567')).toBe('9647701234567');
    expect(normalizeIraqiPhone('00964 (770) 123-4567')).toBe('9647701234567');
    expect(normalizeIraqiPhone('7701234567')).toBe('9647701234567');
    expect(normalizeIraqiPhone('123')).toBeNull();
  });

  it('ينشئ رسالة ديناميكية كاملة بلا العبارات الممنوعة', () => {
    const row = contract(10, '2026-09-11');
    const message = buildWhatsAppMessage(customer, row, '2026-09-04');
    expect(message).toContain('أحمد');
    expect(message).toContain('7 أيام');
    expect(message).toContain('150,000 د.ع');
    expect(message).toContain('11/09/2026');
    expect(message).toContain('450,000 د.ع');
    expect(message).toContain('300,000 د.ع');
    expect(message).not.toContain('حسب الاتفاق');
    expect(message).not.toContain('- الحوت');
    expect(buildWhatsAppUrl(customer, row, '2026-09-04')).toMatch(/^https:\/\/wa\.me\/9647701234567\?text=/);
  });
});

describe('مركز التذكيرات', () => {
  it('يصنف 7 و3 و1 و0 والمتأخر حسب next_due_date الحالي', () => {
    const dates = ['2026-09-11', '2026-09-07', '2026-09-05', '2026-09-04', '2026-08-31'];
    const rows = buildReminders([customer], dates.map((date, index) => contract(index + 1, date)), '2026-09-04');
    expect(rows.map((row) => [row.contract.id, row.category])).toEqual([
      [5, 'overdue'], [4, 'today'], [3, 'tomorrow'], [2, 'after_3'], [1, 'after_7'],
    ]);
  });

  it('لا يبقي تذكير القسط القديم بعد انتقال الاستحقاق بدفعة مقدمة', () => {
    const before = buildReminders([customer], [contract(1, '2026-09-11')], '2026-09-04');
    const after = buildReminders([customer], [contract(1, '2026-10-11')], '2026-09-04');
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(0);
  });
});

describe('فترات التقارير', () => {
  it('يضبط الشهر الحالي والسابق والسنة الحالية', () => {
    expect(reportPresetRange('current_month', '2026-09-04')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(reportPresetRange('previous_month', '2026-09-04')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(reportPresetRange('current_year', '2026-09-04')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});
