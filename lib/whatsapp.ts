import type { Contract, Customer } from '@/types/domain';
import { formatDate, formatIqd } from '@/lib/formatters';

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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('التاريخ غير صالح');
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(date) - parse(today)) / DAY_MS);
}

export function expectedPaymentAmount(contract: Contract): number {
  const current = contract.current_installment_remaining || contract.installment_value;
  return Math.max(0, Math.min(current, contract.remaining_amount));
}

function timingText(days: number): string {
  if (days < 0) return `مضى على موعد تسديد الدفعة الشهرية ${Math.abs(days)} أيام`;
  if (days === 0) return 'موعد تسديد الدفعة الشهرية اليوم';
  if (days === 1) return 'موعد تسديد الدفعة الشهرية غداً';
  return `متبقي ${days} أيام على موعد تسديد الدفعة الشهرية`;
}

export function buildWhatsAppMessage(customer: Customer, contract: Contract, today: string): string {
  if (!contract.next_due_date || contract.remaining_amount <= 0) {
    throw new Error('لا يوجد استحقاق حالي لهذا العقد');
  }
  const amount = expectedPaymentAmount(contract);
  const days = differenceInCalendarDays(contract.next_due_date, today);
  const remainingAfter = Math.max(contract.remaining_amount - amount, 0);
  return [
    `السلام عليكم أستاذ ${customer.name}،`,
    '',
    `${timingText(days)}، وقيمتها ${formatIqd(amount)}، بتاريخ ${formatDate(contract.next_due_date)}.`,
    '',
    `المتبقي من إجمالي العقد حالياً ${formatIqd(contract.remaining_amount)}، وبعد تسديد هذه الدفعة سيصبح المتبقي ${formatIqd(remainingAfter)}.`,
  ].join('\n');
}

export function buildWhatsAppUrl(customer: Customer, contract: Contract, today: string): string {
  const phone = normalizeIraqiPhone(customer.phone);
  if (!phone) throw new Error('رقم هاتف العميل غير صالح لواتساب');
  return `https://wa.me/${phone}?text=${encodeURIComponent(buildWhatsAppMessage(customer, contract, today))}`;
}
