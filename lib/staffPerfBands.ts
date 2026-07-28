/** Tek resmi performans puanı bantları (0–100). */
export type PerfBandKey =
  | 'outstanding'
  | 'successful'
  | 'good'
  | 'needs_improvement'
  | 'risky'
  | 'critical';

export type PerfBand = {
  key: PerfBandKey;
  min: number;
  max: number;
  labelTr: string;
  color: string;
  bg: string;
};

export const PERF_BANDS: PerfBand[] = [
  { key: 'outstanding', min: 90, max: 100, labelTr: 'Üstün Performans', color: '#047857', bg: '#ecfdf5' },
  { key: 'successful', min: 80, max: 89, labelTr: 'Başarılı', color: '#0f766e', bg: '#f0fdfa' },
  { key: 'good', min: 70, max: 79, labelTr: 'İyi', color: '#0369a1', bg: '#e0f2fe' },
  { key: 'needs_improvement', min: 60, max: 69, labelTr: 'Geliştirilmeli', color: '#b45309', bg: '#fffbeb' },
  { key: 'risky', min: 50, max: 59, labelTr: 'Riskli Personel', color: '#c2410c', bg: '#fff7ed' },
  { key: 'critical', min: 0, max: 49, labelTr: 'Kritik Durum', color: '#b91c1c', bg: '#fef2f2' },
];

export function getPerfBand(score: number | null | undefined): PerfBand {
  const s = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
  return PERF_BANDS.find((b) => s >= b.min && s <= b.max) ?? PERF_BANDS[PERF_BANDS.length - 1];
}

export function formatPerfScore(score: number | null | undefined): string {
  if (score == null || Number.isNaN(Number(score))) return '—';
  return `${Math.round(Number(score))}/100`;
}

/** Sık kullanılan hızlı olay şablonları (otomatik puan). */
export const PERF_QUICK_PRESETS: { title: string; delta: number; categorySlug?: string }[] = [
  { title: 'Misafir teşekkür etti', delta: 2, categorySlug: 'guest_satisfaction' },
  { title: 'Fazla mesai yaptı', delta: 1, categorySlug: 'discipline' },
  { title: 'Ayın personeli', delta: 3, categorySlug: 'manager_review' },
  { title: 'Geç kaldı', delta: -2, categorySlug: 'discipline' },
  { title: 'Misafir şikayeti', delta: -5, categorySlug: 'guest_satisfaction' },
  { title: 'Disiplin cezası', delta: -10, categorySlug: 'discipline' },
  { title: 'Üniforma eksikliği', delta: -1, categorySlug: 'discipline' },
  { title: 'Eğitime katılım', delta: 2, categorySlug: 'training' },
  { title: 'Maliyet tasarrufu önerisi', delta: 3, categorySlug: 'hotel_contribution' },
  { title: 'İş güvenliği ihlali', delta: -5, categorySlug: 'security' },
];
