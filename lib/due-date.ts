import type { Contract, ReminderMode } from '@/types/domain';
import { parseDateOnly } from '@/lib/dates';

export function reminderMode(contract: Contract): ReminderMode {
  if (contract.reminder_mode === 'manual' || contract.reminder_mode === 'automatic') {
    return contract.reminder_mode;
  }
  return contract.manual_reminder_date ? 'manual' : 'automatic';
}

export function effectiveDueDate(
  contract: Contract,
  automaticDate: string | null | undefined = contract.next_due_date,
): string | null {
  return reminderMode(contract) === 'manual'
    ? contract.manual_reminder_date || null
    : automaticDate || null;
}

export function addCalendarMonth(date: string, anchorDay?: number): string {
  const { year, month, day } = parseDateOnly(date);
  const requestedDay = anchorDay ?? day;
  if (!Number.isInteger(requestedDay) || requestedDay < 1 || requestedDay > 31) {
    throw new Error('يوم مرساة التذكير غير صالح');
  }
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(requestedDay, lastDay);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function expectedPaymentAmount(
  contract: Contract,
  remaining = contract.remaining_amount,
): number {
  const mode = reminderMode(contract);
  const automaticDue = contract.current_installment_remaining > 0
    ? contract.current_installment_remaining
    : contract.installment_value;
  const fallback = Math.min(mode === 'manual' ? contract.installment_value : automaticDue, remaining);
  const requested = mode === 'manual' && contract.manual_due_amount !== undefined
    ? contract.manual_due_amount
    : fallback;
  return Math.max(0, Math.min(requested, remaining));
}
