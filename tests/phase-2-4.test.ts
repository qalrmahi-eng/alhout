import { describe, expect, it } from 'vitest';
import { buildDashboardReminderGroups, buildDismissedReminders, buildReminders, buildRemindersForDate, reminderBadgeCount } from '@/lib/reminders';
import { addCalendarMonth, effectiveDueDate, expectedPaymentAmount } from '@/lib/due-date';
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

  it('لا يقترح للزبون مبلغاً أكبر من المتبقي', () => {
    const row = contract(2, '2026-09-11');
    row.installment_value = 390_000;
    row.current_installment_paid = 300_000;
    row.current_installment_remaining = 90_000;
    row.remaining_amount = 1_000_000;
    expect(expectedPaymentAmount(row)).toBe(90_000);
    row.remaining_amount = 80_000;
    expect(expectedPaymentAmount(row)).toBe(80_000);
    row.reminder_mode = 'manual';
    expect(expectedPaymentAmount(row)).toBe(80_000);
  });

  it('ينشئ رسالة ديناميكية كاملة بلا العبارات الممنوعة', () => {
    const row = contract(10, '2026-09-11');
    const message = buildWhatsAppMessage(customer, row, '2026-09-04');
    expect(message).toContain('أحمد');
    expect(message).toContain('7 أيام');
    expect(message).toContain('150,000 د.ع');
    expect(message).toContain('11/09/2026');
    expect(message).toContain('450,000 د.ع');
    expect(message).toContain('إجمالي المبلغ المتبقي حالياً');
    expect(message).not.toContain('حسب الاتفاق');
    expect(message).not.toContain('- الحوت');
    expect(buildWhatsAppUrl(customer, row, '2026-09-04')).toMatch(/^https:\/\/wa\.me\/9647701234567\?text=/);
  });
});

