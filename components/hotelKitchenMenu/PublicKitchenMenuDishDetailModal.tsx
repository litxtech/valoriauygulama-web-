import { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import { MenuItemImageCarousel } from '@/components/hotelKitchenMenu/MenuItemImageCarousel';
import { categoryAccentColor, menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';
import {
  coverImageUrl,
  formatMenuPrice,
  resolveLightboxUrls,
  type HotelKitchenMenuItemWithImages,
} from '@/lib/hotelKitchenMenu';
import { HotelKitchenMenuImageLightbox } from '@/components/hotelKitchenMenu/HotelKitchenMenuImageLightbox';

type Props = {
  visible: boolean;
  item: HotelKitchenMenuItemWithImages | null;
  onClose: () => void;
  onAddToCart?: () => void;
  cartQuantity?: number;
};

export function PublicKitchenMenuDishDetailModal({
  visible,
  item,
  onClose,
  onAddToCart,
  cartQuantity = 0,
}: Props) {
  const { t } = useTranslation();
  const { width, height } = useWindowDimensions();
  const [photoIndex, setPhotoIndex] = useState(0);
  const [galleryUrls, setGalleryUrls] = useState<string[]>([]);
  const [galleryW, setGalleryW] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const isWide = width >= 900;
  const modalW = Math.min(width - 24, isWide ? 1080 : width - 24);
  const modalH = Math.min(height - 48, isWide ? 640 : height - 32);

  useEffect(() => {
    if (!visible || !item) {
      setPhotoIndex(0);
      setGalleryUrls([]);
      setLightboxOpen(false);
      return;
    }
    const immediate = item.images.map((im) => im.image_url).filter(Boolean);
    const cover = coverImageUrl(item);
    const seed = cover ? [cover, ...immediate.filter((u) => u !== cover)] : immediate;
    setGalleryUrls(seed);
    setPhotoIndex(0);
    void prefetchImageUrls(seed, 8);
    void resolveLightboxUrls(item).then((urls) => {
      if (!urls.length) return;
      setGalleryUrls(urls);
      void prefetchImageUrls(urls, 8);
    });
  }, [visible, item?.id]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setPhotoIndex((i) => Math.min(galleryUrls.length - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose, galleryUrls.length]);

  const activeUrl = galleryUrls[photoIndex] ?? galleryUrls[0] ?? null;
  const catColor = item ? categoryAccentColor(item.category_title) : menuUi.accent;
  const desc = (item?.description ?? '').trim();
  const photoCount = galleryUrls.length;
  const galleryH = isWide ? modalH - 120 : Math.min(280, modalH * 0.42);

  const gallery = useMemo(
    () => (
      <View style={[styles.galleryCol, isWide && styles.galleryColWide]}>
        <View
          style={[styles.mainImageWrap, { height: galleryH }]}
          onLayout={(e) => setGalleryW(e.nativeEvent.layout.width)}
        >
          <Pressable
            style={{ flex: 1 }}
            onPress={() => galleryUrls.length > 0 && setLightboxOpen(true)}
            disabled={galleryUrls.length === 0}
          >
            {galleryW > 0 ? (
              <MenuItemImageCarousel
                urls={galleryUrls}
                itemId={item?.id ?? 'detail'}
                width={galleryW}
                height={galleryH}
                showArrows
                recyclingKeyPrefix="detail"
                activeIndex={photoIndex}
                onIndexChange={setPhotoIndex}
              />
            ) : activeUrl ? (
            <CachedImage
              uri={activeUrl}
              style={styles.mainImage}
              contentFit="cover"
              priority="high"
              recyclingKey={`detail-${item?.id}-${photoIndex}`}
            />
          ) : (
            <View style={[styles.mainImage, styles.imagePh]}>
              <Ionicons name="restaurant" size={48} color={menuUi.accent} />
            </View>
          )}
          </Pressable>
          <LinearGradient
            colors={['transparent', 'rgba(12, 24, 41, 0.35)']}
            style={styles.imageGradient}
            pointerEvents="none"
          />
        </View>

        {photoCount > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbRow}
            style={styles.thumbScroll}
          >
            {galleryUrls.map((url, idx) => (
              <Pressable
                key={`${url}-${idx}`}
                onPress={() => setPhotoIndex(idx)}
                style={[styles.thumbWrap, idx === photoIndex && styles.thumbWrapActive]}
              >
                <CachedImage uri={url} style={styles.thumb} contentFit="cover" recyclingKey={`thumb-${idx}`} />
              </Pressable>
            ))}
          </ScrollView>
        ) : null}
      </View>
    ),
    [activeUrl, galleryH, galleryUrls, galleryW, isWide, item?.id, photoCount, photoIndex]
  );

  if (!item) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { width: modalW, maxHeight: modalH }]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12} accessibilityLabel={t('close')}>
            <Ionicons name="close" size={22} color={menuUi.navy} />
          </Pressable>

          <View style={[styles.body, isWide && styles.bodyWide]}>
            {gallery}
            <ScrollView
              style={[styles.infoCol, isWide && styles.infoColWide]}
              contentContainerStyle={styles.infoContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.categoryPill, { backgroundColor: `${catColor}18`, borderColor: `${catColor}55` }]}>
                <View style={[styles.categoryDot, { backgroundColor: catColor }]} />
                <Text style={[styles.categoryText, { color: catColor }]}>{item.category_title}</Text>
              </View>

              <Text style={styles.dishName}>{item.name}</Text>

              <View style={styles.priceRow}>
                <Text style={styles.price}>{formatMenuPrice(item.price)}</Text>
                {item.served_in_hotel_restaurant ? (
                  <View style={styles.hotelBadge}>
                    <Ionicons name="business-outline" size={14} color={menuUi.navyMid} />
                    <Text style={styles.hotelBadgeText}>{t('hotelKitchenMenuServedInHotel')}</Text>
                  </View>
                ) : null}
              </View>

              {desc ? (
                <View style={styles.descBlock}>
                  <Text style={styles.descLabel}>{t('hotelKitchenMenuDescLabel')}</Text>
                  <Text style={styles.descText}>{desc}</Text>
                </View>
              ) : null}

              {photoCount > 0 ? (
                <View style={styles.metaRow}>
                  <Ionicons name="images-outline" size={16} color={menuUi.webMuted} />
                  <Text style={styles.metaText}>
                    {t('hotelKitchenMenuPhotoCount', { count: photoCount })}
                  </Text>
                </View>
              ) : null}

              {onAddToCart ? (
                <Pressable
                  style={[styles.addCartBtn, cartQuantity > 0 && styles.addCartBtnActive]}
                  onPress={onAddToCart}
                >
                  <Ionicons
                    name={cartQuantity > 0 ? 'cart' : 'add-circle-outline'}
                    size={22}
                    color={cartQuantity > 0 ? '#fff' : menuUi.navy}
                  />
                  <Text style={[styles.addCartBtnText, cartQuantity > 0 && styles.addCartBtnTextActive]}>
                    {cartQuantity > 0
                      ? t('publicKitchenMenuInCart', { count: cartQuantity })
                      : t('publicKitchenMenuAddToCart')}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>

      <HotelKitchenMenuImageLightbox
        visible={lightboxOpen}
        urls={galleryUrls}
        initialIndex={photoIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(12, 18, 34, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(8px)' } as object) : {}),
  },
  sheet: {
    backgroundColor: menuUi.cardBg,
    borderRadius: 24,
    overflow: 'hidden',
    ...menuUi.shadowLg,
    borderWidth: 1,
    borderColor: menuUi.border,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: menuUi.border,
    ...menuUi.shadowSm,
  },
  body: { flexDirection: 'column' },
  bodyWide: { flexDirection: 'row', minHeight: 520 },
  galleryCol: { width: '100%' },
  galleryColWide: { flex: 1.15, minWidth: 0 },
  mainImageWrap: {
    width: '100%',
    position: 'relative',
    backgroundColor: menuUi.imagePlaceholder,
    overflow: 'hidden',
  },
  mainImage: { width: '100%', height: '100%' },
  imagePh: { alignItems: 'center', justifyContent: 'center' },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
  },
  navBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  navBtnLeft: { left: 12 },
  navBtnRight: { right: 12 },
  navBtnDisabled: { opacity: 0.35 },
  photoCounter: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  photoCounterText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  thumbScroll: { maxHeight: 88 },
  thumbRow: { padding: 14, gap: 10 },
  thumbWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'transparent',
    opacity: 0.72,
  },
  thumbWrapActive: {
    borderColor: menuUi.accent,
    opacity: 1,
    transform: [{ scale: 1.04 }],
  },
  thumb: { width: '100%', height: '100%' },
  infoCol: { flex: 1, minWidth: 0 },
  infoColWide: { flex: 0.85, borderLeftWidth: 1, borderLeftColor: menuUi.border },
  infoContent: { padding: 24, paddingTop: 20, gap: 4 },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 8,
  },
  categoryDot: { width: 7, height: 7, borderRadius: 4 },
  categoryText: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  dishName: {
    fontSize: 28,
    fontWeight: '800',
    color: menuUi.navy,
    letterSpacing: -0.6,
    lineHeight: 34,
    marginBottom: 12,
  },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 },
  price: { fontSize: 26, fontWeight: '800', color: menuUi.price },
  hotelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: menuUi.accentSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  hotelBadgeText: { fontSize: 12, fontWeight: '700', color: menuUi.navyMid },
  descBlock: { marginTop: 8, marginBottom: 12 },
  descLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: menuUi.webMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  descText: { fontSize: 15, lineHeight: 24, color: menuUi.webText, fontWeight: '500' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  metaText: { fontSize: 13, color: menuUi.webMuted, fontWeight: '600' },
  addCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 24,
    backgroundColor: menuUi.accent,
    borderRadius: 16,
    paddingVertical: 16,
    ...menuUi.shadowMd,
  },
  addCartBtnActive: {
    backgroundColor: menuUi.navy,
  },
  addCartBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: menuUi.navy,
  },
  addCartBtnTextActive: {
    color: '#fff',
  },
});
