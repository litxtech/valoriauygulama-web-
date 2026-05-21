import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { HotelKitchenMenuImageLightbox } from '@/components/hotelKitchenMenu/HotelKitchenMenuImageLightbox';
import { categoryAccentColor, menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import {
  coverImageUrl,
  fetchGuestFavoriteItemIds,
  fetchHotelKitchenMenuItemById,
  formatMenuPrice,
  toggleHotelKitchenMenuFavorite,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import { openHotelMenuLightbox } from '@/lib/openHotelMenuLightbox';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

type Props = {
  itemId: string;
  mode: 'guest' | 'staff';
};

export function HotelKitchenMenuDetail({ itemId, mode }: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [item, setItem] = useState<HotelKitchenMenuItemWithImages | null>(null);
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const load = useCallback(async () => {
    const [row, favIds] = await Promise.all([
      fetchHotelKitchenMenuItemById(itemId),
      mode === 'guest' ? fetchGuestFavoriteItemIds() : Promise.resolve(new Set<string>()),
    ]);
    setItem(row);
    if (mode === 'guest') setFavorited(favIds.has(itemId));
  }, [itemId, mode]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch(() => setItem(null))
      .finally(() => setLoading(false));
  }, [load]);

  useEffect(() => {
    if (!item?.images?.length) return;
    void prefetchImageUrls(item.images.map((im) => im.image_url), 8);
  }, [item?.id, item?.images]);

  const onToggleFavorite = async () => {
    if (mode !== 'guest') return;
    setToggling(true);
    try {
      const next = await toggleHotelKitchenMenuFavorite(itemId);
      setFavorited(next);
      Alert.alert(
        next ? t('hotelKitchenMenuFavAddedTitle') : t('hotelKitchenMenuFavRemovedTitle'),
        next ? t('hotelKitchenMenuFavAddedBody') : t('hotelKitchenMenuFavRemovedBody')
      );
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('unknownErrorShort'));
    } finally {
      setToggling(false);
    }
  };

  const openLightbox = (index: number) => {
    if (!item) return;
    openHotelMenuLightbox(item, setLightbox, index);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: menuUi.warmBg }]}>
        <ActivityIndicator size="large" color={menuUi.accent} />
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.centered, { backgroundColor: menuUi.warmBg }]}>
        <Text style={styles.emptyText}>{t('hotelKitchenMenuItemNotFound')}</Text>
      </View>
    );
  }

  const heroH = Math.min(width * 0.78, 340);
  const cover = coverImageUrl(item);
  const thumbs = item.images;
  const catColor = categoryAccentColor(item.category_title);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.heroWrap, { height: heroH }]}>
          {cover ? (
            <Pressable onPress={() => openLightbox(0)} style={StyleSheet.absoluteFill}>
              <CachedImage uri={cover} style={StyleSheet.absoluteFill} contentFit="cover" priority="high" />
            </Pressable>
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroPh]}>
              <Ionicons name="restaurant" size={72} color={menuUi.accent} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.65)']}
            style={styles.heroGrad}
            pointerEvents="none"
          />
          {cover ? (
            <Pressable style={styles.heroZoom} onPress={() => openLightbox(0)}>
              <Ionicons name="expand-outline" size={20} color="#fff" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.sheet}>
          <View style={[styles.catPill, { backgroundColor: catColor }]}>
            <Text style={styles.catPillText}>{item.category_title}</Text>
          </View>

          <Text style={styles.name}>{item.name}</Text>

          <View style={styles.priceRow}>
            <View style={styles.priceMain}>
              <Text style={styles.priceLabel}>{t('hotelKitchenMenuPriceLabel')}</Text>
              <Text style={styles.price}>{formatMenuPrice(item.price)}</Text>
            </View>
          </View>

          {item.served_in_hotel_restaurant ? (
            <View style={styles.hotelBadge}>
              <Ionicons name="business-outline" size={18} color={menuUi.accentDeep} />
              <Text style={styles.hotelBadgeText}>{t('hotelKitchenMenuServedInHotel')}</Text>
            </View>
          ) : null}

          {thumbs.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.thumbRow}
              contentContainerStyle={styles.thumbRowContent}
            >
              {thumbs.map((im, i) => (
                <Pressable key={im.id} onPress={() => openLightbox(i)} style={styles.thumbWrap}>
                  <CachedImage uri={im.image_url} style={styles.thumb} contentFit="cover" />
                  {i === 0 ? (
                    <View style={styles.thumbCoverTag}>
                      <Text style={styles.thumbCoverTagText}>1</Text>
                    </View>
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {item.description ? (
            <View style={styles.descCard}>
              <Text style={styles.descTitle}>{t('hotelKitchenMenuDescLabel')}</Text>
              <Text style={styles.desc}>{item.description}</Text>
            </View>
          ) : null}

          {mode === 'guest' ? (
            <TouchableOpacity
              style={[styles.favBtn, favorited && styles.favBtnOn]}
              onPress={onToggleFavorite}
              disabled={toggling}
              activeOpacity={0.88}
            >
              {toggling ? (
                <ActivityIndicator color={favorited ? '#fff' : menuUi.favorite} />
              ) : (
                <>
                  <Ionicons
                    name={favorited ? 'heart' : 'heart-outline'}
                    size={24}
                    color={favorited ? '#fff' : menuUi.favorite}
                  />
                  <Text style={[styles.favBtnText, favorited && styles.favBtnTextOn]}>
                    {favorited ? t('hotelKitchenMenuRemoveFavorite') : t('hotelKitchenMenuAddFavorite')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          {mode === 'guest' && favorited ? (
            <Text style={styles.favHint}>{t('hotelKitchenMenuFavKitchenHint')}</Text>
          ) : null}
        </View>
      </ScrollView>

      <HotelKitchenMenuImageLightbox
        visible={!!lightbox}
        urls={lightbox?.urls ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: menuUi.warmBg },
  content: { paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 16, color: theme.colors.textSecondary },
  heroWrap: { width: '100%', backgroundColor: menuUi.imagePlaceholder, position: 'relative' },
  heroPh: { justifyContent: 'center', alignItems: 'center', backgroundColor: menuUi.imagePlaceholder },
  heroGrad: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '50%' },
  heroZoom: {
    position: 'absolute',
    right: 16,
    bottom: 36,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 22,
    padding: 10,
  },
  sheet: {
    marginTop: -28,
    marginHorizontal: 16,
    backgroundColor: menuUi.cardBg,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 24,
    ...menuUi.shadow,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,134,11,0.12)',
  },
  catPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginBottom: 10,
  },
  catPillText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 26,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.4,
    lineHeight: 32,
  },
  priceRow: { marginTop: 14 },
  priceMain: {
    backgroundColor: menuUi.priceBg,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(184,134,11,0.2)',
  },
  priceLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.textMuted, textTransform: 'uppercase' },
  price: { fontSize: 24, fontWeight: '800', color: menuUi.price, marginTop: 2 },
  hotelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: menuUi.accentSoft,
  },
  hotelBadgeText: { fontSize: 13, color: menuUi.accentDeep, fontWeight: '600', flexShrink: 1 },
  thumbRow: { marginTop: 16, marginHorizontal: -4 },
  thumbRowContent: { gap: 10, paddingRight: 8 },
  thumbWrap: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  thumb: { width: 80, height: 80, borderRadius: 14 },
  thumbCoverTag: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: menuUi.accent,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbCoverTagText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  descCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 14,
    backgroundColor: menuUi.warmBg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  descTitle: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 6 },
  desc: { fontSize: 15, lineHeight: 23, color: theme.colors.textSecondary },
  favBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 22,
    paddingVertical: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: menuUi.favorite,
    backgroundColor: '#fff',
  },
  favBtnOn: { backgroundColor: menuUi.favorite, borderColor: menuUi.favorite },
  favBtnText: { fontSize: 16, fontWeight: '800', color: menuUi.favorite },
  favBtnTextOn: { color: '#fff' },
  favHint: {
    fontSize: 13,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 18,
  },
});
