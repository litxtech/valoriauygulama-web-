import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { categoryAccentColor, menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import {
  coverImageUrl,
  formatMenuPrice,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';

type Props = {
  item: HotelKitchenMenuItemWithImages;
  onPress: () => void;
  onImagePress?: () => void;
  variant?: 'browse' | 'manage';
  showFavorite?: boolean;
  favorited?: boolean;
  trailingIcon?: keyof typeof Ionicons.glyphMap;
};

export function HotelKitchenMenuListCard({
  item,
  onPress,
  onImagePress,
  variant = 'browse',
  showFavorite,
  favorited,
  trailingIcon = 'chevron-forward',
}: Props) {
  const { t } = useTranslation();
  const cover = coverImageUrl(item);
  const isManage = variant === 'manage';
  const photoCount = item.image_count ?? item.images.length;
  const catColor = categoryAccentColor(item.category_title);
  const desc = (item.description ?? '').trim();
  const thumbSize = isManage ? 72 : 76;

  if (isManage) {
    return (
      <TouchableOpacity style={[styles.manageCard, menuUi.shadowSm]} activeOpacity={0.88} onPress={onPress}>
        <View style={[styles.manageAccent, { backgroundColor: catColor }]} />
        <Pressable
          style={styles.manageImageWrap}
          onPress={cover && onImagePress ? onImagePress : undefined}
          disabled={!cover || !onImagePress}
        >
          {cover ? (
            <CachedImage uri={cover} style={styles.manageImage} contentFit="cover" recyclingKey={item.id} />
          ) : (
            <View style={[styles.manageImage, styles.imagePh]}>
              <Ionicons name="restaurant" size={28} color={menuUi.accent} />
            </View>
          )}
        </Pressable>
        <View style={styles.manageBody}>
          <Text style={[styles.manageCategory, { color: catColor }]} numberOfLines={1}>
            {item.category_title}
          </Text>
          <Text style={styles.manageName} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={styles.managePrice}>{formatMenuPrice(item.price)}</Text>
          {!item.is_available ? (
            <View style={styles.hiddenPill}>
              <Text style={styles.hiddenPillText}>{t('hotelKitchenMenuHidden')}</Text>
            </View>
          ) : null}
        </View>
        <Ionicons name={trailingIcon} size={22} color={menuUi.accent} style={styles.manageChevron} />
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={[styles.browseCard, menuUi.shadowSm]} activeOpacity={0.92} onPress={onPress}>
      <View style={[styles.browseAccent, { backgroundColor: catColor }]} />
      <Pressable
        onPress={cover && onImagePress ? onImagePress : undefined}
        disabled={!cover || !onImagePress}
        style={[styles.browseThumbWrap, { width: thumbSize, height: thumbSize }]}
      >
        {cover ? (
          <CachedImage
            uri={cover}
            style={styles.browseThumb}
            contentFit="cover"
            recyclingKey={item.id}
            priority="high"
          />
        ) : (
          <View style={[styles.browseThumb, styles.imagePh]}>
            <Ionicons name="restaurant" size={26} color={menuUi.accent} />
          </View>
        )}
        {showFavorite && favorited ? (
          <View style={styles.browseFavDot}>
            <Ionicons name="heart" size={10} color="#fff" />
          </View>
        ) : null}
        {photoCount > 1 ? (
          <View style={styles.browsePhotoBadge}>
            <Ionicons name="images" size={9} color="#fff" />
            <Text style={styles.browsePhotoBadgeText}>{photoCount}</Text>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.browseBody}>
        <Text style={[styles.browseCategory, { color: catColor }]} numberOfLines={1}>
          {item.category_title}
        </Text>
        <Text style={styles.browseName} numberOfLines={2}>
          {item.name}
        </Text>
        {desc ? (
          <Text style={styles.browseDesc} numberOfLines={1}>
            {desc}
          </Text>
        ) : null}
        <View style={styles.browseFooter}>
          <Text style={styles.browsePrice}>{formatMenuPrice(item.price)}</Text>
          {item.served_in_hotel_restaurant ? (
            <Ionicons name="business-outline" size={14} color={menuUi.accentDeep} />
          ) : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={20} color={menuUi.accent} style={styles.browseChevron} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  browseCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: menuUi.cardBg,
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: menuUi.border,
  },
  browseAccent: { width: 3, alignSelf: 'stretch' },
  browseThumbWrap: { marginLeft: 10, marginVertical: 10, position: 'relative' },
  browseThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
    backgroundColor: menuUi.imagePlaceholder,
  },
  imagePh: { justifyContent: 'center', alignItems: 'center', backgroundColor: menuUi.imagePlaceholder },
  browseFavDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: menuUi.favorite,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: menuUi.cardBg,
  },
  browsePhotoBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
  },
  browsePhotoBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  browseBody: { flex: 1, paddingVertical: 10, paddingHorizontal: 10, minWidth: 0 },
  browseCategory: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  browseName: { fontSize: 15, fontWeight: '700', color: theme.colors.text, marginTop: 2, lineHeight: 19 },
  browseDesc: { fontSize: 12, lineHeight: 16, color: theme.colors.textSecondary, marginTop: 2 },
  browseFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  browsePrice: { fontSize: 14, fontWeight: '800', color: menuUi.price },
  browseChevron: { marginRight: 10 },
  manageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: menuUi.cardBg,
    borderRadius: 16,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  manageAccent: { width: 4, alignSelf: 'stretch' },
  manageImageWrap: { marginLeft: 10, marginVertical: 10 },
  manageImage: { width: 72, height: 72, borderRadius: 14 },
  manageBody: { flex: 1, paddingVertical: 12, paddingHorizontal: 12 },
  manageCategory: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  manageName: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginTop: 3 },
  managePrice: { fontSize: 15, fontWeight: '700', color: menuUi.price, marginTop: 4 },
  hiddenPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#fef3c7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  hiddenPillText: { fontSize: 10, fontWeight: '700', color: '#b45309' },
  manageChevron: { marginRight: 14 },
});
