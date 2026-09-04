import type {
  Contract,
  Customer,
  DashboardSummary,
  Payment,
  ReportsSummary,
  Settings,
} from '@/types/domain';
import {
  normalizeSheetDate,
  normalizeSheetDateTime,
} from '@/lib/dates';

type UnknownRecord = Record<string, unknown>;
type Normalizer<T> = (value: unknown) => T;

export type DashboardData = {
  settings: Settings;
  customers: Customer[];
  contracts: Contract[];
  payments: Payment[];
  summary: DashboardSummary;
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

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  return {
    id: number(record.id),
    name: customerDisplayName(record.name),
    phone: customerPhoneText(record.phone),
    address: text(record.address),
    notes: text(record.notes),
    created_at: normalizeSheetDateTime(record.created_at),
    archived: boolean(record.archived),
    updated_at: normalizeSheetDateTime(record.updated_at),
  };
}

export function normalizeCustomers(value: unknown): Customer[] {
  return Array.isArray(value) ? value.map(normalizeCustomer) : [];
}

export function normalizeContract(value: unknown): Contract {
  const record = asRecord(value);
  const status = customerStatus(record.status);
  const manualReminderDate = normalizeSheetDate(record.manual_reminder_date);
  const rawReminderMode = text(record.reminder_mode).toLowerCase();
  const reminderMode = rawReminderMode === 'manual' || rawReminderMode === 'automatic'
    ? rawReminderMode
    : manualReminderDate ? 'manual' : 'automatic';
  return {
    ...record,
    id: number(record.id),
    customer_id: number(record.customer_id),
    principal: number(record.principal),
    profit_percent: number(record.profit_percent),
    profit_amount: number(record.profit_amount),
    contract_total: number(record.contract_total),
    installments: number(record.installments),
    installment_value: number(record.installment_value),
    delivery_date: normalizeSheetDate(record.delivery_date),
    first_due_date: normalizeSheetDate(record.first_due_date),
    expected_end_date: normalizeSheetDate(record.expected_end_date),
    guarantor_name: text(record.guarantor_name),
    guarantor_phone: text(record.guarantor_phone),
    notes: text(record.notes),
    paid_amount: number(record.paid_amount),
    remaining_amount: number(record.remaining_amount),
    current_installment_paid: number(record.current_installment_paid),
    current_installment_remaining: number(record.current_installment_remaining),
    next_due_date: normalizeSheetDate(record.next_due_date),
    manual_reminder_date: manualReminderDate,
    manual_due_amount: optionalNumber(record.manual_due_amount),
    reminder_mode: reminderMode,
    status: status as Contract['status'],
    archived: boolean(record.archived, status === 'مؤرشف'),
    created_at: normalizeSheetDateTime(record.created_at),
    updated_at: normalizeSheetDateTime(record.updated_at),
  };
}

export function normalizeContracts(value: unknown): Contract[] {
  return Array.isArray(value) ? value.map(normalizeContract) : [];
}

export function normalizePayment(value: unknown): Payment {
  const record = asRecord(value);
  return {
    ...record,
    id: number(record.id),
    request_id: text(record.request_id),
    receipt_number: text(record.receipt_number),
    customer_id: number(record.customer_id),
    contract_id: number(record.contract_id),
    amount: number(record.amount),
    payment_date: text(record.payment_date),
    notes: text(record.notes),
    created_at: text(record.created_at),
    status: paymentStatus(record.status),
    cancellation_reason: text(record.cancellation_reason),
    cancelled_at: text(record.cancelled_at),
    edited_at: normalizeSheetDateTime(record.edited_at),
    edit_reason: text(record.edit_reason),
    paid_after: optionalNumber(record.paid_after),
    remaining_after: optionalNumber(record.remaining_after),
    updated_at: text(record.updated_at),
    contract_after: record.contract_after ? normalizeContract(record.contract_after) : undefined,
  };
}

