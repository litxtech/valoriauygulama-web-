import type { StaffDepartureStatus } from './types';

export const STATUS_LABELS: Record<StaffDepartureStatus, string> = {
  planned: 'Planlandı',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

export const STATUS_COLORS: Record<StaffDepartureStatus, { bg: string; text: string }> = {
  planned: { bg: '#fef3c7', text: '#b45309' },
  completed: { bg: '#dcfce7', text: '#15803d' },
  cancelled: { bg: '#f1f5f9', text: '#64748b' },
};

export function formatDepartureDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return isoDate;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('tr-TR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function daysUntilDeparture(isoDate: string): number | null {
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
