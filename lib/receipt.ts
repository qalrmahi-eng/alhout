import type { ContractSummary, Customer, Payment } from '@/types/domain';

export function buildReceiptSnapshot(
  customer: Customer,
  payment: Payment,
  summary: ContractSummary,
) {
  return {
    receiptNumber: payment.receipt_number || `R-${payment.id}`,
    customerName: customer.name,
    customerPhone: customer.phone,
    principal: customer.principal,
    profitPercent: customer.profit_percent,
    profitAmount: summary.profitAmount,
    contractTotal: summary.contractTotal,
    paymentAmount: payment.amount,
    paidAfterPayment: summary.paidAmount,
    remaining: summary.remaining,
    installmentValue: summary.installmentValue,
    completedInstallments: summary.completedInstallments,
    remainingInstallments: Math.max(customer.installments - summary.completedInstallments, 0),
    currentInstallmentPaid: summary.currentInstallmentPaid,
    currentInstallmentRemaining: summary.currentInstallmentRemaining,
    nextDueDate: summary.nextDueDate,
    completed: summary.remaining === 0,
    notes: payment.notes || '',
  };
}

