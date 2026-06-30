import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import { MenuItemImageCarousel } from '@/components/hotelKitchenMenu/MenuItemImageCarousel';
import {
  categoryAccentColor,
  menuUi,
  menuWebCardHoverLift,
} from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import {
  coverImageUrl,
  formatMenuPrice,
  resolveLightboxUrlsSync,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';

type Layout = 'grid' | 'list' | 'compact' | 'premium' | 'featured';

type Props = {
  item: HotelKitchenMenuItemWithImages;
  onPress: () => void;
  onImagePress?: () => void;
  layout?: Layout;
  onAddToCart?: () => void;
  cartQuantity?: number;
  themeAccent?: string;
  themeNavy?: string;
};

const COMPACT_THUMB = Platform.OS === 'web' ? 72 : 64;
const PREMIUM_IMAGE_RATIO = 16 / 10;
const FEATURED_HEIGHT = Platform.OS === 'web' ? 200 : 190;

function useItemImageUrls(item: HotelKitchenMenuItemWithImages) {
  return useMemo(() => resolveLightboxUrlsSync(item), [item.id, item.images, item.cover_image_url]);
}

export function PublicKitchenMenuDishCard({
  item,
  onPress,
  onImagePress,
  layout = 'grid',
  onAddToCart,
  cartQuantity = 0,
  themeAccent = menuUi.accent,
  themeNavy = menuUi.navy,
}: Props) {
  const { t } = useTranslation();
  const [imageW, setImageW] = useState(0);
  const imageUrls = useItemImageUrls(item);
  const cover = coverImageUrl(item);
  const catColor = categoryAccentColor(item.category_title);
  const photoCount = item.image_count ?? imageUrls.length;
  const isFeatured = layout === 'featured';
  const isPremium = layout === 'premium';
  const isCompact = layout === 'compact';
  const isGrid = layout === 'grid' && Platform.OS === 'web' && !isCompact && !isPremium && !isFeatured;
  const isList = layout === 'list' || (Platform.OS !== 'web' && layout !== 'grid' && !isPremium && !isFeatured);
  const desc = (item.description ?? '').trim();
  const premiumImageH = imageW > 0 ? Math.round(imageW / PREMIUM_IMAGE_RATIO) : undefined;

  if (isFeatured) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.featuredCard,
          { height: FEATURED_HEIGHT },
          menuUi.shadowMd,
          menuWebCardHoverLift,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
      >
        <View
          style={styles.featuredImageWrap}
          onLayout={(e) => setImageW(e.nativeEvent.layout.width)}
        >
          {imageW > 0 ? (
            <MenuItemImageCarousel
              urls={imageUrls}
              itemId={item.id}
              width={imageW}
              height={FEATURED_HEIGHT}
              recyclingKeyPrefix="featured"
            />
          ) : cover ? (
            <CachedImage uri={cover} style={styles.featuredImage} contentFit="cover" recyclingKey={item.id} priority="high" />
          ) : (
            <View style={[styles.featuredImage, styles.imagePh]}>
              <Ionicons name="restaurant" size={30} color={themeAccent} />
            </View>
          )}
          <LinearGradient colors={['transparent', 'rgba(5, 8, 16, 0.88)']} style={styles.featuredFade} pointerEvents="none" />
          <View style={[styles.featuredAccent, { backgroundColor: themeAccent }]} pointerEvents="none" />
          <View style={[styles.featuredCat, { borderColor: `${themeAccent}88` }]} pointerEvents="none">
            <Text style={styles.featuredCatText} numberOfLines={1}>{item.category_title}</Text>
          </View>
          <View style={styles.featuredBottom} pointerEvents="none">
            <Text style={styles.featuredName} numberOfLines={2}>{item.name}</Text>
            <Text style={[styles.featuredPrice, { color: themeAccent }]}>{formatMenuPrice(item.price)}</Text>
          </View>
        </View>
      </Pressable>
    );
  }

  if (isPremium) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.premiumCard,
          menuUi.shadowMd,
          menuWebCardHoverLift,
          pressed && styles.pressed,
        ]}
        onPress={onPress}
      >
        <View
          style={styles.premiumImageWrap}
          onLayout={(e) => setImageW(e.nativeEvent.layout.width)}
        >
          {imageW > 0 && premiumImageH ? (
            <MenuItemImageCarousel
              urls={imageUrls}
              itemId={item.id}
              width={imageW}
              height={premiumImageH}
              recyclingKeyPrefix="premium"
            />
          ) : cover ? (
            <CachedImage uri={cover} style={styles.premiumImage} contentFit="cover" recyclingKey={item.id} priority="high" />
          ) : (
            <View style={[styles.premiumImage, styles.imagePh]}>
              <Ionicons name="restaurant" size={28} color={themeAccent} />
            </View>
          )}
          {photoCount > 1 ? (
            <View style={styles.photoBadge} pointerEvents="none">
              <Ionicons name="images-outline" size={10} color="#fff" />
              <Text style={styles.photoBadgeText}>{photoCount}</Text>
            </View>
          ) : null}
          <View style={[styles.catPill, { backgroundColor: catColor }]} pointerEvents="none">
            <Text style={styles.catPillText} numberOfLines={1}>{item.category_title}</Text>
          </View>
        </View>

        <View style={styles.premiumBody}>
          <Text style={[styles.premiumName, { color: themeNavy }]} numberOfLines={2}>{item.name}</Text>
          {desc ? <Text style={styles.premiumDesc} numberOfLines={2}>{desc}</Text> : null}
          <View style={styles.premiumFooter}>
            <Text style={[styles.premiumPrice, { color: themeAccent }]}>{formatMenuPrice(item.price)}</Text>
            {onAddToCart ? (
              <Pressable
                style={[
                  styles.addBtn,
                  { borderColor: `${themeAccent}55`, backgroundColor: cartQuantity > 0 ? themeNavy : '#fff' },
                ]}
                onPress={(e) => {
                  e?.stopPropagation?.();
                  onAddToCart();
                }}
              >
                <Ionicons
                  name={cartQuantity > 0 ? 'checkmark' : 'bag-add-outline'}
                  size={16}
                  color={cartQuantity > 0 ? '#fff' : themeNavy}
                />
                <Text style={[styles.addBtnText, { color: cartQuantity > 0 ? '#fff' : themeNavy }]}>
                  {cartQuantity > 0 ? `${cartQuantity}` : t('publicKitchenMenuAddToCart')}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </Pressable>
    );
  }

  if (isCompact) {
    return (
      <Pressable style={[styles.compactCard, menuUi.shadowSm]} onPress={onPress}>
        <View style={[styles.compactAccent, { backgroundColor: catColor }]} />
        <Pressable
          style={styles.compactThumbWrap}
          onPress={(e) => {
            if (cover && onImagePress) {
              e?.stopPropagation?.();
              onImagePress();
            }
          }}
          disabled={!cover || !onImagePress}
        >
          {cover ? (
            <CachedImage uri={cover} style={styles.compactThumb} contentFit="cover" recyclingKey={item.id} priority="high" />
          ) : (
            <View style={[styles.compactThumb, styles.imagePh]}>
              <Ionicons name="restaurant" size={22} color={themeAccent} />
            </View>
          )}
        </Pressable>
        <View style={styles.compactBody}>
          <Text style={[styles.compactCategory, { color: catColor }]} numberOfLines={1}>{item.category_title}</Text>
          <Text style={styles.compactName} numberOfLines={2}>{item.name}</Text>
          {desc ? <Text style={styles.compactDesc} numberOfLines={2}>{desc}</Text> : null}
          <Text style={[styles.compactPrice, { color: themeAccent }]}>{formatMenuPrice(item.price)}</Text>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={[styles.card, isGrid ? styles.cardGrid : styles.cardList, menuUi.shadowSm]} onPress={onPress}>
      <Pressable
        style={[styles.imageWrap, isGrid ? styles.imageWrapGrid : styles.imageWrapList]}
        onPress={(e) => {
          if (cover && onImagePress) {
            e?.stopPropagation?.();
            onImagePress();
          }
        }}
        disabled={!cover || !onImagePress}
      >
        {cover ? (
          <CachedImage uri={cover} style={styles.image} contentFit="cover" recyclingKey={item.id} priority="high" />
        ) : (
          <View style={[styles.image, styles.imagePh]}>
            <Ionicons name="restaurant" size={28} color={themeAccent} />
          </View>
        )}
      </Pressable>
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
        {desc ? <Text style={styles.desc} numberOfLines={2}>{desc}</Text> : null}
        <Text style={styles.price}>{formatMenuPrice(item.price)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.97, transform: [{ scale: 0.992 }] },
  imagePh: { justifyContent: 'center', alignItems: 'center', backgroundColor: menuUi.imagePlaceholder },
  featuredCard: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: menuUi.navy,
    width: '100%',
  },
  featuredImageWrap: { flex: 1, position: 'relative' },
  featuredImage: { width: '100%', height: '100%' },
  featuredFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' },
  featuredAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  featuredCat: {
    position: 'absolute',
    top: 14,
    left: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(5,8,16,0.45)',
  },
  featuredCatText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.6, textTransform: 'uppercase' },
  featuredBottom: { position: 'absolute', left: 14, right: 14, bottom: 14 },
  featuredName: { fontSize: 17, fontWeight: '800', color: '#fff', lineHeight: 22, letterSpacing: -0.3 },
  featuredPrice: { fontSize: 15, fontWeight: '800', marginTop: 6 },
  premiumCard: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: menuUi.border,
    height: '100%',
  },
  premiumImageWrap: { width: '100%', aspectRatio: PREMIUM_IMAGE_RATIO, position: 'relative', backgroundColor: menuUi.imagePlaceholder },
  premiumImage: { width: '100%', height: '100%' },
  photoBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(5, 8, 16, 0.55)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  photoBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  catPill: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    maxWidth: '75%',
  },
  catPillText: { color: '#fff', fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  premiumBody: { padding: 10, gap: 4, flex: 1 },
  premiumName: { fontSize: 14, fontWeight: '800', lineHeight: 18, letterSpacing: -0.15 },
  premiumDesc: { fontSize: 11, lineHeight: 15, color: menuUi.webMuted },
  premiumFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', gap: 4 },
  premiumPrice: { fontSize: 14, fontWeight: '800' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  addBtnText: { fontSize: 10, fontWeight: '800' },
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: menuUi.cardBg,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: menuUi.border,
    marginBottom: 10,
  },
  compactAccent: { width: 3, alignSelf: 'stretch' },
  compactThumbWrap: { margin: 10, width: COMPACT_THUMB, height: COMPACT_THUMB, borderRadius: 12, overflow: 'hidden' },
  compactThumb: { width: '100%', height: '100%' },
  compactBody: { flex: 1, paddingRight: 12, minWidth: 0 },
  compactCategory: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  compactName: { fontSize: 15, fontWeight: '800', color: menuUi.navy, marginTop: 2 },
  compactDesc: { fontSize: 12, lineHeight: 16, color: menuUi.webMuted, marginTop: 2 },
  compactPrice: { fontSize: 15, fontWeight: '800', marginTop: 4 },
  card: { backgroundColor: menuUi.cardBg, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: menuUi.border },
  cardGrid: { flex: Platform.OS === 'web' ? 1 : undefined, minWidth: Platform.OS === 'web' ? 200 : undefined },
  cardList: { width: '100%', flexDirection: 'row', marginBottom: 10 },
  imageWrap: { backgroundColor: menuUi.imagePlaceholder },
  imageWrapGrid: { width: '100%', aspectRatio: 4 / 3 },
  imageWrapList: { width: 88, minHeight: 88 },
  image: { width: '100%', height: '100%' },
  body: { padding: 12, flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: menuUi.navy },
  desc: { fontSize: 12, lineHeight: 16, color: menuUi.webMuted, marginTop: 4 },
  price: { fontSize: 14, fontWeight: '800', color: menuUi.price, marginTop: 6 },
});
