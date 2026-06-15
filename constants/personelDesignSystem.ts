/**
 * Personel / feed “premium” görünüm — misafir ve personel aynı kart ve tab sözlüğünü paylaşır.
 */
export const pds = {
  pageBg: '#F9FAFB',
  cardBg: '#FFFFFF',
  text: '#111827',
  subtext: '#6B7280',
  /** Pasif / ikincil etiket (tarih, rol kısaltması) */
  muted: '#6B7280',
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
  /** Story halka — görülmemiş */
  gradientStoryRing: ['#FF8A00', '#FF3CAC'] as [string, string],
  /** Story halka — görülmüş */
  storySeen: '#d1d5db',
  /** “Detayları Gör” + orta FAB */
  gradientPremium: ['#667eea', '#f093fb'] as [string, string],
  /** Ana buton gradyanı */
  gradientPrimary: ['#667eea', '#f093fb'] as [string, string],
  /** İkincil buton — gündüzde arka plansız */
  secondaryBtn: 'transparent',
  shadowCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 25,
    elevation: 4,
  },
  cardBorder: '#E5E7EB',
  cardInnerGlow: 'transparent',
  commentPreviewBg: '#F9FAFB',
  commentPreviewBorder: '#E5E7EB',
  divider: '#F3F4F6',
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

/** Karanlık mod — #666/#777/#888 kullanılmaz; minimum alt metin #A7B0C0 */
export const pdsNight = {
  pageBg: '#0F1117',
  cardBg: '#171923',
  text: '#FFFFFF',
  subtext: '#A7B0C0',
  muted: '#7A8499',
  blue: '#3B82F6',
  indigo: '#7C5CFF',
  purple: '#7C5CFF',
  pink: '#B86EFF',
  orange: '#FACC15',
  online: '#22C55E',
  borderLight: '#232734',
  barGlass: 'rgba(23,25,35,0.88)',
  barGlassStrong: 'rgba(23,25,35,0.94)',
  gradientCta: ['#7C5CFF', '#B86EFF'] as [string, string],
  gradientStoryRing: ['#7C5CFF', '#FF8A00'] as [string, string],
  storySeen: '#555555',
  gradientPremium: ['#7C5CFF', '#B86EFF'] as [string, string],
  gradientPrimary: ['#7C5CFF', '#B86EFF'] as [string, string],
  secondaryBtn: '#232734',
  shadowCard: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  cardBorder: 'rgba(255,255,255,0.06)',
  cardInnerGlow: 'rgba(255,255,255,0.03)',
  commentPreviewBg: 'rgba(255,255,255,0.04)',
  commentPreviewBorder: 'rgba(255,255,255,0.06)',
  divider: 'rgba(255,255,255,0.06)',
  staffFeedBelowHeaderGap: 12,
  headerHeight: 60,
  outerPadding: 16,
  cardGap: 12,
  cardPadding: 12,
  cardRadius: 20,
  mediaRadius: 16,
  actionBtnRadius: 999,
} as const;

export type PersonelDesignPalette = typeof pds;

export function getPersonelDesign(isNight: boolean): PersonelDesignPalette {
  return (isNight ? pdsNight : pds) as PersonelDesignPalette;
}

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
