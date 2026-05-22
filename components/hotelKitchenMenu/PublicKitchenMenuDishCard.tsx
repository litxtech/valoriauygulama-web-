import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { categoryAccentColor, menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import { coverImageUrl, formatMenuPrice, type HotelKitchenMenuItemWithImages } from '@/lib/hotelKitchenMenu';

type Props = {
  item: HotelKitchenMenuItemWithImages;
  onPress: () => void;
  onImagePress?: () => void;
  layout?: 'grid' | 'list';
};

export function PublicKitchenMenuDishCard({ item, onPress, onImagePress, layout = 'grid' }: Props) {
  const cover = coverImageUrl(item);
  const catColor = categoryAccentColor(item.category_title);
  const photoCount = item.image_count ?? item.images.length;
  const isGrid = layout === 'grid' && Platform.OS === 'web';
  const desc = (item.description ?? '').trim();

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
        <Text style={styles.name} numberOfLines={isGrid ? 2 : 2}>
          {item.name}
        </Text>
        {desc ? (
          <Text style={styles.desc} numberOfLines={isGrid ? 2 : 1}>
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
  card: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  cardGrid: {
    flex: Platform.OS === 'web' ? 1 : undefined,
    minWidth: Platform.OS === 'web' ? 260 : undefined,
    maxWidth: Platform.OS === 'web' ? 400 : undefined,
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
    aspectRatio: 4 / 3,
  },
  imageWrapList: {
    width: 108,
    minHeight: 108,
  },
  image: {
    width: '100%',
    height: '100%',
    minHeight: Platform.OS === 'web' ? undefined : 88,
  },
  imagePh: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 160,
  },
  catRibbon: {
    position: 'absolute',
    top: 10,
    left: 10,
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
    bottom: 10,
    right: 10,
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
    padding: 14,
    flex: 1,
    minWidth: 0,
  },
  bodyGrid: {
    paddingTop: 12,
    paddingBottom: 14,
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: menuUi.navy,
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  desc: {
    fontSize: 13,
    lineHeight: 18,
    color: '#64748b',
    marginTop: 6,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
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
