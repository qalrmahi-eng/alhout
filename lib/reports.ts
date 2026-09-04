import type { Contract, Payment } from '@/types/domain';
import { parseDateOnly } from '@/lib/dates';

export type ReportPreset = 'current_month' | 'previous_month' | 'current_year';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function reportPresetRange(preset: ReportPreset, today: string): { from: string; to: string } {
  const { year, month } = parseDateOnly(today);
  if (preset === 'current_year') return { from: `${year}-01-01`, to: `${year}-12-31` };
  const start = preset === 'current_month'
    ? new Date(Date.UTC(year, month - 1, 1))
    : new Date(Date.UTC(year, month - 2, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return { from: isoDate(start), to: isoDate(end) };
}

export function inDateRange(value: string | undefined, from: string, to: string): boolean {
  return Boolean(value && value >= from && value <= to);
}

export function activePaymentsForContract(payments: Payment[], contractId: number): Payment[] {
  return payments.filter((payment) => payment.contract_id === contractId && payment.status !== 'cancelled');
}

export function contractsForCustomer(contracts: Contract[], customerId: number): Contract[] {
  return contracts.filter((contract) => contract.customer_id === customerId);
}
