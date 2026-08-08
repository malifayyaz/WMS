import { format, parseISO } from 'date-fns';

/**
 * Format number as Rs. 10,000.00
 */
export function formatCurrency(amount) {
  if (amount == null) return 'Rs. 0.00';
  return `Rs. ${Number(amount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Display date as DD/MM/YYYY (local timezone; date-only strings keep calendar day).
 */
export function formatDate(date) {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) {
    const [y, m, d] = date.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (Number.isNaN(d?.getTime?.())) return '';
  return format(d, 'dd/MM/yyyy');
}

export function formatDateTime(date) {
  if (!date) return '';
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (Number.isNaN(d?.getTime?.())) return '';
  return format(d, 'dd/MM/yyyy HH:mm');
}
