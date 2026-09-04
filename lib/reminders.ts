import type { Contract, Customer } from '@/types/domain';
import { differenceInCalendarDays } from '@/lib/whatsapp';
import { effectiveDueDate, expectedPaymentAmount } from '@/lib/due-date';

export type ReminderCategory = 'after_7' | 'after_3' | 'tomorrow' | 'today' | 'overdue';

export type ReminderItem = {
  customer: Customer;
  contract: Contract;
  days: number;
  amount: number;
  category: ReminderCategory | null;
  dueDate: string;
};

export const reminderCategories: { id: ReminderCategory; label: string }[] = [
  { id: 'after_7', label: 'قبل 7 أيام' },
  { id: 'after_3', label: 'قبل 3 أيام' },
  { id: 'tomorrow', label: 'غداً' },
  { id: 'today', label: 'اليوم' },
  { id: 'overdue', label: 'متأخر' },
];

function categoryForDays(days: number): ReminderCategory | null {
  if (days < 0) return 'overdue';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === 3) return 'after_3';
  if (days === 7) return 'after_7';
  return null;
}

function buildOperationalReminders(
  customers: Customer[],
  contracts: Contract[],
  today: string,
): ReminderItem[] {
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const reminders: ReminderItem[] = [];
  for (const contract of contracts) {
    const dueDate = effectiveDueDate(contract);
    if (contract.archived || contract.status === 'مؤرشف' || contract.status === 'مكتمل' || !dueDate) continue;
    const customer = customersById.get(contract.customer_id);
    if (!customer || customer.archived) continue;
    const days = differenceInCalendarDays(dueDate, today);
    const category = categoryForDays(days);
    reminders.push({ customer, contract, days, category, dueDate, amount: expectedPaymentAmount(contract) });
  }
  return reminders.sort((a, b) => a.days - b.days || a.customer.name.localeCompare(b.customer.name, 'ar'));
}

export function buildReminders(customers: Customer[], contracts: Contract[], today: string): ReminderItem[] {
  return buildOperationalReminders(customers, contracts, today).filter((reminder) => reminder.category !== null);
}

export function buildRemindersForDate(
  customers: Customer[], contracts: Contract[], today: string, selectedDate: string,
): ReminderItem[] {
  return buildOperationalReminders(customers, contracts, today).filter((reminder) => reminder.dueDate === selectedDate);
}
