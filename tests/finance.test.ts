import { describe, expect, it } from 'vitest';
import {
  addInstallmentPeriod,
  calculateContract,
  inclusiveMonthlyInstallments,
  indexPaymentsByContract,
  splitInstallments,
  summarizeContract,
  validatePayment,
} from '@/lib/finance';
import type { Contract, Payment } from '@/types/domain';

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 101,
    customer_id: 15,
    principal: 5_000_000,
    profit_percent: 20,
    profit_amount: 1_000_000,
    contract_total: 6_000_000,
    installments: 10,
    installment_value: 600_000,
    delivery_date: '2026-01-01',
    first_due_date: '2026-01-31',
    expected_end_date: '2026-10-31',
    paid_amount: 0,
    remaining_amount: 6_000_000,
    current_installment_paid: 0,
    current_installment_remaining: 600_000,
    next_due_date: '2026-01-31',
    status: 'منتظم',
    ...overrides,
  };
}

let paymentId = 0;
function payment(contractId: number, amount: number, status: Payment['status'] = 'active'): Payment {
  return {
    id: ++paymentId,
    customer_id: 15,
    contract_id: contractId,
    amount,
    payment_date: '2026-01-01',
    status,
  };
}

describe('محرك العقود المالي', () => {
  it('يحسب الربح والإجمالي ويضع فرق القسمة في القسط الأخير', () => {
    expect(calculateContract(5_000_000, 20)).toEqual({
      principal: 5_000_000,
      profitAmount: 1_000_000,
      contractTotal: 6_000_000,
    });
    expect(splitInstallments(100, 3)).toEqual([33, 33, 34]);
  });

  it('يحافظ على يوم الشهر الأصلي عبر فبراير', () => {
    expect(addInstallmentPeriod('2026-01-31', 1, 'monthly')).toBe('2026-02-28');
    expect(addInstallmentPeriod('2026-01-31', 2, 'monthly')).toBe('2026-03-31');
    expect(addInstallmentPeriod('2024-01-31', 1, 'monthly')).toBe('2024-02-29');
    expect(addInstallmentPeriod('2026-02-01', 9, 'monthly')).toBe('2026-11-01');
    expect(inclusiveMonthlyInstallments('2026-02-01', '2026-12-01')).toBe(11);
    expect(inclusiveMonthlyInstallments('2026-01-31', '2026-04-30')).toBe(4);
  });

  it('ينشئ عشرة أقساط من 06/10/2026 إلى 06/07/2027 دون قلب اليوم والشهر', () => {
    expect(Array.from({ length: 10 }, (_, index) => addInstallmentPeriod('2026-10-06', index, 'monthly'))).toEqual([
      '2026-10-06', '2026-11-06', '2026-12-06', '2027-01-06', '2027-02-06',
      '2027-03-06', '2027-04-06', '2027-05-06', '2027-06-06', '2027-07-06',
    ]);
  });

  it('ينفذ سيناريو الدفعة الكاملة ثم الجزئية ثم متعددة الأقساط وفق FIFO', () => {
    const value = contract();
    const rows = [payment(value.id, 600_000), payment(value.id, 300_000)];
    const partial = summarizeContract(value, rows, '2025-12-01');
    expect(partial.remaining).toBe(5_100_000);
    expect(partial.completedInstallments).toBe(1);
    expect(partial.currentInstallmentPaid).toBe(300_000);
    expect(partial.currentInstallmentRemaining).toBe(300_000);

    rows.push(payment(value.id, 900_000));
    const allocated = summarizeContract(value, rows, '2025-12-01');
    expect(allocated.remaining).toBe(4_200_000);
    expect(allocated.completedInstallments).toBe(3);
    expect(allocated.nextDueDate).toBe('2026-04-30');
  });

  it('يفصل دفعات عقدين للعميل نفسه ويعيد حساب العقد الملغاة دفعته وحده', () => {
    const first = contract();
    const second = contract({
      id: 155,
      principal: 3_000_000,
      profit_percent: 10,
      profit_amount: 300_000,
      contract_total: 3_300_000,
      installments: 6,
      installment_value: 550_000,
      remaining_amount: 3_300_000,
      current_installment_remaining: 550_000,
    });
    const rows = [payment(first.id, 600_000), payment(first.id, 300_000), payment(second.id, 550_000)];
    let index = indexPaymentsByContract(rows);
    expect(summarizeContract(first, index.get(first.id) || [], '2025-12-01').remaining).toBe(5_100_000);
    expect(summarizeContract(second, index.get(second.id) || [], '2025-12-01').remaining).toBe(2_750_000);

    rows[1] = { ...rows[1], status: 'cancelled' };
    index = indexPaymentsByContract(rows);
    expect(summarizeContract(first, index.get(first.id) || [], '2025-12-01').remaining).toBe(5_400_000);
    expect(summarizeContract(second, index.get(second.id) || [], '2025-12-01').remaining).toBe(2_750_000);
  });

  it('يرفض الدفعة غير الموجبة أو الأكبر من المتبقي ويحدد اكتمال العقد', () => {
    expect(() => validatePayment(0, 100)).toThrow();
    expect(() => validatePayment(101, 100)).toThrow();
    const value = contract();
    expect(summarizeContract(value, [payment(value.id, 6_000_000)], '2026-01-01').status).toBe('مكتمل');
  });
});
