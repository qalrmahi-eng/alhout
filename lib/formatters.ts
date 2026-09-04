import { formatDateForDisplay } from '@/lib/dates';

export const formatIqd = (value: number): string =>
  `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value || 0))} د.ع`;

export function formatDate(value?: string | null): string {
  return formatDateForDisplay(value);
}

export const formatContractNumber = (id: number): string =>
  `C-${String(id).padStart(5, '0')}`;
