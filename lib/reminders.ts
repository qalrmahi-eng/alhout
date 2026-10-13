import type { Contract, Customer } from '@/types/domain';
import { differenceInCalendarDays } from '@/lib/whatsapp';
import { effectiveDueDate, expectedPaymentAmount } from '@/lib/due-date';

export type ReminderCategory = 'tomorrow' | 'today' | 'overdue';

export type ReminderItem<TContract extends Contract = Contract> = {
  customer: Customer;
  contract: TContract;
  days: number;
  amount: number;
  category: ReminderCategory | null;
  dueDate: string;
};

export const reminderCategories: { id: ReminderCategory; label: string }[] = [
  { id: 'tomorrow', label: 'غداً' },
  { id: 'today', label: 'اليوم' },
  { id: 'overdue', label: 'متأخر' },
];

function categoryForDays(days: number): ReminderCategory | null {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  return null;
}

function buildOperationalReminders<TContract extends Contract>(
  customers: Customer[],
  contracts: TContract[],
  today: string,
  dismissedOnly = false,
): ReminderItem<TContract>[] {
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const reminders: ReminderItem<TContract>[] = [];
  const seenOccurrences = new Set<string>();
  for (const contract of contracts) {
    const dueDate = effectiveDueDate(contract);
    if (contract.archived || contract.status === 'مؤرشف' || contract.status === 'مكتمل' || !dueDate) continue;
    const customer = customersById.get(contract.customer_id);
    if (!customer || customer.archived) continue;
    const dismissed = contract.dismissed_reminder_date === dueDate;
    if (dismissedOnly !== dismissed) continue;
    const occurrence = `${contract.id}:${dueDate}`;
    if (seenOccurrences.has(occurrence)) continue;
    seenOccurrences.add(occurrence);
    const days = differenceInCalendarDays(dueDate, today);
    const category = categoryForDays(days);
    reminders.push({ customer, contract, days, category, dueDate, amount: expectedPaymentAmount(contract) });
  }
  return reminders.sort((a, b) => a.days - b.days || a.customer.name.localeCompare(b.customer.name, 'ar'));
}

export function buildReminders<TContract extends Contract>(customers: Customer[], contracts: TContract[], today: string): ReminderItem<TContract>[] {
  return buildOperationalReminders(customers, contracts, today).filter((reminder) => reminder.category !== null);
}

export function buildDashboardReminderGroups<TContract extends Contract>(
  customers: Customer[], contracts: TContract[], today: string,
) {
  const all = buildReminders(customers, contracts, today);
  return {
    all,
    today: all.filter((reminder) => reminder.category === 'today'),
    overdue: all.filter((reminder) => reminder.category === 'overdue'),
    upcoming: all.filter((reminder) => reminder.category === 'tomorrow'),
  };
}

export function reminderBadgeCount(customers: Customer[], contracts: Contract[], today: string): number {
  return buildReminders(customers, contracts, today).length;
}

export function buildRemindersForDate(
  customers: Customer[], contracts: Contract[], today: string, selectedDate: string,
): ReminderItem[] {
  return buildOperationalReminders(customers, contracts, today).filter((reminder) => reminder.dueDate === selectedDate);
}

export function buildDismissedReminders<TContract extends Contract>(
  customers: Customer[], contracts: TContract[], today: string,
): ReminderItem<TContract>[] {
  return buildOperationalReminders(customers, contracts, today, true);
}
