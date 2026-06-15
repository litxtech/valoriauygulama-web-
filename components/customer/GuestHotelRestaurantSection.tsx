import { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { coverImageUrl } from '@/lib/hotelKitchenMenu';
import { formatDiningMenuPriceTry } from '@/lib/diningVenues';
import type { GuestHotelRestaurantVenue } from '@/lib/guestHotelRestaurant';
import type { HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';

type Props = {
  venues: GuestHotelRestaurantVenue[];
  menuItems: HotelKitchenMenuItemWithImages[];
  loading?: boolean;
  textColor: string;
  subColor: string;
  isNight?: boolean;
};

function QuickAction({
  icon,
  label,
  color,
  onPress,
  isNight,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  isNight?: boolean;
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      style={[
        styles.quickAction,
        {
          backgroundColor: isNight ? color + '18' : color + '10',
          borderColor: color + '30',
        },
      ]}
    >
      <View style={[styles.quickActionIcon, { backgroundColor: color + '22' }]}>
        <Ionicons name={icon} size={18} color={color} />
      </View>
      <Text style={[styles.quickActionLabel, { color }]} numberOfLines={2}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

function MenuDishCard({
  item,
  textColor,
  subColor,
  onPress,
  locale,
}: {
  item: HotelKitchenMenuItemWithImages;
  textColor: string;
  subColor: string;
  onPress: () => void;
  locale: string;
}) {
  const cover = coverImageUrl(item);
  return (
    <TouchableOpacity activeOpacity={0.88} onPress={onPress} style={styles.dishCard}>
      {cover ? (
        <CachedImage uri={cover} style={styles.dishImage} contentFit="cover" />
      ) : (
        <View style={[styles.dishImage, styles.dishImagePh]}>
          <Ionicons name="restaurant-outline" size={22} color="#b8860b" />
        </View>
      )}
      <View style={styles.dishBody}>
        <Text style={[styles.dishName, { color: textColor }]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.dishPrice, { color: subColor }]}>{formatDiningMenuPriceTry(locale, item.price)}</Text>
      </View>
    </TouchableOpacity>
  );
}

export const GuestHotelRestaurantSection = memo(function GuestHotelRestaurantSection({
  venues,
  menuItems,
  loading,
  textColor,
  subColor,
  isNight,
}: Props) {
  const router = useRouter();
  const { i18n } = useTranslation();
  const primaryVenue = venues[0] ?? null;
  const hasContent = venues.length > 0 || menuItems.length > 0;

  if (!loading && !hasContent) return null;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.sectionLabel, { color: subColor }]}>{feedSharedText('guestPulseRestaurantTitle')}</Text>

      {loading && !hasContent ? (
        <ActivityIndicator color="#b8860b" style={styles.loader} />
      ) : null}

      {primaryVenue ? (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => router.push(`/customer/dining-venues/${primaryVenue.id}`)}
          style={[styles.venueCard, { borderColor: isNight ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' }]}
        >
          {primaryVenue.coverImage ? (
            <CachedImage uri={primaryVenue.coverImage} style={styles.venueCover} contentFit="cover" />
          ) : (
            <LinearGradient colors={['#2c1810', '#4a2c2a']} style={styles.venueCover}>
              <Ionicons name="restaurant" size={36} color="rgba(255,255,255,0.5)" />
            </LinearGradient>
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.venueOverlay}>
            <View style={styles.venueTopRow}>
              {primaryVenue.isOpenNow ? (
                <View style={[styles.openPill, styles.openPillOn]}>
                  <Text style={styles.openPillText}>{feedSharedText('guestPulseRestaurantOpen')}</Text>
                </View>
              ) : (
                <View style={[styles.openPill, styles.openPillOff]}>
                  <Text style={styles.openPillText}>{feedSharedText('guestPulseRestaurantClosed')}</Text>
                </View>
              )}
            </View>
            <Text style={styles.venueName} numberOfLines={2}>
              {primaryVenue.name}
            </Text>
            {primaryVenue.openingHours ? (
              <View style={styles.venueMetaRow}>
                <Ionicons name="time-outline" size={12} color="rgba(255,255,255,0.85)" />
                <Text style={styles.venueMeta} numberOfLines={1}>
                  {primaryVenue.openingHours}
                </Text>
              </View>
            ) : null}
            {primaryVenue.menuPeek.length > 0 ? (
              <Text style={styles.venuePeek} numberOfLines={1}>
                {primaryVenue.menuPeek.join(' · ')}
              </Text>
            ) : null}
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      <View style={styles.quickRow}>
        <QuickAction
          icon="book-outline"
          label={feedSharedText('guestPulseRestaurantMenu')}
          color="#b45309"
          isNight={isNight}
          onPress={() => router.push('/customer/hotel-menu')}
        />
        <QuickAction
          icon="bed-outline"
          label={feedSharedText('guestPulseRestaurantRoomService')}
          color="#6366f1"
          isNight={isNight}
          onPress={() => router.push('/customer/room-service/')}
        />
        <QuickAction
          icon="map-outline"
          label={feedSharedText('guestPulseRestaurantAllVenues')}
          color="#0ea5e9"
          isNight={isNight}
          onPress={() => router.push('/customer/dining-venues')}
        />
      </View>

      {menuItems.length > 0 ? (
        <>
          <Text style={[styles.featuredLabel, { color: textColor }]}>{feedSharedText('guestPulseRestaurantFeatured')}</Text>
          <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dishRow}>
            {menuItems.map((item) => (
              <MenuDishCard
                key={item.id}
                item={item}
                textColor={textColor}
                subColor={subColor}
                locale={i18n.language}
                onPress={() => router.push(`/customer/hotel-menu/${item.id}`)}
              />
            ))}
          </ScrollView>
        </>
      ) : !loading ? (
        <Text style={[styles.emptyHint, { color: subColor }]}>{feedSharedText('guestPulseRestaurantEmpty')}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  loader: { marginVertical: 12 },
  venueCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 10,
    borderWidth: 1,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
      android: { elevation: 3 },
    }),
  },
  venueCover: { width: '100%', height: 140, alignItems: 'center', justifyContent: 'center' },
  venueOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 36,
  },
  venueTopRow: { flexDirection: 'row', marginBottom: 6 },
  openPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  openPillOn: { backgroundColor: 'rgba(34,197,94,0.85)' },
  openPillOff: { backgroundColor: 'rgba(148,163,184,0.85)' },
  openPillText: { fontSize: 9, fontWeight: '800', color: '#fff', letterSpacing: 0.3 },
  venueName: { fontSize: 18, fontWeight: '900', color: '#fff', letterSpacing: -0.3 },
  venueMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  venueMeta: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.88)', flex: 1 },
  venuePeek: { fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  quickActionIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  quickActionLabel: { fontSize: 10, fontWeight: '800', textAlign: 'center', lineHeight: 12 },
  featuredLabel: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
  dishRow: { gap: 10, paddingRight: 4 },
  dishCard: {
    width: 118,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  dishImage: { width: '100%', height: 88 },
  dishImagePh: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(184,134,11,0.08)' },
  dishBody: { padding: 8, gap: 2 },
  dishName: { fontSize: 12, fontWeight: '800', lineHeight: 15 },
  dishPrice: { fontSize: 11, fontWeight: '700' },
  emptyHint: { fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
});
