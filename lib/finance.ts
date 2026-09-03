import type {
  ContractSummary,
  Contract,
  CustomerStatus,
  InstallmentFrequency,
  InstallmentRow,
  InstallmentStatus,
  Payment,
} from '@/types/domain';

const DAY_MS = 86_400_000;

function assertSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} يجب أن يكون عدداً صحيحاً آمناً`);
  }
}

export function toIqd(value: number | string): number {
  const parsed = typeof value === 'string' ? Number(value.replace(/[,\s٬]/g, '')) : value;
  if (!Number.isFinite(parsed)) throw new Error('المبلغ غير صالح');
  const result = Math.round(parsed);
  assertSafeInteger(result, 'المبلغ');
  return result;
}

export function calculateProfit(principalInput: number, profitPercent: number): number {
  const principal = toIqd(principalInput);
  if (principal < 0 || !Number.isFinite(profitPercent) || profitPercent < 0) {
    throw new Error('بيانات الربح غير صالحة');
  }
  const basisPoints = Math.round(profitPercent * 100);
  assertSafeInteger(basisPoints, 'نسبة الربح');
  const numerator = BigInt(principal) * BigInt(basisPoints);
  return Number((numerator + 5_000n) / 10_000n);
}

export function calculateContract(principal: number, profitPercent: number) {
  const normalizedPrincipal = toIqd(principal);
  const profitAmount = calculateProfit(normalizedPrincipal, profitPercent);
  const contractTotal = normalizedPrincipal + profitAmount;
  assertSafeInteger(contractTotal, 'إجمالي العقد');
  return { principal: normalizedPrincipal, profitAmount, contractTotal };
}

export function splitInstallments(totalInput: number, count: number): number[] {
  const total = toIqd(totalInput);
  if (total < 0 || !Number.isInteger(count) || count <= 0) {
    throw new Error('عدد الأقساط أو الإجمالي غير صالح');
  }
  const regular = Math.floor(total / count);
  const installments = Array.from({ length: count }, () => regular);
  installments[count - 1] = total - regular * (count - 1);
  return installments;
}

function parseDateOnly(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('التاريخ غير صالح');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error('التاريخ غير صالح');
  return date;
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function addInstallmentPeriod(
  firstDueDate: string,
  index: number,
  frequency: InstallmentFrequency,
): string {
  const first = parseDateOnly(firstDueDate);
  if (!Number.isInteger(index) || index < 0) throw new Error('رقم القسط غير صالح');
  if (frequency === 'weekly') {
    return isoDate(new Date(first.getTime() + index * 7 * DAY_MS));
  }

  const anchorDay = first.getUTCDate();
  const absoluteMonth = first.getUTCFullYear() * 12 + first.getUTCMonth() + index;
  const year = Math.floor(absoluteMonth / 12);
  const month = absoluteMonth % 12;
  const day = Math.min(anchorDay, daysInUtcMonth(year, month));
  return isoDate(new Date(Date.UTC(year, month, day)));
}

export function baghdadToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function activePaidAmount(payments: Payment[]): number {
  return payments
    .filter((payment) => (payment.status ?? 'active') === 'active')
    .reduce((sum, payment) => sum + toIqd(payment.amount), 0);
}

export function buildSchedule(input: {
  total: number;
  count: number;
  frequency: InstallmentFrequency;
  firstDueDate: string;
  paidAmount: number;
  today?: string;
}): InstallmentRow[] {
  const amounts = splitInstallments(input.total, input.count);
  let credit = Math.max(0, toIqd(input.paidAmount));
  const today = input.today ?? baghdadToday();

  return amounts.map((amount, index) => {
    const paid = Math.min(credit, amount);
    credit -= paid;
    const remaining = amount - paid;
    const dueDate = addInstallmentPeriod(input.firstDueDate, index, input.frequency);
    let status: InstallmentStatus;
    if (remaining === 0) status = 'مدفوع';
    else if (paid > 0) status = 'جزئي';
    else if (dueDate < today) status = 'متأخر';
    else if (dueDate === today) status = 'مستحق اليوم';
    else status = 'قادم';
    return { number: index + 1, dueDate, amount, paid, remaining, status };
  });
}

export function deriveCustomerStatus(
  schedule: InstallmentRow[],
  archived: boolean,
  today = baghdadToday(),
): CustomerStatus {
  if (archived) return 'مؤرشف';
  if (schedule.every((row) => row.remaining === 0)) return 'مكتمل';
  if (schedule.some((row) => row.status === 'متأخر' || (row.status === 'جزئي' && row.dueDate < today))) {
    return 'متأخر';
  }
  if (schedule.some((row) => row.status === 'مستحق اليوم' || (row.status === 'جزئي' && row.dueDate === today))) {
    return 'مستحق اليوم';
  }
  return 'منتظم';
}

function isArchived(contract: Contract) {
  return contract.archived === true || contract.archived === 'true' || contract.status === 'مؤرشف';
}

export function summarizeContract(
  contract: Contract,
  contractPayments: Payment[],
  today = baghdadToday(),
): ContractSummary {
  const { profitAmount, contractTotal } = calculateContract(
    contract.principal,
    contract.profit_percent,
  );
  const count = Math.max(1, Math.trunc(contract.installments || 1));
  const firstDueDate = contract.first_due_date || today;
  const paidAmount = Math.min(activePaidAmount(contractPayments), contractTotal);
  const schedule = buildSchedule({
    total: contractTotal,
    count,
    frequency: 'monthly',
    firstDueDate,
    paidAmount,
    today,
  });
  const current = schedule.find((row) => row.remaining > 0);
  const completedInstallments = schedule.filter((row) => row.remaining === 0).length;

  return {
    profitAmount,
    contractTotal,
    installmentValue: schedule[0]?.amount ?? 0,
    paidAmount,
    remaining: contractTotal - paidAmount,
    completedInstallments,
    currentInstallmentPaid: current?.paid ?? 0,
    currentInstallmentRemaining: current?.remaining ?? 0,
    nextDueDate: current?.dueDate ?? null,
    expectedEndDate: schedule.at(-1)?.dueDate ?? firstDueDate,
    status: deriveCustomerStatus(schedule, isArchived(contract), today),
    schedule,
  };
}

export function indexPaymentsByContract(payments: Payment[]): Map<number, Payment[]> {
  const index = new Map<number, Payment[]>();
  for (const payment of payments) {
    const contractId = Number(payment.contract_id);
    if (!Number.isSafeInteger(contractId) || contractId <= 0) continue;
    const rows = index.get(contractId);
    if (rows) rows.push(payment);
    else index.set(contractId, [payment]);
  }
  return index;
}

export function validatePayment(amountInput: number, remainingInput: number): number {
  const amount = toIqd(amountInput);
  const remaining = toIqd(remainingInput);
  if (amount <= 0) throw new Error('يجب أن تكون الدفعة أكبر من صفر');
  if (amount > remaining) throw new Error('الدفعة أكبر من المبلغ المتبقي');
  return amount;
}
