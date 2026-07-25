export type InstallmentFrequency = 'weekly' | 'monthly';
export type CustomerStatus = 'منتظم' | 'مستحق اليوم' | 'متأخر' | 'مكتمل' | 'مؤرشف';
export type InstallmentStatus = 'قادم' | 'مستحق اليوم' | 'جزئي' | 'متأخر' | 'مدفوع';
export type PaymentStatus = 'active' | 'cancelled';

export interface Settings {
  id?: number;
  system_name: string;
  capital: number;
  default_profit_percent: number;
  default_installment_type?: InstallmentFrequency;
  receipt_footer?: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  address?: string;
  guarantor_name?: string;
  guarantor_phone?: string;
  principal: number;
  profit_percent: number;
  profit_amount?: number;
  contract_total?: number;
  installments: number;
  installment_type?: InstallmentFrequency;
  delivery_date?: string;
  first_due_date?: string;
  expected_end_date?: string;
  installment_value?: number;
  paid_installments?: number;
  start_date?: string;
  notes?: string;
  status?: string;
  created_at?: string;
  archived?: boolean | string;
}

export interface Payment {
  id: number;
  request_id?: string;
  receipt_number?: string;
  customer_id: number;
  amount: number;
  payment_date: string;
  notes?: string;
  created_at?: string;
  status?: PaymentStatus;
  cancellation_reason?: string;
  cancelled_at?: string;
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

export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  message?: string;
  code?: string;
  tracking_id?: string;
}

