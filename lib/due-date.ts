import type { Contract } from '@/types/domain';

export function effectiveDueDate(
  contract: Contract,
  automaticDate: string | null | undefined = contract.next_due_date,
): string | null {
  return contract.manual_reminder_date || automaticDate || null;
}

export function expectedPaymentAmount(
  contract: Contract,
  remaining = contract.remaining_amount,
): number {
  return Math.max(0, Math.min(contract.installment_value, remaining));
}
