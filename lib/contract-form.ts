import { normalizeSheetDate } from '@/lib/dates';

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function requiredDate(form: FormData, name: string, label: string): string {
  const value = text(form, name);
  if (!value || normalizeSheetDate(value) !== value) {
    throw new Error(`${label} غير صالح. استخدم الصيغة YYYY-MM-DD`);
  }
  return value;
}

export function buildContractFormPayload(form: FormData): Record<string, unknown> {
  return {
    customer_id: Number(text(form, 'customer_id')),
    principal: Number(text(form, 'principal')),
    profit_percent: Number(text(form, 'profit_percent')),
    installments: Number(text(form, 'installments')),
    delivery_date: requiredDate(form, 'delivery_date', 'تاريخ تسليم المبلغ'),
    first_due_date: requiredDate(form, 'first_due_date', 'تاريخ أول استحقاق'),
    guarantor_name: text(form, 'guarantor_name'),
    guarantor_phone: text(form, 'guarantor_phone'),
    notes: text(form, 'notes'),
  };
}
