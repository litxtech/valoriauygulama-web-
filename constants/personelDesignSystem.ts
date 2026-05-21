/**
 * Personel / feed “premium” görünüm — misafir ve personel aynı kart ve tab sözlüğünü paylaşır.
 */
export const pds = {
  pageBg: '#F9FAFB',
  cardBg: '#FFFFFF',
  text: '#111827',
  subtext: '#6B7280',
  blue: '#3B82F6',
  indigo: '#6366F1',
  purple: '#8B5CF6',
  pink: '#EC4899',
  orange: '#F59E0B',
  online: '#22C55E',
  borderLight: '#EEEEEE',
  /** Header / tab: cam hissi (blur ile birleşir) */
  barGlass: 'rgba(255,255,255,0.88)',
  barGlassStrong: 'rgba(255,255,255,0.94)',
  /** Sol +, önemli CTA (turuncu–pembe) */
  gradientCta: ['#FF8A00', '#FF3CAC'] as [string, string],
  /** Story halka */
  gradientStoryRing: ['#FF8A00', '#FF3CAC'] as [string, string],
  /** “Detayları Gör” + orta FAB */
  gradientPremium: ['#667eea', '#f093fb'] as [string, string],
  shadowCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 25,
    elevation: 4,
  },
  /** Feed içeriğinin opak header sonrası üst nefes payı (px) */
  staffFeedBelowHeaderGap: 12,
  headerHeight: 60,
  outerPadding: 16,
  cardGap: 12,
  cardPadding: 12,
  cardRadius: 20,
  mediaRadius: 16,
  actionBtnRadius: 999,
} as const;

/** Feed gönderi medyası: 4:5 (yükseklik = genişlik × oran) */
export const FEED_POST_MEDIA_HEIGHT_RATIO = 1.25;

/** Video önizleme: 4:5 (fotoğraflarla aynı yükseklik; 16:9 çok küçük kalıyordu) */
export const FEED_VIDEO_MEDIA_HEIGHT_RATIO = FEED_POST_MEDIA_HEIGHT_RATIO;

export function feedPostCardWidth(screenWidth: number, sideInsetPerEdge = pds.outerPadding) {
  return screenWidth - sideInsetPerEdge * 2;
}

export function feedPostMediaHeight(cardWidth: number) {
  return Math.round(cardWidth * FEED_POST_MEDIA_HEIGHT_RATIO);
}

export function feedPostVideoMediaHeight(cardWidth: number) {
  return Math.round(cardWidth * FEED_VIDEO_MEDIA_HEIGHT_RATIO);
}

/** Videolu gönderi: büyük 4:5 önizleme; yalnızca fotoğraf: aynı oran. */
export function feedPostMediaHeightForItems(
  cardWidth: number,
  items: { media_type: 'image' | 'video' }[]
) {
  if (items.length > 0 && items.some((m) => m.media_type === 'video')) {
    return feedPostVideoMediaHeight(cardWidth);
  }
  return feedPostMediaHeight(cardWidth);
}
