import type { Contract, ContractSummary, Customer, Payment } from '@/types/domain';
import { effectiveDueDate, expectedPaymentAmount } from '@/lib/due-date';

export function buildReceiptSnapshot(
  customer: Customer,
  contract: Contract,
  payment: Payment,
  summary: ContractSummary,
) {
  const remaining = payment.remaining_after ?? summary.remaining;
  return {
    receiptNumber: payment.receipt_number || `R-${payment.id}`,
    customerName: customer.name,
    customerPhone: customer.phone,
    contractId: contract.id,
    principal: contract.principal,
    profitPercent: contract.profit_percent,
    profitAmount: summary.profitAmount,
    contractTotal: summary.contractTotal,
    paymentAmount: payment.amount,
    paidAfterPayment: payment.paid_after ?? summary.paidAmount,
    remaining,
    installmentValue: summary.installmentValue,
    expectedPaymentAmount: expectedPaymentAmount(contract, remaining),
    completedInstallments: summary.completedInstallments,
    remainingInstallments: Math.max(contract.installments - summary.completedInstallments, 0),
    currentInstallmentPaid: summary.currentInstallmentPaid,
    currentInstallmentRemaining: summary.currentInstallmentRemaining,
    nextDueDate: effectiveDueDate(contract),
    completed: remaining === 0,
    notes: payment.notes || '',
  };
}
