import type { Contract, ContractSummary, Customer, Payment } from '@/types/domain';

export function buildReceiptSnapshot(
  customer: Customer,
  contract: Contract,
  payment: Payment,
  summary: ContractSummary,
) {
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
    remaining: payment.remaining_after ?? summary.remaining,
    installmentValue: summary.installmentValue,
    completedInstallments: summary.completedInstallments,
    remainingInstallments: Math.max(contract.installments - summary.completedInstallments, 0),
    currentInstallmentPaid: summary.currentInstallmentPaid,
    currentInstallmentRemaining: summary.currentInstallmentRemaining,
    nextDueDate: summary.nextDueDate,
    completed: summary.remaining === 0,
    notes: payment.notes || '',
  };
}
