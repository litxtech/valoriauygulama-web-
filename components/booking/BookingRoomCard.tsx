import { View, Text, StyleSheet, Image, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import type { BookableRoom } from '@/lib/onlineBooking';
import { roomPublicTitle } from '@/lib/onlineBooking';
import { BOOKING_AMENITY_OPTIONS } from '@/components/booking/BookingRoomFilters';

type Props = {
  room: BookableRoom;
  nights: number;
  datesOk: boolean;
  popular?: boolean;
  onPress: () => void;
  wide?: boolean;
  /** 0–100; öğrenci / grup indirimi */
  discountPercent?: number;
  discountBadge?: string;
};

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('tr-TR')} ₺`;
}

/** Modern listing kartı — sade kapak, tek satır meta, fiyat + CTA */
export function BookingRoomCard({
  room,
  nights,
  datesOk,
  popular,
  onPress,
  wide,
  discountPercent = 0,
  discountBadge,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const isWide = wide ?? width >= 760;
  const full = datesOk && room.is_available_for_stay === false;
  const listNight = room.price_per_night;
  const hasDeal = discountPercent > 0 && listNight != null;
  const dealNight = hasDeal
    ? Math.round(listNight! * (1 - discountPercent / 100))
    : listNight;
  const listTotal =
    listNight != null && datesOk && nights >= 1 ? listNight * nights : null;
  const dealTotal =
    dealNight != null && datesOk && nights >= 1 ? dealNight * nights : null;
  const amenityIcons = BOOKING_AMENITY_OPTIONS.filter((a) => room.amenities.includes(a.id)).slice(0, 5);
  const coverH = isWide ? 220 : 200;

  const metaParts = [
    room.max_guests != null ? t('bookingMaxGuests', { n: room.max_guests }) : null,
    room.area_sqm != null ? t('bookingSqm', { n: room.area_sqm }) : null,
    room.bed_type,
  ].filter(Boolean);

  return (
    <TouchableOpacity
      style={[styles.card, isWide && styles.cardWide, full && styles.cardDisabled]}
      onPress={onPress}
      activeOpacity={0.94}
    >
      <View style={[styles.cover, { height: coverH }]}>
        {room.cover_image_url ? (
          <Image source={{ uri: room.cover_image_url }} style={styles.coverImg} resizeMode="cover" />
        ) : (
          <LinearGradient colors={['#dbe7e4', '#c5d5d1']} style={styles.coverFallback}>
            <Ionicons name="bed-outline" size={36} color="rgba(15,23,42,0.28)" />
          </LinearGradient>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(11,18,32,0.35)']}
          style={styles.coverFade}
          pointerEvents="none"
        />

        {(full || popular || hasDeal) && (
          <View
            style={[
              styles.badge,
              full ? styles.badgeFull : hasDeal ? styles.badgeStudent : styles.badgeHot,
            ]}
          >
            {!full && !hasDeal ? <Ionicons name="flame" size={11} color="#fff" /> : null}
            {!full && hasDeal ? <Ionicons name="pricetag" size={11} color="#0f172a" /> : null}
            <Text style={[styles.badgeText, hasDeal && !full && styles.badgeStudentText]}>
              {full
                ? t('bookingRoomFullBadge')
                : hasDeal
                  ? discountBadge || t('bookingDealBadge', { pct: discountPercent })
                  : t('bookingPopularBadge')}
            </Text>
          </View>
        )}

        {room.video_url && !full ? (
          <View style={styles.playMark}>
            <Ionicons name="play" size={12} color="#fff" />
          </View>
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={1}>
            {roomPublicTitle(room)}
          </Text>
          {amenityIcons.length ? (
            <View style={styles.iconRow}>
              {amenityIcons.map((a) => (
                <Ionicons key={a.id} name={a.icon} size={13} color="#94a3b8" />
              ))}
            </View>
          ) : null}
        </View>

        <Text style={styles.meta} numberOfLines={1}>
          {full
            ? t('bookingRoomFullHint')
            : metaParts.join(' · ') || t('bookingRoomReady')}
        </Text>

        <View style={styles.footer}>
          <View style={styles.priceCol}>
            {hasDeal ? (
              <>
                <View style={styles.priceLine}>
                  <Text style={styles.priceStrike}>{money(listNight)}</Text>
                  <Text style={styles.priceStudent}>{money(dealNight)}</Text>
                  <Text style={styles.perNight}> / {t('bookingPerNight')}</Text>
                </View>
                {dealTotal != null && listTotal != null && !full ? (
                  <View style={styles.totalRow}>
                    <Text style={styles.totalStrike}>{money(listTotal)}</Text>
                    <Text style={styles.totalStudent}>
                      {t('bookingStayTotal', { total: money(dealTotal) })}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <View style={styles.priceLine}>
                  <Text style={styles.price}>{money(listNight)}</Text>
                  <Text style={styles.perNight}> / {t('bookingPerNight')}</Text>
                </View>
                {listTotal != null && !full ? (
                  <Text style={styles.total}>{t('bookingStayTotal', { total: money(listTotal) })}</Text>
                ) : (room.sold_count ?? 0) > 2 && !full ? (
                  <Text style={styles.sold}>{t('bookingSoldCount', { n: room.sold_count })}</Text>
                ) : null}
              </>
            )}
          </View>

          <View style={[styles.cta, full && styles.ctaMuted]}>
            <Text style={styles.ctaText}>
              {full ? t('bookingRoomFullBadge') : datesOk ? t('bookingContinue') : '…'}
            </Text>
            {!full ? <Ionicons name="arrow-forward" size={14} color="#fff" /> : null}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.05)',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardWide: { width: '48.5%' },
  cardDisabled: { opacity: 0.58 },
  cover: { backgroundColor: '#e8eef0', position: 'relative' },
  coverImg: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as Record<string, string>) : {}),
  },
  coverFade: { ...StyleSheet.absoluteFillObject },
  coverFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeHot: { backgroundColor: 'rgba(15,118,110,0.92)' },
  badgeFull: { backgroundColor: 'rgba(180,83,9,0.92)' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  playMark: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 14, gap: 6 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: { flex: 1, fontSize: 16, fontWeight: '800', color: '#0b1220', letterSpacing: -0.2 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  footer: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  priceCol: { flex: 1, gap: 2 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  price: { fontSize: 20, fontWeight: '900', color: '#0b1220', letterSpacing: -0.3 },
  priceStrike: {
    fontSize: 14,
    fontWeight: '700',
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  priceStudent: { fontSize: 20, fontWeight: '900', color: '#0f766e', letterSpacing: -0.3 },
  totalRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  totalStrike: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textDecorationLine: 'line-through',
  },
  totalStudent: { fontSize: 12, fontWeight: '700', color: '#0f766e' },
  badgeStudent: { backgroundColor: '#fbbf24' },
  badgeStudentText: { color: '#0f172a' },
  perNight: { fontSize: 12, fontWeight: '600', color: '#94a3b8' },
  total: { fontSize: 12, fontWeight: '700', color: '#0f766e' },
  sold: { fontSize: 11, fontWeight: '600', color: '#94a3b8' },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0f766e',
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 999,
  },
  ctaMuted: { backgroundColor: '#94a3b8' },
  ctaText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
