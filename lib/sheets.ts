import type { Customer, Payment, Settings } from '@/types/domain';

type UnknownRecord = Record<string, unknown>;
type Normalizer<T> = (value: unknown) => T;

export type DashboardData = {
  settings: Settings;
  customers: Customer[];
  payments: Payment[];
};

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown): string {
  return String(value ?? '').trim();
}

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : fallback;

  const normalized = text(value).toLowerCase();
  if (['true', '1', 'yes', 'نعم', 'مؤرشف'].includes(normalized)) return true;
  if (['false', '0', 'no', 'لا', ''].includes(normalized)) return false;
  return fallback;
}

function installmentFrequency(
  value: unknown,
  fallback?: Settings['default_installment_type'],
): Settings['default_installment_type'] {
  const normalized = text(value).toLowerCase();
  if (normalized === 'weekly' || normalized === 'أسبوعي') return 'weekly';
  if (normalized === 'monthly' || normalized === 'شهري') return 'monthly';
  return fallback;
}

function customerStatus(value: unknown): string {
  const normalized = text(value);
  const aliases: Record<string, string> = {
    regular: 'منتظم',
    due_today: 'مستحق اليوم',
    late: 'متأخر',
    completed: 'مكتمل',
    archived: 'مؤرشف',
  };
  return aliases[normalized.toLowerCase()] ?? normalized;
}

function paymentStatus(value: unknown): Payment['status'] {
  const normalized = text(value).toLowerCase();
  if (['cancelled', 'canceled', 'ملغي', 'ملغاة'].includes(normalized)) return 'cancelled';
  return 'active';
}

export function customerDisplayName(value: unknown): string {
  return text(value) || 'بدون اسم';
}

export function customerPhoneText(value: unknown): string {
  return text(value);
}

export function customerAvatar(value: unknown): string {
  return customerDisplayName(value).slice(0, 1);
}

export function customerMatchesSearch(
  customer: { name?: unknown; phone?: unknown },
  query: unknown,
): boolean {
  const normalizedQuery = text(query).toLowerCase();
  if (!normalizedQuery) return true;
  return (
    customerDisplayName(customer?.name).toLowerCase().includes(normalizedQuery) ||
    customerPhoneText(customer?.phone).toLowerCase().includes(normalizedQuery)
  );
}

export function normalizeSettings(value: unknown): Settings {
  const record = asRecord(value);
  return {
    ...record,
    id: number(record.id),
    system_name: text(record.system_name),
    capital: number(record.capital),
    default_profit_percent: number(record.default_profit_percent),
    default_installment_type: installmentFrequency(
      record.default_installment_type,
      'monthly',
    ),
    receipt_footer: text(record.receipt_footer),
    updated_at: text(record.updated_at),
  };
}

export function normalizeCustomer(value: unknown): Customer {
  const record = asRecord(value);
  const status = customerStatus(record.status);
  return {
    ...record,
    id: number(record.id),
    name: customerDisplayName(record.name),
    phone: customerPhoneText(record.phone),
    address: text(record.address),
    guarantor_name: text(record.guarantor_name),
    guarantor_phone: text(record.guarantor_phone),
    principal: number(record.principal),
    profit_percent: number(record.profit_percent),
    profit_amount: number(record.profit_amount),
    contract_total: number(record.contract_total),
    installments: number(record.installments),
    installment_type: installmentFrequency(record.installment_type),
    delivery_date: text(record.delivery_date),
    first_due_date: text(record.first_due_date),
    expected_end_date: text(record.expected_end_date),
    installment_value: number(record.installment_value),
    paid_installments: number(record.paid_installments),
    paid_amount: number(record.paid_amount),
    remaining_amount: number(record.remaining_amount),
    current_installment_paid: number(record.current_installment_paid),
    current_installment_remaining: number(record.current_installment_remaining),
    next_due_date: text(record.next_due_date),
    start_date: text(record.start_date),
    notes: text(record.notes),
    status,
    created_at: text(record.created_at),
    archived: boolean(record.archived, status === 'مؤرشف'),
    updated_at: text(record.updated_at),
  };
}

export function normalizeCustomers(value: unknown): Customer[] {
  return Array.isArray(value) ? value.map(normalizeCustomer) : [];
}

export function normalizePayment(value: unknown): Payment {
  const record = asRecord(value);
  return {
    ...record,
    id: number(record.id),
    request_id: text(record.request_id),
    receipt_number: text(record.receipt_number),
    customer_id: number(record.customer_id),
    amount: number(record.amount),
    payment_date: text(record.payment_date),
    notes: text(record.notes),
    created_at: text(record.created_at),
    status: paymentStatus(record.status),
    cancellation_reason: text(record.cancellation_reason),
    cancelled_at: text(record.cancelled_at),
    updated_at: text(record.updated_at),
  };
}

export function normalizePayments(value: unknown): Payment[] {
  return Array.isArray(value) ? value.map(normalizePayment) : [];
}

export function normalizeDashboard(value: unknown): DashboardData {
  const record = asRecord(value);
  return {
    settings: normalizeSettings(record.settings),
    customers: normalizeCustomers(record.customers),
    payments: normalizePayments(record.payments),
  };
}

async function request<T>(
  action: string,
  normalize: Normalizer<T>,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch('/api/sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }),
    cache: 'no-store',
  });
  const payload = asRecord(await response.json());
  if (response.status === 401 && typeof window !== 'undefined') {
    window.location.assign('/login');
  }
  if (!response.ok || payload.ok !== true) {
    throw new Error(text(payload.message) || 'تعذر إكمال العملية');
  }
  return normalize(payload.data);
}

export const getSettings = () => request('settings', normalizeSettings);
export const getCustomers = () => request('customers', normalizeCustomers);
export const getPayments = () => request('payments', normalizePayments);
export const getDashboard = () => request('dashboard', normalizeDashboard);
export const addCustomer = (data: Record<string, unknown>) =>
  request('add_customer', normalizeCustomer, data);
export const updateCustomer = (data: Record<string, unknown>) =>
  request('update_customer', normalizeCustomer, data);
export const archiveCustomer = (customerId: number) =>
  request('archive_customer', normalizeCustomer, { customer_id: customerId });
export const restoreCustomer = (customerId: number) =>
  request('restore_customer', normalizeCustomer, { customer_id: customerId });
export const addPayment = (data: Record<string, unknown>) =>
  request('add_payment', normalizePayment, data);
export const cancelPayment = (paymentId: number, cancellationReason: string) =>
  request(
    'cancel_payment',
    normalizePayment,
    {
      payment_id: paymentId,
      cancellation_reason: cancellationReason,
    },
  );
export const updateSettings = (data: Record<string, unknown>) =>
  request('update_settings', normalizeSettings, data);
