import type { Contract, Customer } from '@/types/domain';
import { formatDate, formatIqd } from '@/lib/formatters';
import { effectiveDueDate, expectedPaymentAmount } from '@/lib/due-date';
import { parseDateOnly } from '@/lib/dates';

const DAY_MS = 86_400_000;

export function normalizeIraqiPhone(value: unknown): string | null {
  let digits = String(value ?? '').replace(/[^\d]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = `964${digits.slice(1)}`;
  else if (/^7\d{9}$/.test(digits)) digits = `964${digits}`;
  if (!/^9647\d{9}$/.test(digits)) return null;
  return digits;
}

export function differenceInCalendarDays(date: string, today: string): number {
  const parse = (value: string) => {
    const { year, month, day } = parseDateOnly(value);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(date) - parse(today)) / DAY_MS);
}

function timingText(days: number): string {
  if (days < 0) return `مضى على موعد الدفعة ${Math.abs(days)} أيام`;
  if (days === 0) return 'موعد الدفعة القادمة اليوم';
  if (days === 1) return 'متبقي يوم واحد على موعد الدفعة القادمة';
  return `متبقي ${days} أيام على موعد الدفعة القادمة`;
}

export function buildWhatsAppMessage(customer: Customer, contract: Contract, today: string): string {
  const dueDate = effectiveDueDate(contract);
  if (!dueDate || contract.remaining_amount <= 0) {
    throw new Error('لا يوجد استحقاق حالي لهذا العقد');
  }
  const amount = expectedPaymentAmount(contract);
  const days = differenceInCalendarDays(dueDate, today);
  return [
    `السلام عليكم أستاذ ${customer.name}،`,
    '',
    `${timingText(days)} بتاريخ ${formatDate(dueDate)}، وقيمتها ${formatIqd(amount)}.`,
    '',
    `إجمالي المبلغ المتبقي حالياً ${formatIqd(contract.remaining_amount)}.`,
  ].join('\n');
}

export function buildWhatsAppUrl(customer: Customer, contract: Contract, today: string): string {
  const phone = normalizeIraqiPhone(customer.phone);
  if (!phone) throw new Error('رقم هاتف العميل غير صالح لواتساب');
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(customer, contract, today))}`;
}
