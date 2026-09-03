import type { Contract, Customer } from '@/types/domain';
import { differenceInCalendarDays, expectedPaymentAmount } from '@/lib/whatsapp';

export type ReminderCategory = 'after_7' | 'after_3' | 'tomorrow' | 'today' | 'overdue';

export type ReminderItem = {
  customer: Customer;
  contract: Contract;
  days: number;
  amount: number;
  category: ReminderCategory;
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

export function buildReminders(
  customers: Customer[],
  contracts: Contract[],
  today: string,
): ReminderItem[] {
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const reminders: ReminderItem[] = [];
  for (const contract of contracts) {
    if (contract.archived || contract.status === 'مؤرشف' || contract.status === 'مكتمل' || !contract.next_due_date) continue;
    const customer = customersById.get(contract.customer_id);
    if (!customer || customer.archived) continue;
    const days = differenceInCalendarDays(contract.next_due_date, today);
    const category = categoryForDays(days);
    if (!category) continue;
    reminders.push({ customer, contract, days, category, amount: expectedPaymentAmount(contract) });
  }
  return reminders.sort((a, b) => a.days - b.days || a.customer.name.localeCompare(b.customer.name, 'ar'));
}

