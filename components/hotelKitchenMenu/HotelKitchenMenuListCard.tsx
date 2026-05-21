import { View, Text, StyleSheet, TouchableOpacity, Pressable, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
  const { width } = useWindowDimensions();
  const cover = coverImageUrl(item);
  const isManage = variant === 'manage';
  const photoCount = item.image_count ?? item.images.length;
  const catColor = categoryAccentColor(item.category_title);
  const desc = (item.description ?? '').trim();
  const imageH = isManage ? 88 : Math.min(width - 40, 220) * 0.55;

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
    <TouchableOpacity style={[styles.browseCard, menuUi.shadow]} activeOpacity={0.92} onPress={onPress}>
      <Pressable
        onPress={cover && onImagePress ? onImagePress : undefined}
        disabled={!cover || !onImagePress}
        style={[styles.browseImageWrap, { height: imageH }]}
      >
        {cover ? (
          <CachedImage
            uri={cover}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            recyclingKey={item.id}
            priority="normal"
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.imagePh]}>
            <Ionicons name="restaurant" size={48} color={menuUi.accent} />
          </View>
        )}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.55)']}
          style={styles.imageGrad}
          pointerEvents="none"
        />
        <View style={[styles.catChip, { backgroundColor: catColor }]}>
          <Text style={styles.catChipText} numberOfLines={1}>
            {item.category_title}
          </Text>
        </View>
        {showFavorite && favorited ? (
          <View style={styles.favBadge}>
            <Ionicons name="heart" size={16} color="#fff" />
          </View>
        ) : null}
        {photoCount > 1 ? (
          <View style={styles.photoPill}>
            <Ionicons name="images" size={12} color="#fff" />
            <Text style={styles.photoPillText}>{photoCount}</Text>
          </View>
        ) : null}
        {cover && onImagePress ? (
          <View style={styles.zoomHint}>
            <Ionicons name="expand-outline" size={16} color="#fff" />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.browseBody}>
        <Text style={styles.browseName} numberOfLines={2}>
          {item.name}
        </Text>
        {desc ? (
          <Text style={styles.browseDesc} numberOfLines={2}>
            {desc}
          </Text>
        ) : null}
        <View style={styles.browseFooter}>
          <View style={styles.pricePill}>
            <Text style={styles.priceText}>{formatMenuPrice(item.price)}</Text>
          </View>
          <View style={styles.footerRight}>
            {item.served_in_hotel_restaurant ? (
              <View style={styles.hotelBadge}>
                <Ionicons name="business-outline" size={13} color={menuUi.accentDeep} />
                <Text style={styles.hotelBadgeText} numberOfLines={1}>
                  {t('hotelKitchenMenuServedInHotel')}
                </Text>
              </View>
            ) : null}
            <Ionicons name="arrow-forward-circle" size={28} color={menuUi.accent} />
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  browseCard: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 20,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(184,134,11,0.15)',
  },
  browseImageWrap: {
    width: '100%',
    backgroundColor: menuUi.imagePlaceholder,
    position: 'relative',
  },
  imageGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '45%',
  },
  imagePh: { justifyContent: 'center', alignItems: 'center', backgroundColor: menuUi.imagePlaceholder },
  catChip: {
    position: 'absolute',
    top: 12,
    left: 12,
    maxWidth: '70%',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  catChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  favBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: menuUi.favorite,
    alignItems: 'center',
    justifyContent: 'center',
    ...menuUi.shadowSm,
  },
  photoPill: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  photoPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  zoomHint: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    padding: 6,
  },
  browseBody: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 },
  browseName: {
    fontSize: 19,
    fontWeight: '800',
    color: theme.colors.text,
    letterSpacing: -0.3,
    lineHeight: 24,
  },
  browseDesc: {
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.textSecondary,
    marginTop: 6,
  },
  browseFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    gap: 8,
  },
  pricePill: {
    backgroundColor: menuUi.priceBg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(184,134,11,0.25)',
  },
  priceText: { fontSize: 17, fontWeight: '800', color: menuUi.price },
  footerRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  hotelBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: menuUi.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    maxWidth: '72%',
  },
  hotelBadgeText: { fontSize: 10, fontWeight: '600', color: menuUi.accentDeep, flexShrink: 1 },
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
