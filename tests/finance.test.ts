import { describe, expect, it } from 'vitest';
import {
  addInstallmentPeriod,
  buildSchedule,
  calculateContract,
  calculateProfit,
  splitInstallments,
  summarizeContract,
  validatePayment,
} from '@/lib/finance';
import type { Customer, Payment } from '@/types/domain';

const customer: Customer = {
  id: 1,
  name: 'عميل اختبار',
  phone: '000',
  principal: 1_000_000,
  profit_percent: 10,
  installments: 10,
  installment_type: 'monthly',
  first_due_date: '2026-01-31',
};

const payment = (amount: number, status: Payment['status'] = 'active'): Payment => ({
  id: Math.random(),
  customer_id: 1,
  amount,
  payment_date: '2026-01-01',
  status,
});

describe('الحساب المالي الصحيح بالدينار العراقي', () => {
  it('يحسب الربح الثابت مرة واحدة', () => {
    expect(calculateProfit(1_000_000, 10)).toBe(100_000);
  });

  it('يحسب إجمالي العقد', () => {
    expect(calculateContract(1_000_000, 10).contractTotal).toBe(1_100_000);
  });

  it('يقسم قيمة الأقساط', () => {
    expect(splitInstallments(1_100_000, 10)[0]).toBe(110_000);
  });

  it('يضع فرق التقريب في القسط الأخير', () => {
    expect(splitInstallments(100, 3)).toEqual([33, 33, 34]);
  });

  it('يدعم دفعة جزئية ولا يعد القسط مكتملاً', () => {
    const result = summarizeContract(customer, [payment(40_000)], '2025-12-01');
    expect(result.completedInstallments).toBe(0);
    expect(result.currentInstallmentPaid).toBe(40_000);
    expect(result.currentInstallmentRemaining).toBe(70_000);
  });

  it('يكمل القسط الجزئي ثم القسط التالي', () => {
    const result = summarizeContract(customer, [payment(40_000), payment(180_000)], '2025-12-01');
    expect(result.completedInstallments).toBe(2);
    expect(result.nextDueDate).toBe('2026-03-31');
  });

  it('يدعم دفع عدة أقساط معاً', () => {
    expect(summarizeContract(customer, [payment(330_000)], '2025-12-01').completedInstallments).toBe(3);
  });

  it('يوزع الدفع المقدم على الأقساط بالتسلسل', () => {
    const rows = buildSchedule({
      total: 500,
      count: 5,
      frequency: 'monthly',
      firstDueDate: '2026-06-01',
      paidAmount: 250,
      today: '2026-01-01',
    });
    expect(rows.map((row) => row.paid)).toEqual([100, 100, 50, 0, 0]);
  });

  it('يضيف سبعة أيام للموعد الأسبوعي', () => {
    expect(addInstallmentPeriod('2026-01-30', 1, 'weekly')).toBe('2026-02-06');
  });

  it('يحافظ على يوم الموعد الشهري حين يتوفر', () => {
    expect(addInstallmentPeriod('2026-01-15', 2, 'monthly')).toBe('2026-03-15');
  });

  it('يتعامل مع نهاية الشهر وفبراير', () => {
    expect(addInstallmentPeriod('2026-01-31', 1, 'monthly')).toBe('2026-02-28');
    expect(addInstallmentPeriod('2024-01-31', 1, 'monthly')).toBe('2024-02-29');
  });

  it('يحسب تاريخ نهاية العقد', () => {
    expect(summarizeContract(customer, [], '2025-01-01').expectedEndDate).toBe('2026-10-31');
  });

  it('يحدد المستحق اليوم', () => {
    expect(summarizeContract(customer, [], '2026-01-31').status).toBe('مستحق اليوم');
  });

  it('يحدد التأخير دون إضافة غرامة', () => {
    const result = summarizeContract(customer, [], '2026-02-01');
    expect(result.status).toBe('متأخر');
    expect(result.contractTotal).toBe(1_100_000);
  });

  it('يعد القسط الجزئي متأخراً بعد موعده', () => {
    const result = summarizeContract(customer, [payment(40_000)], '2026-02-01');
    expect(result.status).toBe('متأخر');
    expect(result.currentInstallmentRemaining).toBe(70_000);
  });

  it('يحدد اكتمال العقد', () => {
    expect(summarizeContract(customer, [payment(1_100_000)], '2026-01-01').status).toBe('مكتمل');
  });

  it('يرفض الدفعة الصفرية والسالبة', () => {
    expect(() => validatePayment(0, 100)).toThrow();
    expect(() => validatePayment(-1, 100)).toThrow();
  });

  it('يرفض الدفعة الأكبر من المتبقي', () => {
    expect(() => validatePayment(101, 100)).toThrow();
  });

  it('يتجاهل الدفعات الملغاة', () => {
    expect(summarizeContract(customer, [payment(110_000, 'cancelled')], '2025-01-01').paidAmount).toBe(0);
  });

  it('يعيد الحساب بعد إلغاء دفعة', () => {
    const before = summarizeContract(customer, [payment(110_000)], '2025-01-01');
    const after = summarizeContract(customer, [payment(110_000, 'cancelled')], '2025-01-01');
    expect(before.completedInstallments).toBe(1);
    expect(after.completedInstallments).toBe(0);
  });
});
