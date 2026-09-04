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

export function addCalendarMonth(date: string): string {
  const { year, month, day } = parseDateOnly(date);
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function expectedPaymentAmount(
  contract: Contract,
  remaining = contract.remaining_amount,
): number {
  const fallback = Math.min(contract.installment_value, remaining);
  const requested = reminderMode(contract) === 'manual' && contract.manual_due_amount !== undefined
    ? contract.manual_due_amount
    : fallback;
  return Math.max(0, Math.min(requested, remaining));
}
