import type { ParsedDocument } from '@/lib/scanner/types';
import { isKbsReturningGuest, formatKbsReturningGuestWarning } from '@/lib/kbsGuestDocumentIdentity';
import {
  KBS_GUEST_NOTE_TAG_META,
  type KbsGuestNote,
  type KbsGuestNoteTag,
} from '@/lib/kbsGuestNotes';

export type KbsGuestRecommendationTone = 'danger' | 'warn' | 'good' | 'info';

export type KbsGuestRecommendation = {
  id: string;
  tone: KbsGuestRecommendationTone;
  title: string;
  detail: string;
  source: 'note' | 'returning' | 'pattern';
  tag?: KbsGuestNoteTag;
};

const TONE_RANK: Record<KbsGuestRecommendationTone, number> = {
  danger: 4,
  warn: 3,
  good: 2,
  info: 1,
};

/**
 * Kimlik detayı / çekim sonrası öneriler:
 * - sorunlu / olay notları → dikkat
 * - VIP / iyi müşteri → olumlu
 * - tekrar gelen → geçmiş hatırlatma
 * - birden fazla olumsuz not → güçlendirilmiş uyarı
 */
export function buildKbsGuestRecommendations(opts: {
  notes: KbsGuestNote[];
  parsed: ParsedDocument | null;
}): KbsGuestRecommendation[] {
  const out: KbsGuestRecommendation[] = [];
  const notes = opts.notes;

  const attention = notes.filter((n) => n.tag === 'problematic' || n.tag === 'incident');
  const good = notes.filter((n) => n.tag === 'good' || n.tag === 'vip');

  if (attention.length > 0) {
    const worst = attention.find((n) => n.tag === 'incident') ?? attention[0]!;
    const meta = KBS_GUEST_NOTE_TAG_META[worst.tag];
    out.push({
      id: `note-attn-${worst.id}`,
      tone: worst.tag === 'incident' ? 'danger' : 'warn',
      title:
        attention.length > 1
          ? `${attention.length} dikkat notu var`
          : meta.label,
      detail: truncate(worst.body, 160),
      source: 'note',
      tag: worst.tag,
    });
  }

  if (good.length > 0 && attention.length === 0) {
    const best = good.find((n) => n.tag === 'vip') ?? good[0]!;
    const meta = KBS_GUEST_NOTE_TAG_META[best.tag];
    out.push({
      id: `note-good-${best.id}`,
      tone: 'good',
      title: meta.label,
      detail: truncate(best.body, 160),
      source: 'note',
      tag: best.tag,
    });
  }

  const returningWarn = formatKbsReturningGuestWarning(opts.parsed);
  if (returningWarn || isKbsReturningGuest(opts.parsed)) {
    out.push({
      id: 'returning',
      tone: attention.length > 0 ? 'warn' : 'info',
      title: 'Daha önce konakladı',
      detail: returningWarn ?? 'Aynı belge numarasıyla önceki bir kayıt bulundu.',
      source: 'returning',
    });
  }

  if (attention.length >= 2) {
    out.push({
      id: 'pattern-repeat-attention',
      tone: 'danger',
      title: 'Tekrarlayan sorun kaydı',
      detail: 'Bu müşteri için birden fazla olumsuz / olay notu mevcut. Resepsiyon ve güvenlik bilgilendirilsin.',
      source: 'pattern',
    });
  }

  if (notes.length > 0 && out.every((r) => r.source !== 'note' || r.tone === 'good')) {
    const latestInfo = notes.find((n) => n.tag === 'info');
    if (latestInfo && attention.length === 0 && good.length === 0) {
      out.push({
        id: `note-info-${latestInfo.id}`,
        tone: 'info',
        title: 'Müşteri notu',
        detail: truncate(latestInfo.body, 160),
        source: 'note',
        tag: 'info',
      });
    }
  }

  return out.sort((a, b) => TONE_RANK[b.tone] - TONE_RANK[a.tone]);
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function kbsRecommendationBannerColors(tone: KbsGuestRecommendationTone): {
  bg: string;
  border: string;
  fg: string;
  icon: string;
} {
  switch (tone) {
    case 'danger':
      return { bg: '#fef2f2', border: '#fecaca', fg: '#991b1b', icon: 'alert-circle' };
    case 'warn':
      return { bg: '#fff7ed', border: '#fed7aa', fg: '#9a3412', icon: 'warning' };
    case 'good':
      return { bg: '#ecfdf5', border: '#a7f3d0', fg: '#065f46', icon: 'checkmark-circle' };
    default:
      return { bg: '#eff6ff', border: '#bfdbfe', fg: '#1e40af', icon: 'information-circle' };
  }
}
