/**
 * Tarih yardımcıları – date-fns; locale uygulama diline göre
 */
import {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  addDays,
  subDays,
  startOfDay,
  endOfDay,
  type Locale,
} from 'date-fns';
import { tr, enUS, ar } from 'date-fns/locale';
import i18n from '@/i18n';

export function resolveDateFnsLocale(lang?: string): Locale {
  const code = (lang ?? i18n.language ?? 'tr').split('-')[0];
  if (code === 'ar') return ar;
  if (code === 'en') return enUS;
  return tr;
}

/** @deprecated Uygulama dili için `resolveDateFnsLocale()` kullanın */
export const dateLocale: Locale = tr;

/** ISO tarih string → Date (invalid ise null) */
export function parseDate(value: string | null | undefined): Date | null {
  if (value == null || value === '') return null;
  const d = typeof value === 'string' ? parseISO(value) : new Date(value);
  return isValid(d) ? d : null;
}

/** Tarih → "15 Mart 2025" */
export function formatDate(date: Date | string | null | undefined): string {
  const d = parseDate(typeof date === 'object' ? date?.toISOString?.() ?? '' : date);
  if (!d) return '—';
  return format(d, 'd MMMM yyyy', { locale: resolveDateFnsLocale() });
}

/** Tarih → "15.03.2025" */
export function formatDateShort(date: Date | string | null | undefined): string {
  const d = parseDate(typeof date === 'object' ? date?.toISOString?.() ?? '' : date);
  if (!d) return '—';
  return format(d, 'dd.MM.yyyy', { locale: resolveDateFnsLocale() });
}

/** Tarih + saat → "15 Mart 2025, 14:30" */
export function formatDateTime(date: Date | string | null | undefined): string {
  const d = parseDate(typeof date === 'object' ? date?.toISOString?.() ?? '' : date);
  if (!d) return '—';
  return format(d, 'd MMMM yyyy, HH:mm', { locale: resolveDateFnsLocale() });
}

/** Sadece saat → "14:30" */
export function formatTime(date: Date | string | null | undefined): string {
  const d = parseDate(typeof date === 'object' ? date?.toISOString?.() ?? '' : date);
  if (!d) return '—';
  return format(d, 'HH:mm', { locale: resolveDateFnsLocale() });
}

/** "5 dakika önce" / "2 saat önce" (TR) */
export function formatRelative(date: Date | string | null | undefined, base = new Date()): string {
  const d = parseDate(typeof date === 'object' ? date?.toISOString?.() ?? '' : date);
  if (!d) return '—';
  return formatDistanceToNow(d, { addSuffix: true, locale: resolveDateFnsLocale() });
}

/** Kısa tarih — uygulama diline göre */
export function formatLocaleDateShort(date: Date | string | null | undefined, lang?: string): string {
  const d = parseDate(typeof date === 'object' ? date?.toISOString?.() ?? '' : date);
  if (!d) return '—';
  const code = (lang ?? i18n.language ?? 'tr').split('-')[0];
  const locale = code === 'ar' ? 'ar-SA' : code === 'en' ? 'en-US' : 'tr-TR';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Tarih + saat — uygulama diline göre */
export function formatLocaleDateTime(date: Date | string | null | undefined, lang?: string): string {
  const d = parseDate(typeof date === 'object' ? date?.toISOString?.() ?? '' : date);
  if (!d) return '—';
  const code = (lang ?? i18n.language ?? 'tr').split('-')[0];
  const locale = code === 'ar' ? 'ar-SA' : code === 'en' ? 'en-US' : 'tr-TR';
  return d.toLocaleString(locale);
}

/** Bugünün ISO tarih aralığı (00:00 - 23:59:59) */
export function todayISORange(): { start: string; end: string } {
  const start = startOfDay(new Date());
  const end = endOfDay(new Date());
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

/** Verilen tarihe gün ekle/çıkar, ISO date string (YYYY-MM-DD) */
export function addDaysToDate(dateStr: string, delta: number): string {
  const d = parseISO(dateStr);
  const next = addDays(d, delta);
  return format(next, 'yyyy-MM-dd');
}

export { addDays, subDays, startOfDay, endOfDay, format, parseISO, isValid };
export { tr as dateFnsLocale };
