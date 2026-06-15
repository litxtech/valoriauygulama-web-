import { format, type Locale } from 'date-fns';
import { tr, enUS, ar, de, fr, ru, es } from 'date-fns/locale';
import i18n from '@/i18n';

const LOCALES: Record<string, Locale> = {
  tr,
  en: enUS,
  ar,
  de,
  fr,
  ru,
  es,
};

function appLocale(): Locale {
  const raw = (i18n.language || 'tr').toLowerCase();
  if (raw.startsWith('en')) return enUS;
  if (raw.startsWith('ar')) return ar;
  if (raw.startsWith('de')) return de;
  if (raw.startsWith('fr')) return fr;
  if (raw.startsWith('ru')) return ru;
  if (raw.startsWith('es')) return es;
  return tr;
}

/** Kurumsal feed: "Az önce", "5 dk önce", "Dün", "2 hafta önce" */
export function formatFeedRelativeTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';

  const lang = (i18n.language || 'tr').toLowerCase();
  const isTr = lang.startsWith('tr');

  const ms = Date.now() - d.getTime();
  if (ms < 45_000) return isTr ? 'Az önce' : 'Just now';

  const mins = Math.floor(ms / 60_000);
  if (mins < 60) {
    if (isTr) return `${mins} dk önce`;
    return mins === 1 ? '1 min ago' : `${mins} mins ago`;
  }

  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    if (isTr) return `${hrs} saat önce`;
    return hrs === 1 ? '1 hour ago' : `${hrs} hours ago`;
  }

  const days = Math.floor(hrs / 24);
  if (days === 1) return isTr ? 'Dün' : 'Yesterday';
  if (days < 7) {
    if (isTr) return `${days} gün önce`;
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }

  const weeks = Math.floor(days / 7);
  if (weeks < 5) {
    if (isTr) return `${weeks} hafta önce`;
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }

  try {
    return format(d, 'd MMM yyyy', { locale: appLocale() });
  } catch {
    return '';
  }
}
