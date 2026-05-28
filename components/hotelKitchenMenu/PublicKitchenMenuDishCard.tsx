import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { categoryAccentColor, menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { coverImageUrl, formatMenuPrice, type HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';

type Layout = 'grid' | 'list' | 'compact';

type Props = {
  item: HotelKitchenMenuItemWithImages;
  onPress: () => void;
  onImagePress?: () => void;
  layout?: Layout;
};

const COMPACT_THUMB = Platform.OS === 'web' ? 88 : 76;

export function PublicKitchenMenuDishCard({ item, onPress, onImagePress, layout = 'grid' }: Props) {
  const cover = coverImageUrl(item);
  const catColor = categoryAccentColor(item.category_title);
  const photoCount = item.image_count ?? item.images.length;
  const isCompact = layout === 'compact';
  const isGrid = layout === 'grid' && Platform.OS === 'web' && !isCompact;
  const isList = layout === 'list' || (Platform.OS !== 'web' && layout !== 'grid');
  const desc = (item.description ?? '').trim();

  if (isCompact) {
    return (
      <Pressable
        style={({ pressed }) => [
          styles.compactCard,
          menuUi.shadowSm,
          Platform.OS === 'web' && styles.compactCardWeb,
          pressed && Platform.OS === 'web' && styles.compactCardPressed,
        ]}
        onPress={onPress}
      >
        <View style={[styles.compactAccent, { backgroundColor: catColor }]} />
        <Pressable
          style={[styles.compactThumbWrap, { width: COMPACT_THUMB, height: COMPACT_THUMB }]}
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
              <Ionicons name="restaurant" size={24} color={menuUi.accent} />
            </View>
          )}
          {photoCount > 1 ? (
            <View style={styles.compactPhotoBadge}>
              <Ionicons name="images-outline" size={9} color="#fff" />
              <Text style={styles.compactPhotoBadgeText}>{photoCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={styles.compactBody}>
          <Text style={[styles.compactCategory, { color: catColor }]} numberOfLines={1}>
            {item.category_title}
          </Text>
          <Text style={styles.compactName} numberOfLines={2}>
            {item.name}
          </Text>
          {desc ? (
            <Text style={styles.compactDesc} numberOfLines={2}>
              {desc}
            </Text>
          ) : null}
          <View style={styles.compactFooter}>
            <Text style={styles.compactPrice}>{formatMenuPrice(item.price)}</Text>
            {item.served_in_hotel_restaurant ? (
              <View style={styles.compactHotel}>
                <Ionicons name="business-outline" size={12} color={menuUi.navyMid} />
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color={menuUi.accent} style={styles.compactChevron} />
      </Pressable>
    );
  }

  return (
    <Pressable
      style={[styles.card, isGrid ? styles.cardGrid : styles.cardList, menuUi.shadowSm]}
      onPress={onPress}
    >
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
            <Ionicons name="restaurant" size={32} color={menuUi.accent} />
          </View>
        )}
        {photoCount > 1 ? (
          <View style={styles.photoBadge}>
            <Ionicons name="images-outline" size={11} color="#fff" />
            <Text style={styles.photoBadgeText}>{photoCount}</Text>
          </View>
        ) : null}
        <View style={[styles.catRibbon, { backgroundColor: catColor }]}>
          <Text style={styles.catRibbonText} numberOfLines={1}>
            {item.category_title}
          </Text>
        </View>
      </Pressable>

      <View style={[styles.body, isGrid && styles.bodyGrid]}>
        <Text style={styles.name} numberOfLines={2}>
          {item.name}
        </Text>
        {desc ? (
          <Text style={styles.desc} numberOfLines={isList ? 1 : 2}>
            {desc}
          </Text>
        ) : null}
        <View style={styles.footer}>
          <View style={styles.pricePill}>
            <Text style={styles.price}>{formatMenuPrice(item.price)}</Text>
          </View>
          {item.served_in_hotel_restaurant ? (
            <View style={styles.hotelTag}>
              <Ionicons name="business-outline" size={12} color={menuUi.navyMid} />
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  compactCardWeb: {
    marginBottom: 0,
    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
    cursor: 'pointer',
  } as object,
  compactCardPressed: {
    transform: [{ scale: 0.995 }],
    opacity: 0.96,
  },
  compactAccent: { width: 3, alignSelf: 'stretch' },
  compactThumbWrap: {
    marginLeft: 10,
    marginVertical: 10,
    position: 'relative',
    borderRadius: 10,
    overflow: 'hidden',
  },
  compactThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
    backgroundColor: menuUi.imagePlaceholder,
  },
  compactPhotoBadge: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(26, 54, 93, 0.8)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 8,
  },
  compactPhotoBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  compactBody: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, minWidth: 0 },
  compactCategory: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  compactName: {
    fontSize: 15,
    fontWeight: '800',
    color: menuUi.navy,
    marginTop: 2,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  compactDesc: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748b',
    marginTop: 4,
  },
  compactFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  compactPrice: { fontSize: 15, fontWeight: '800', color: menuUi.price },
  compactHotel: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactChevron: { marginRight: 12, opacity: 0.7 },
  card: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  cardGrid: {
    flex: Platform.OS === 'web' ? 1 : undefined,
    minWidth: Platform.OS === 'web' ? 220 : undefined,
    maxWidth: Platform.OS === 'web' ? 320 : undefined,
  },
  cardList: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  imageWrap: {
    position: 'relative',
    backgroundColor: menuUi.imagePlaceholder,
  },
  imageWrapGrid: {
    width: '100%',
    aspectRatio: 16 / 10,
    maxHeight: Platform.OS === 'web' ? 140 : undefined,
  },
  imageWrapList: {
    width: 96,
    minHeight: 96,
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: Platform.OS === 'web' ? undefined : 88,
  },
  imagePh: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 96,
  },
  catRibbon: {
    position: 'absolute',
    top: 8,
    left: 8,
    maxWidth: '75%',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  catRibbonText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  photoBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(26, 54, 93, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
  },
  photoBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  body: {
    padding: 12,
    flex: 1,
    minWidth: 0,
  },
  bodyGrid: {
    paddingTop: 10,
    paddingBottom: 12,
  },
  name: {
    fontSize: 16,
    fontWeight: '800',
    color: menuUi.navy,
    lineHeight: 21,
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  pricePill: {
    backgroundColor: menuUi.priceBg,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: menuUi.price,
  },
  hotelTag: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: menuUi.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
