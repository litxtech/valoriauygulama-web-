import { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { guestServiceText } from '@/lib/guestServiceRequestsI18n';
import { pds } from '@/constants/personelDesignSystem';
import i18n from '@/i18n';

const ACCENT = '#b8860b';

type HotelInfo = {
  name: string | null;
  description: string | null;
  address: string | null;
  stars: number | null;
};

type Props = {
  hotel: HotelInfo | null;
  displayName: string;
};

export const GuestFeedHeroWelcome = memo(function GuestFeedHeroWelcome({ hotel, displayName }: Props) {
  const router = useRouter();
  const { isNight, colors } = usePremiumTheme();
  const text = isNight ? colors.text : pds.text;
  const sub = isNight ? colors.subtext : pds.subtext;

  const hotelName = hotel?.name?.trim() || feedSharedText('guestPulseHotelBrand');
  const firstName = (displayName || feedSharedText('guestPulseHotelBrand')).trim().split(/\s+/)[0] || displayName;
  const stars = Math.min(5, Math.max(0, hotel?.stars ?? 0));

  const quickActions = [
    { icon: 'restaurant-outline' as const, label: i18n.t('screenRoomService'), href: '/customer/room-service/' },
    { icon: 'cafe-outline' as const, label: i18n.t('screenHotelKitchenMenu'), href: '/customer/hotel-menu' },
    { icon: 'sparkles-outline' as const, label: guestServiceText('type_room_cleaning'), href: '/customer/service-requests/new?type=room_cleaning' },
    { icon: 'information-circle-outline' as const, label: guestServiceText('hotelInfoTitle'), href: '/customer/hotel-info' },
  ];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={isNight ? ['#1a1508', '#2a2210', '#1f1a0d'] : ['#fff9eb', '#fff4d6', '#fff9eb']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { borderColor: ACCENT + (isNight ? '40' : '30') }]}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroLeft}>
            <Text style={[styles.kicker, { color: ACCENT }]}>{feedSharedText('guestPulseLiveBadge')}</Text>
            <Text style={[styles.greeting, { color: text }]}>
              {feedSharedText('guestWelcomeHi', { name: firstName })}
            </Text>
            <Text style={[styles.hotelName, { color: text }]} numberOfLines={2}>
              {hotelName}
            </Text>
            {stars > 0 ? (
              <View style={styles.starsRow}>
                {Array.from({ length: stars }).map((_, i) => (
                  <Ionicons key={i} name="star" size={13} color={ACCENT} />
                ))}
              </View>
            ) : null}
          </View>
          <LinearGradient colors={['#c9971c', '#b8860b']} style={styles.heroIcon}>
            <Ionicons name="sparkles" size={22} color="#fff" />
          </LinearGradient>
        </View>

        {hotel?.description?.trim() ? (
          <Text style={[styles.description, { color: sub }]} numberOfLines={3}>
            {hotel.description.trim()}
          </Text>
        ) : null}

        {hotel?.address?.trim() ? (
          <TouchableOpacity
            style={[styles.locationChip, { backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.75)' }]}
            onPress={() => router.push('/customer/hotel-info')}
            activeOpacity={0.85}
          >
            <Ionicons name="location-outline" size={14} color={ACCENT} />
            <Text style={[styles.locationText, { color: text }]} numberOfLines={2}>
              {hotel.address.trim()}
            </Text>
          </TouchableOpacity>
        ) : null}

        <ScrollQuickActions actions={quickActions} textColor={text} isNight={isNight} onPress={(href) => router.push(href as never)} />
      </LinearGradient>
    </View>
  );
});

function ScrollQuickActions({
  actions,
  textColor,
  isNight,
  onPress,
}: {
  actions: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[];
  textColor: string;
  isNight: boolean;
  onPress: (href: string) => void;
}) {
  return (
    <View style={styles.quickRow}>
      {actions.map((a) => (
        <TouchableOpacity
          key={a.href}
          style={[styles.quickBtn, { backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.85)', borderColor: ACCENT + '25' }]}
          onPress={() => onPress(a.href)}
          activeOpacity={0.85}
        >
          <Ionicons name={a.icon} size={18} color={ACCENT} />
          <Text style={[styles.quickLabel, { color: textColor }]} numberOfLines={2}>
            {a.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: 12 },
  hero: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: ACCENT, shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
      android: { elevation: 4 },
    }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  heroLeft: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  greeting: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginTop: 4, lineHeight: 28 },
  hotelName: { fontSize: 14, fontWeight: '700', marginTop: 4, lineHeight: 20 },
  starsRow: { flexDirection: 'row', gap: 2, marginTop: 6 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: { fontSize: 13, lineHeight: 19, marginBottom: 10 },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ACCENT + '22',
    marginBottom: 12,
    maxWidth: '100%',
  },
  locationText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 16 },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 68,
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 9, fontWeight: '800', textAlign: 'center', lineHeight: 12 },
});
