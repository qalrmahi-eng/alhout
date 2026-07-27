import { normalizeSheetDate } from '@/lib/dates';
import type { Customer } from '@/types/domain';

function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function requiredDate(form: FormData, name: string, label: string): string {
  const value = formText(form, name);
  if (!value || normalizeSheetDate(value) !== value) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD`);
  }
  return value;
}

export function customerDeliveryInputValue(
  customer?: Customer | null,
): string {
  return (
    normalizeSheetDate(customer?.delivery_date) ||
    normalizeSheetDate(customer?.start_date)
  );
}

export function customerFirstDueInputValue(
  customer?: Customer | null,
): string {
  return normalizeSheetDate(customer?.first_due_date);
}

export function buildCustomerFormPayload(
  form: FormData,
): Record<string, unknown> {
  return {
    name: formText(form, 'name'),
    phone: formText(form, 'phone'),
    address: formText(form, 'address'),
    guarantor_name: formText(form, 'guarantor_name'),
    guarantor_phone: formText(form, 'guarantor_phone'),
    principal: Number(formText(form, 'principal')),
    profit_percent: Number(formText(form, 'profit_percent')),
    installments: Number(formText(form, 'installments')),
    installment_type: formText(form, 'installment_type'),
    delivery_date: requiredDate(
      form,
      'delivery_date',
      'تاريخ تسليم المبلغ',
    ),
    first_due_date: requiredDate(
      form,
      'first_due_date',
      'تاريخ أول استحقاق',
    ),
    notes: formText(form, 'notes'),
  };
}
