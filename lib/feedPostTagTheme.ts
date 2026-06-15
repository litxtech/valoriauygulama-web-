import type { PostTagValue } from '@/lib/feedPostTags';

export type FeedPostTagVisual = {
  bar: string;
  badgeBg: string;
  badgeText: string;
  label: string;
  emoji: string;
  avatarGlow: string;
  urgent?: boolean;
};

/** Kurumsal etiketler + mevcut misafir etiketleri */
export function getPostTagVisual(tag: PostTagValue | string | null | undefined): FeedPostTagVisual {
  const t = (tag ?? 'diger').toString().toLowerCase();
  switch (t) {
    case 'acil':
    case 'urgent':
      return {
        bar: '#ef4444',
        badgeBg: 'rgba(239,68,68,0.14)',
        badgeText: '#b91c1c',
        label: 'Acil',
        emoji: '🔴',
        avatarGlow: 'rgba(239,68,68,0.35)',
        urgent: true,
      };
    case 'onemli':
    case 'important':
      return {
        bar: '#f97316',
        badgeBg: 'rgba(249,115,22,0.14)',
        badgeText: '#c2410c',
        label: 'Önemli',
        emoji: '🟠',
        avatarGlow: 'rgba(249,115,22,0.3)',
      };
    case 'bilgilendirme':
    case 'info':
      return {
        bar: '#22c55e',
        badgeBg: 'rgba(34,197,94,0.14)',
        badgeText: '#15803d',
        label: 'Bilgilendirme',
        emoji: '🟢',
        avatarGlow: 'rgba(34,197,94,0.3)',
      };
    case 'duyuru':
    case 'announcement':
      return {
        bar: '#3b82f6',
        badgeBg: 'rgba(59,130,246,0.14)',
        badgeText: '#1d4ed8',
        label: 'Duyuru',
        emoji: '🔵',
        avatarGlow: 'rgba(59,130,246,0.35)',
      };
    case 'egitim':
    case 'training':
      return {
        bar: '#a855f7',
        badgeBg: 'rgba(168,85,247,0.14)',
        badgeText: '#7e22ce',
        label: 'Eğitim',
        emoji: '🟣',
        avatarGlow: 'rgba(168,85,247,0.35)',
      };
    case 'ik':
    case 'hr':
      return {
        bar: '#eab308',
        badgeBg: 'rgba(234,179,8,0.16)',
        badgeText: '#a16207',
        label: 'İnsan Kaynakları',
        emoji: '🟡',
        avatarGlow: 'rgba(234,179,8,0.3)',
      };
    case 'sikayet':
      return {
        bar: '#ef4444',
        badgeBg: 'rgba(239,68,68,0.12)',
        badgeText: '#b91c1c',
        label: 'Şikayet',
        emoji: '🔴',
        avatarGlow: 'rgba(239,68,68,0.35)',
        urgent: true,
      };
    case 'istek':
      return {
        bar: '#2563eb',
        badgeBg: 'rgba(37,99,235,0.12)',
        badgeText: '#1d4ed8',
        label: 'İstek',
        emoji: '🔵',
        avatarGlow: 'rgba(37,99,235,0.35)',
      };
    case 'oneri':
      return {
        bar: '#7c3aed',
        badgeBg: 'rgba(124,58,237,0.12)',
        badgeText: '#6d28d9',
        label: 'Öneri',
        emoji: '🟣',
        avatarGlow: 'rgba(124,58,237,0.35)',
      };
    case 'tesekkur':
      return {
        bar: '#16a34a',
        badgeBg: 'rgba(22,163,74,0.12)',
        badgeText: '#15803d',
        label: 'Teşekkür',
        emoji: '🟢',
        avatarGlow: 'rgba(22,163,74,0.35)',
      };
    case 'soru':
      return {
        bar: '#d97706',
        badgeBg: 'rgba(217,119,6,0.12)',
        badgeText: '#b45309',
        label: 'Soru',
        emoji: '🟠',
        avatarGlow: 'rgba(217,119,6,0.3)',
      };
    default:
      return {
        bar: '#64748b',
        badgeBg: 'rgba(100,116,139,0.12)',
        badgeText: '#475569',
        label: 'Diğer',
        emoji: '⚪',
        avatarGlow: 'rgba(100,116,139,0.25)',
      };
  }
}
