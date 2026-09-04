export type InstallmentFrequency = 'weekly' | 'monthly';
export type ContractStatus = 'منتظم' | 'مستحق اليوم' | 'متأخر' | 'مكتمل' | 'مؤرشف';
export type CustomerStatus = ContractStatus;
export type InstallmentStatus = 'قادم' | 'مستحق اليوم' | 'جزئي' | 'متأخر' | 'مدفوع';
export type PaymentStatus = 'active' | 'cancelled';
export type ReminderMode = 'automatic' | 'manual';

export interface Settings {
  id?: number;
  system_name: string;
  capital: number;
  default_profit_percent: number;
  default_installment_type?: InstallmentFrequency;
  receipt_footer?: string;
  updated_at?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  created_at?: string;
  archived?: boolean | string;
  updated_at?: string;
}

export interface Contract {
  id: number;
  customer_id: number;
  principal: number;
  profit_percent: number;
  profit_amount: number;
  contract_total: number;
  installments: number;
  installment_value: number;
  delivery_date: string;
  first_due_date: string;
  expected_end_date: string;
  guarantor_name?: string;
  guarantor_phone?: string;
  notes?: string;
  paid_amount: number;
  remaining_amount: number;
  current_installment_paid: number;
  current_installment_remaining: number;
  next_due_date?: string;
  manual_reminder_date?: string;
  reminder_mode?: ReminderMode;
  status: ContractStatus;
  archived?: boolean | string;
  created_at?: string;
  updated_at?: string;
}

export interface Payment {
  id: number;
  request_id?: string;
  receipt_number?: string;
  customer_id: number;
  contract_id: number;
  amount: number;
  payment_date: string;
  notes?: string;
  created_at?: string;
  status?: PaymentStatus;
  cancellation_reason?: string;
  cancelled_at?: string;
  edited_at?: string;
  edit_reason?: string;
  paid_after?: number;
  remaining_after?: number;
  updated_at?: string;
  contract_after?: Contract;
}

export interface InstallmentRow {
  number: number;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  status: InstallmentStatus;
}

export interface ContractSummary {
  profitAmount: number;
  contractTotal: number;
  installmentValue: number;
  paidAmount: number;
  remaining: number;
  completedInstallments: number;
  currentInstallmentPaid: number;
  currentInstallmentRemaining: number;
  nextDueDate: string | null;
  expectedEndDate: string;
  status: CustomerStatus;
  schedule: InstallmentRow[];
}

export type ContractView = Contract & {
  customer: Customer;
  summary: ContractSummary;
  incomplete: boolean;
};

export interface DashboardSummary {
  total_principal: number;
  total_contract_value: number;
  total_received: number;
  total_remaining: number;
  total_expected_profit: number;
  received_this_month: number;
  customers_count: number;
  active_contracts_count: number;
  completed_contracts_count: number;
  overdue_contracts_count: number;
}

export interface ReportsSummary {
  from: string;
  to: string;
  received_amount: number;
  payments_count: number;
  cancelled_payments_amount: number;
  cancelled_payments_count: number;
  new_contracts_count: number;
  new_contracts_principal: number;
  new_contracts_total: number;
  new_contracts_profit: number;
  completed_contracts_count: number;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  code?: string;
  tracking_id?: string;
}
