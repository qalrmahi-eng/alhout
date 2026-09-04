import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { summarizeContract } from '@/lib/finance';
import { buildReceiptSnapshot } from '@/lib/receipt';
import type { Contract, Customer, Payment } from '@/types/domain';

describe('بيانات الوصل', () => {
  it('تعكس الدفعة والرصيد بعد الحفظ بدقة', () => {
    const customer: Customer = {
      id: 7,
      name: 'أحمد',
      phone: 'هاتف-اختبار',
    };
    const contract: Contract = {
      id: 101,
      customer_id: 7,
      principal: 1_000_000,
      profit_percent: 10,
      profit_amount: 100_000,
      contract_total: 1_100_000,
      installments: 10,
      installment_value: 110_000,
      delivery_date: '2026-07-01',
      first_due_date: '2026-08-01',
      expected_end_date: '2027-05-01',
      paid_amount: 40_000,
      remaining_amount: 1_060_000,
      current_installment_paid: 40_000,
      current_installment_remaining: 70_000,
      next_due_date: '2026-08-01',
      status: 'منتظم',
    };
    const payment: Payment = {
      id: 11,
      request_id: 'request-1',
      receipt_number: 'R-20260726-0001',
      customer_id: 7,
      contract_id: 101,
      amount: 40_000,
      payment_date: '2026-07-26',
      status: 'active',
    };
    const receipt = buildReceiptSnapshot(
      customer,
      contract,
      payment,
      summarizeContract(contract, [payment], '2026-07-26'),
    );
    expect(receipt).toMatchObject({
      receiptNumber: 'R-20260726-0001',
      contractId: 101,
      contractTotal: 1_100_000,
      paymentAmount: 40_000,
      paidAfterPayment: 40_000,
      remaining: 1_060_000,
      completedInstallments: 0,
      currentInstallmentRemaining: 70_000,
      expectedPaymentAmount: 110_000,
    });
  });

  it('يستخدم الموعد اليدوي في نسخة الزبون دون معلومات تقدم الأقساط', () => {
    const customer: Customer = { id: 1, name: 'سارة', phone: '' };
    const contract: Contract = {
      id: 1, customer_id: 1, principal: 1_000_000, profit_percent: 10, profit_amount: 100_000,
      contract_total: 1_100_000, installments: 10, installment_value: 110_000,
      delivery_date: '2026-01-01', first_due_date: '2026-02-01', expected_end_date: '2026-11-01',
      paid_amount: 1_050_000, remaining_amount: 50_000, current_installment_paid: 60_000,
      current_installment_remaining: 50_000, next_due_date: '2026-11-01', manual_reminder_date: '2026-09-15', status: 'منتظم',
    };
    const payment: Payment = { id: 2, customer_id: 1, contract_id: 1, amount: 50_000, payment_date: '2026-09-01', paid_after: 1_050_000, remaining_after: 50_000 };
    const snapshot = buildReceiptSnapshot(customer, contract, payment, summarizeContract(contract, [{ ...payment, amount: 1_050_000 }], '2026-09-01'));
    expect(snapshot).toMatchObject({ nextDueDate: '2026-09-15', expectedPaymentAmount: 50_000, remaining: 50_000 });
  });

  it('يبقي حفظ الدفعة منفصلاً عن فشل إنشاء الصورة', () => {
    const dashboard = readFileSync('features/payments/payment-dialog.tsx', 'utf8');
    const receiptModal = readFileSync('features/receipts/receipt-modal.tsx', 'utf8');
    const paymentFlow = dashboard.slice(dashboard.indexOf('async function submit'));
    expect(paymentFlow.indexOf('await addPayment')).toBeLessThan(paymentFlow.indexOf('props.onRecorded(payment)'));
    expect(receiptModal).toContain('حُفظت الدفعة، لكن تعذر إنشاء صورة الوصل');
    expect(receiptModal).not.toContain('cancelPayment');
  });

  it('يفصل وصل الزبون عن تفاصيل التسعير الداخلية', () => {
    const receiptModal = readFileSync('features/receipts/receipt-modal.tsx', 'utf8');
    const adminView = readFileSync('features/contracts/contract-details.tsx', 'utf8');
    expect(receiptModal).not.toContain('رقم العقد');
    expect(receiptModal).not.toContain('أصل المبلغ');
    expect(receiptModal).not.toContain('نسبة الربح');
    expect(receiptModal).not.toContain('مبلغ الربح');
    expect(receiptModal).not.toContain('الأقساط المكتملة');
    expect(receiptModal).not.toContain('currentInstallment');
    expect(adminView).toContain('المبلغ المسلم');
    expect(adminView).toContain('نسبة الربح');
    expect(adminView).toContain('profit_amount');
  });
});
