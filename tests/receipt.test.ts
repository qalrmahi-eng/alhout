import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { summarizeContract } from '@/lib/finance';
import { buildReceiptSnapshot } from '@/lib/receipt';
import type { Customer, Payment } from '@/types/domain';

describe('بيانات الوصل', () => {
  it('تعكس الدفعة والرصيد بعد الحفظ بدقة', () => {
    const customer: Customer = {
      id: 7,
      name: 'أحمد',
      phone: 'هاتف-اختبار',
      principal: 1_000_000,
      profit_percent: 10,
      installments: 10,
      installment_type: 'monthly',
      first_due_date: '2026-08-01',
    };
    const payment: Payment = {
      id: 11,
      request_id: 'request-1',
      receipt_number: 'R-20260726-0001',
      customer_id: 7,
      amount: 40_000,
      payment_date: '2026-07-26',
      status: 'active',
    };
    const receipt = buildReceiptSnapshot(
      customer,
      payment,
      summarizeContract(customer, [payment], '2026-07-26'),
    );
    expect(receipt).toMatchObject({
      receiptNumber: 'R-20260726-0001',
      contractTotal: 1_100_000,
      paymentAmount: 40_000,
      paidAfterPayment: 40_000,
      remaining: 1_060_000,
      completedInstallments: 0,
      currentInstallmentRemaining: 70_000,
    });
  });

  it('يبقي حفظ الدفعة منفصلاً عن فشل إنشاء الصورة', () => {
    const dashboard = readFileSync('features/dashboard/dashboard-app.tsx', 'utf8');
    const receiptModal = readFileSync('features/receipts/receipt-modal.tsx', 'utf8');
    const paymentFlow = dashboard.slice(dashboard.indexOf('function PaymentForm'));
    expect(paymentFlow.indexOf('await addPayment')).toBeLessThan(paymentFlow.indexOf('onSaved(saved)'));
    expect(receiptModal).toContain('حُفظت الدفعة، لكن تعذر إنشاء صورة الوصل');
    expect(receiptModal).not.toContain('cancelPayment');
  });
});