describe('مركز التذكيرات', () => {
  it('يعرض غداً واليوم والمتأخر فقط تلقائياً', () => {
    const dates = ['2026-09-11', '2026-09-07', '2026-09-05', '2026-09-04', '2026-08-31'];
    const rows = buildReminders([customer], dates.map((date, index) => contract(index + 1, date)), '2026-09-04');
    expect(rows.map((row) => [row.contract.id, row.category])).toEqual([
      [5, 'overdue'], [4, 'today'], [3, 'tomorrow'],
    ]);
    expect(buildRemindersForDate([customer], [contract(6, '2026-09-07')], '2026-09-04', '2026-09-07')).toHaveLength(1);
    expect(buildRemindersForDate([customer], [contract(7, '2026-09-11')], '2026-09-04', '2026-09-11')).toHaveLength(1);
  });

  it('لا يبقي تذكير القسط القديم بعد انتقال الاستحقاق بدفعة مقدمة', () => {
    const before = buildReminders([customer], [contract(1, '2026-09-05')], '2026-09-04');
    const after = buildReminders([customer], [contract(1, '2026-10-11')], '2026-09-04');
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(0);
  });

  it('يستخدم الموعد اليدوي والفلترة حسب التاريخ ثم يعود للتلقائي عند مسحه', () => {
    const row = contract(8, '2026-10-11');
    row.manual_reminder_date = '2026-09-05';
    row.reminder_mode = 'automatic';
    expect(effectiveDueDate(row)).toBe('2026-10-11');
    row.reminder_mode = 'manual';
    row.manual_due_amount = 275_000;
    expect(effectiveDueDate(row)).toBe('2026-09-05');
    expect(expectedPaymentAmount(row)).toBe(275_000);
    expect(buildReminders([customer], [row], '2026-09-04')[0]).toMatchObject({ category: 'tomorrow', dueDate: '2026-09-05' });
    expect(buildRemindersForDate([customer], [row], '2026-09-04', '2026-09-05')).toHaveLength(1);
    expect(buildWhatsAppMessage(customer, row, '2026-09-04')).toContain('05/09/2026');
    row.reminder_mode = 'automatic';
    expect(effectiveDueDate(row)).toBe('2026-10-11');
    expect(buildRemindersForDate([customer], [row], '2026-09-04', '2026-09-05')).toHaveLength(0);
  });

  it('يستخدم Badge ومركز التذكير نفس البيانات عند نقل الموعد اليدوي', () => {
    const automatic = [contract(1, '2026-09-04'), contract(2, '2026-09-05')];
    const manual = contract(3, '2026-10-01');
    manual.reminder_mode = 'manual';
    manual.manual_reminder_date = '2026-09-05';
    const rows = [...automatic, manual];
    const dashboardInside = buildDashboardReminderGroups([customer], rows, '2026-09-04');
    expect(reminderBadgeCount([customer], rows, '2026-09-04')).toBe(3);
    expect(buildReminders([customer], rows, '2026-09-04')).toHaveLength(3);
    expect(dashboardInside.all).toHaveLength(3);
    expect(dashboardInside.today).toHaveLength(1);
    expect(dashboardInside.upcoming).toHaveLength(2);
    manual.manual_reminder_date = '2026-09-08';
    expect(reminderBadgeCount([customer], rows, '2026-09-04')).toBe(2);
    expect(buildReminders([customer], rows, '2026-09-04')).toHaveLength(2);
    expect(buildDashboardReminderGroups([customer], rows, '2026-09-04').all).toHaveLength(2);
    manual.manual_reminder_date = '2026-09-05';
    expect(reminderBadgeCount([customer], rows, '2026-09-04')).toBe(3);
    expect(buildReminders([customer], rows, '2026-09-04')).toHaveLength(3);
    expect(buildDashboardReminderGroups([customer], rows, '2026-09-04').all).toHaveLength(3);
  });

  it('يخفي نفس موعد التذكير فقط ويظهر الموعد الجديد', () => {
    const row = contract(12, '2026-09-04');
    row.dismissed_reminder_date = '2026-09-04';
    expect(buildReminders([customer], [row, row], '2026-09-04')).toHaveLength(0);
    expect(reminderBadgeCount([customer], [row], '2026-09-04')).toBe(0);
    expect(buildDismissedReminders([customer], [row], '2026-09-04')).toHaveLength(1);
    row.next_due_date = '2026-09-05';
    expect(buildReminders([customer], [row, row], '2026-09-04')).toHaveLength(1);
  });

  it('يستبعد العقد المؤرشف أو المحذوف من التذكيرات دون التأثير في العقد الآخر', () => {
    const archived = contract(21, '2026-09-04');
    const other = contract(22, '2026-09-05');
    const rows = [archived, other];
    expect(buildReminders([customer], rows, '2026-09-04')).toHaveLength(2);
    archived.archived = true;
    archived.status = 'مؤرشف';
    expect(buildReminders([customer], rows, '2026-09-04').map((item) => item.contract.id)).toEqual([other.id]);
    archived.archived = false;
    archived.status = 'منتظم';
    expect(buildReminders([customer], rows, '2026-09-04')).toHaveLength(2);
    other.status = 'مكتمل';
    expect(buildReminders([customer], rows, '2026-09-04').map((item) => item.contract.id)).toEqual([archived.id]);
    other.status = 'منتظم';
    expect(buildReminders([customer], rows.filter((row) => row.id !== archived.id), '2026-09-04').map((item) => item.contract.id)).toEqual([other.id]);
  });

  it('يستبعد العميل المؤرشف من التذكيرات ويعيده Restore دون التأثير في عميل آخر', () => {
    const archivedCustomer = { ...customer, archived: true };
    const otherCustomer: Customer = { id: 2, name: 'سارة', phone: '07700000002' };
    const archivedCustomerContract = contract(31, '2026-09-04');
    const otherContract = { ...contract(32, '2026-09-05'), customer_id: otherCustomer.id };

    expect(buildReminders(
      [archivedCustomer, otherCustomer],
      [archivedCustomerContract, otherContract],
      '2026-09-04',
    ).map((item) => item.contract.id)).toEqual([otherContract.id]);

    archivedCustomer.archived = false;
    expect(buildReminders(
      [archivedCustomer, otherCustomer],
      [archivedCustomerContract, otherContract],
      '2026-09-04',
    ).map((item) => item.contract.id)).toEqual([archivedCustomerContract.id, otherContract.id]);
  });

  it('يضبط المبلغ اليدوي على كامل المتبقي ولا يتجاوزه', () => {
    const row = contract(9, '2026-09-07');
    row.reminder_mode = 'manual';
    row.manual_reminder_date = '2026-09-07';
    row.manual_due_amount = row.remaining_amount;
    expect(expectedPaymentAmount(row)).toBe(450_000);
    row.remaining_amount = 200_000;
    expect(expectedPaymentAmount(row)).toBe(200_000);
  });

  it('يرحّل التاريخ شهراً تقويمياً واحداً مع ضبط نهاية الشهر', () => {
    expect(addCalendarMonth('2026-01-31')).toBe('2026-02-28');
    expect(addCalendarMonth('2024-01-31')).toBe('2024-02-29');
    expect(addCalendarMonth('2026-03-31')).toBe('2026-04-30');
    expect(addCalendarMonth('2026-12-15')).toBe('2027-01-15');
  });

  it('يحافظ على مرساة اليوم عبر فبراير عند الترحيل المتكرر', () => {
    const cases = [
      ['2026-01-31', 31, '2026-02-28', '2026-03-31'],
      ['2026-01-30', 30, '2026-02-28', '2026-03-30'],
      ['2026-01-29', 29, '2026-02-28', '2026-03-29'],
      ['2026-01-28', 28, '2026-02-28', '2026-03-28'],
      ['2024-01-31', 31, '2024-02-29', '2024-03-31'],
    ] as const;
    for (const [start, anchor, february, march] of cases) {
      const firstAdvance = addCalendarMonth(start, anchor);
      expect(firstAdvance).toBe(february);
      expect(addCalendarMonth(firstAdvance, anchor)).toBe(march);
    }
  });
});

describe('فترات التقارير', () => {
  it('يضبط الشهر الحالي والسابق والسنة الحالية', () => {
    expect(reportPresetRange('current_month', '2026-09-04')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(reportPresetRange('previous_month', '2026-09-04')).toEqual({ from: '2026-08-01', to: '2026-08-31' });
    expect(reportPresetRange('current_year', '2026-09-04')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
});
