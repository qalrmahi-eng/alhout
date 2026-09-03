function formText(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function buildCustomerFormPayload(
  form: FormData,
): Record<string, unknown> {
  return {
    name: formText(form, 'name'),
    phone: formText(form, 'phone'),
    address: formText(form, 'address'),
    notes: formText(form, 'notes'),
  };
}
