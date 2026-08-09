/**
 * Personel / misafir feed — canlı Valoria paleti (göl, gün batımı amber, soft paper).
 * Mor–indigo klişesinden uzak; hareket ve sıcak kontrast.
 */
export const pds = {
  pageBg: '#FFFFFF',
  cardBg: '#FFFFFF',
  text: '#0A1A18',
  subtext: '#4A635E',
  muted: '#6B857F',
  blue: '#0EA5E9',
  indigo: '#0F766E',
  purple: '#0D9488',
  pink: '#E11D48',
  orange: '#F59E0B',
  online: '#22C55E',
  borderLight: '#E8EEEC',
  barGlass: 'rgba(255,255,255,0.92)',
  barGlassStrong: 'rgba(255,255,255,0.97)',
  /** Compose / CTA — amber → teal */
  gradientCta: ['#F59E0B', '#0D9488'] as [string, string],
  /** Story unseen — dönen halka renkleri */
  gradientStoryRing: ['#F59E0B', '#FB7185', '#0D9488', '#38BDF8', '#F59E0B'] as string[],
  storySeen: '#B8CBC6',
  gradientPremium: ['#0F766E', '#14B8A6'] as [string, string],
  gradientPrimary: ['#0F766E', '#2DD4BF'] as [string, string],
  /** Story şeridi arka plan */
  gradientStoryRail: ['#FFFFFF', '#FFFFFF', '#FFFFFF'] as [string, string, string],
  /** Canlı üst şerit */
  gradientLiveStrip: ['#0F766E', '#0D9488', '#F59E0B'] as [string, string, string],
  secondaryBtn: 'transparent',
  shadowCard: {
    shadowColor: '#0B3D36',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 22,
    elevation: 4,
  },
  cardBorder: 'rgba(15, 118, 110, 0.12)',
  cardInnerGlow: 'transparent',
  commentPreviewBg: '#FFFFFF',
  commentPreviewBorder: '#E5E7EB',
  divider: 'rgba(15, 118, 110, 0.1)',
  accent: '#0F766E',
  accentSoft: 'rgba(15, 118, 110, 0.12)',
  gold: '#D97706',
  coral: '#FB7185',
  staffFeedBelowHeaderGap: 8,
  headerHeight: 60,
  outerPadding: 14,
  cardGap: 12,
  cardPadding: 14,
  cardRadius: 24,
  mediaRadius: 18,
  actionBtnRadius: 999,
} as const;

/** Karanlık mod — derin orman + amber kıvılcım */
export const pdsNight = {
  pageBg: '#061210',
  cardBg: '#0C1A18',
  text: '#F0FDFA',
  subtext: '#9DB5AF',
  muted: '#6F8781',
  blue: '#38BDF8',
  indigo: '#2DD4BF',
  purple: '#14B8A6',
  pink: '#FB7185',
  orange: '#FBBF24',
  online: '#4ADE80',
  borderLight: '#1A2E2A',
  barGlass: 'rgba(12,26,24,0.92)',
  barGlassStrong: 'rgba(12,26,24,0.97)',
  gradientCta: ['#FBBF24', '#14B8A6'] as [string, string],
  gradientStoryRing: ['#FBBF24', '#FB7185', '#2DD4BF', '#38BDF8', '#FBBF24'] as string[],
  storySeen: '#3D524D',
  gradientPremium: ['#0D9488', '#2DD4BF'] as [string, string],
  gradientPrimary: ['#0D9488', '#2DD4BF'] as [string, string],
  gradientStoryRail: ['#0A1F1C', '#1A1510', '#0A1F1C'] as [string, string, string],
  gradientLiveStrip: ['#0D9488', '#14B8A6', '#FBBF24'] as [string, string, string],
  secondaryBtn: '#1A2E2A',
  shadowCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 18,
    elevation: 7,
  },
  cardBorder: 'rgba(45, 212, 191, 0.14)',
  cardInnerGlow: 'rgba(255,255,255,0.04)',
  commentPreviewBg: 'rgba(255,255,255,0.05)',
  commentPreviewBorder: 'rgba(255,255,255,0.08)',
  divider: 'rgba(255,255,255,0.08)',
  accent: '#2DD4BF',
  accentSoft: 'rgba(45, 212, 191, 0.16)',
  gold: '#FBBF24',
  coral: '#FB7185',
  staffFeedBelowHeaderGap: 8,
  headerHeight: 60,
  outerPadding: 14,
  cardGap: 12,
  cardPadding: 14,
  cardRadius: 24,
  mediaRadius: 18,
  actionBtnRadius: 999,
} as const;

export type PersonelDesignPalette = typeof pds;

export function getPersonelDesign(isNight: boolean): PersonelDesignPalette {
  return (isNight ? pdsNight : pds) as PersonelDesignPalette;
}

/** Feed tek fotoğraf: 4:5 */
export const FEED_POST_MEDIA_HEIGHT_RATIO = 1.25;

/** Video önizleme: 16:9 */
export const FEED_VIDEO_MEDIA_HEIGHT_RATIO = 9 / 16;

export function feedPostCardWidth(screenWidth: number, sideInsetPerEdge = pds.outerPadding) {
  return screenWidth - sideInsetPerEdge * 2;
}

/**
 * Premium kart: medya kartın tam içerik genişliğinde (avatar sütunu yok).
 * Yatay inset = kart margin; padding = kart iç padding.
 */
export function feedPostMediaContentWidth(
  screenWidth: number,
  sideInsetPerEdge = pds.outerPadding,
  cardPadding = pds.cardPadding
) {
  return feedPostCardWidth(screenWidth, sideInsetPerEdge) - cardPadding * 2;
}

export function feedMediaHeight(
  contentWidth: number,
  ratio = FEED_POST_MEDIA_HEIGHT_RATIO,
  maxHeight = 520
) {
  return Math.min(Math.round(contentWidth * ratio), maxHeight);
}

/**
 * Kart tam genişliği — medya kenardan kenara (avatar sütunu düşülmez).
 * Eski X layout için `feedPostMediaContentWidth` kullan.
 */
export function feedXMediaWidth(screenWidth: number, horizontalInset = 12) {
  return feedPostCardWidth(screenWidth, horizontalInset);
}

export function feedPostMediaHeight(cardWidth: number) {
  return Math.round(cardWidth * FEED_POST_MEDIA_HEIGHT_RATIO);
}

export function feedPostVideoMediaHeight(cardWidth: number) {
  return Math.round(cardWidth * FEED_VIDEO_MEDIA_HEIGHT_RATIO);
}

/** Videolu gönderi: büyük önizleme; yalnızca fotoğraf: aynı oran. */
export function feedPostMediaHeightForItems(
  cardWidth: number,
  items: { media_type: 'image' | 'video' }[]
) {
  if (items.length > 0 && items.some((m) => m.media_type === 'video')) {
    return feedPostVideoMediaHeight(cardWidth);
  }
  return feedPostMediaHeight(cardWidth);
}
