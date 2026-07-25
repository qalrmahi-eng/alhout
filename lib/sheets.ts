import type { ApiResponse, Customer, Payment, Settings } from '@/types/domain';

async function request<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch('/api/sheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, data }),
    cache: 'no-store',
  });
  const payload = (await response.json()) as ApiResponse<T>;
  if (response.status === 401 && typeof window !== 'undefined') {
    window.location.assign('/login');
  }
  if (!response.ok || !payload.ok) throw new Error(payload.message || 'تعذر إكمال العملية');
  return payload.data as T;
}

export const getSettings = () => request<Settings>('settings');
export const getCustomers = () => request<Customer[]>('customers');
export const getPayments = () => request<Payment[]>('payments');
export const addCustomer = (data: Record<string, unknown>) => request<Customer>('add_customer', data);
export const updateCustomer = (data: Record<string, unknown>) => request<Customer>('update_customer', data);
export const archiveCustomer = (customerId: number) =>
  request<Customer>('archive_customer', { customer_id: customerId });
export const restoreCustomer = (customerId: number) =>
  request<Customer>('restore_customer', { customer_id: customerId });
export const addPayment = (data: Record<string, unknown>) => request<Payment>('add_payment', data);
export const cancelPayment = (paymentId: number, cancellationReason: string) =>
  request<Payment>('cancel_payment', {
    payment_id: paymentId,
    cancellation_reason: cancellationReason,
  });
export const updateSettings = (data: Record<string, unknown>) =>
  request<Settings>('update_settings', data);