export function normalizePayments(value: unknown): Payment[] {
  return Array.isArray(value) ? value.map(normalizePayment) : [];
}

export function normalizeDashboardSummary(value: unknown): DashboardSummary {
  const record = asRecord(value);
  return {
    total_principal: number(record.total_principal),
    total_contract_value: number(record.total_contract_value),
    total_received: number(record.total_received),
    total_remaining: number(record.total_remaining),
    total_expected_profit: number(record.total_expected_profit),
    received_this_month: number(record.received_this_month),
    customers_count: number(record.customers_count),
    active_contracts_count: number(record.active_contracts_count),
    completed_contracts_count: number(record.completed_contracts_count),
    overdue_contracts_count: number(record.overdue_contracts_count),
  };
}

export function normalizeReportsSummary(value: unknown): ReportsSummary {
  const record = asRecord(value);
  return {
    from: text(record.from),
    to: text(record.to),
    received_amount: number(record.received_amount),
    payments_count: number(record.payments_count),
    cancelled_payments_amount: number(record.cancelled_payments_amount),
    cancelled_payments_count: number(record.cancelled_payments_count),
    new_contracts_count: number(record.new_contracts_count),
    new_contracts_principal: number(record.new_contracts_principal),
    new_contracts_total: number(record.new_contracts_total),
    new_contracts_profit: number(record.new_contracts_profit),
    completed_contracts_count: number(record.completed_contracts_count),
  };
}

export function normalizeDashboard(value: unknown): DashboardData {
  const record = asRecord(value);
  return {
    settings: normalizeSettings(record.settings),
    customers: normalizeCustomers(record.customers),
    contracts: normalizeContracts(record.contracts),
    payments: normalizePayments(record.payments),
    summary: normalizeDashboardSummary(record.summary),
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
export const getContracts = () => request('contracts', normalizeContracts);
export const getPayments = () => request('payments', normalizePayments);
export const getDashboard = () => request('dashboard', normalizeDashboard);
export const getReportsSummary = (from: string, to: string) =>
  request('reports_summary', normalizeReportsSummary, { from, to });
export const addCustomer = (data: Record<string, unknown>) =>
  request('add_customer', normalizeCustomer, data);
export const updateCustomer = (data: Record<string, unknown>) =>
  request('update_customer', normalizeCustomer, data);
export const addContract = (data: Record<string, unknown>) =>
  request('add_contract', normalizeContract, data);
export const updateContract = (data: Record<string, unknown>) =>
  request('update_contract', normalizeContract, data);
export const archiveContract = (contractId: number) =>
  request('archive_contract', normalizeContract, { contract_id: contractId });
export const restoreContract = (contractId: number) =>
  request('restore_contract', normalizeContract, { contract_id: contractId });
export const setManualReminderDate = (contractId: number, date: string, amount?: number) =>
  request('set_manual_reminder_date', normalizeContract, {
    contract_id: contractId,
    manual_reminder_date: date,
    manual_due_amount: amount,
  });
export const clearManualReminderDate = (contractId: number) =>
  request('clear_manual_reminder_date', normalizeContract, { contract_id: contractId });
export const archiveCustomer = (customerId: number) =>
  request('archive_customer', normalizeCustomer, { customer_id: customerId });
export const restoreCustomer = (customerId: number) =>
  request('restore_customer', normalizeCustomer, { customer_id: customerId });
export const deleteCustomerPermanently = (customerId: number) =>
  request(
    'delete_customer_permanently',
    (value) => {
      const record = asRecord(value);
      return {
        customer_id: number(record.customer_id),
        deleted_customers: number(record.deleted_customers),
        deleted_contracts: number(record.deleted_contracts),
        deleted_payments: number(record.deleted_payments),
      };
    },
    { customer_id: customerId },
  );
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
export const updatePayment = (data: Record<string, unknown>) =>
  request('update_payment', normalizePayment, data);
export const updateSettings = (data: Record<string, unknown>) =>
  request('update_settings', normalizeSettings, data);
