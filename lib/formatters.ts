export const formatIqd = (value: number): string =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value || 0))} د.ع`;

export function formatDate(value?: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '—';
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

export const formatContractNumber = (id: number): string =>
  `C-${String(id).padStart(5, '0')}`;

