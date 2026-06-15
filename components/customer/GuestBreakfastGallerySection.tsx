import { memo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';
import { feedSharedText } from '@/lib/feedSharedI18n';
import type { GuestBreakfastGalleryItem } from '@/lib/guestBreakfastGallery';

type Props = {
  items: GuestBreakfastGalleryItem[];
  loading?: boolean;
  textColor: string;
  subColor: string;
  isNight?: boolean;
  compact?: boolean;
};

type LightboxState = {
  urls: string[];
  index: number;
  title: string;
  subtitle: string;
};

function formatBreakfastDate(iso: string): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

function BreakfastCard({
  item,
  width,
  subColor,
  isNight,
  onOpen,
}: {
  item: GuestBreakfastGalleryItem;
  width: number;
  subColor: string;
  isNight: boolean;
  onOpen: () => void;
}) {
  const cover = item.photo_urls[0] ?? null;
  const dateLabel = formatBreakfastDate(item.record_date);
  const guestLabel = feedSharedText('guestPulseBreakfastGuestCount', { count: item.guest_count });
  const hasPhotos = item.photo_urls.length > 0;

  return (
    <TouchableOpacity
      activeOpacity={0.92}
      onPress={hasPhotos ? onOpen : undefined}
      style={[
        styles.card,
        {
          width,
          backgroundColor: isNight ? 'rgba(255,255,255,0.05)' : '#fff',
          borderColor: isNight ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      <View style={styles.mediaWrap}>
        {cover ? (
          <CachedImage uri={cover} style={styles.cover} contentFit="cover" recyclingKey={`bf-guest-${item.id}`} />
        ) : (
          <LinearGradient colors={['#fef3c7', '#fde68a', '#fcd34d']} style={styles.coverPlaceholder}>
            <Ionicons name="cafe" size={36} color="#b45309" />
          </LinearGradient>
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.72)']} style={styles.mediaGradient} />
        <View style={styles.mediaTopRow}>
          <View style={styles.datePill}>
            <Ionicons name="calendar-outline" size={11} color="#fff" />
            <Text style={styles.datePillText}>{dateLabel}</Text>
          </View>
          {item.photo_urls.length > 1 ? (
            <View style={styles.countPill}>
              <Ionicons name="images" size={11} color="#fff" />
              <Text style={styles.countPillText}>{item.photo_urls.length}</Text>
            </View>
          ) : null}
        </View>
        {hasPhotos ? (
          <View style={styles.expandHint}>
            <Ionicons name="expand-outline" size={14} color="#fff" />
          </View>
        ) : null}
        <View style={styles.mediaCaption}>
          <Text style={styles.mediaCaptionTitle}>{feedSharedText('guestPulseBreakfastGalleryTitle')}</Text>
          <View style={styles.mediaCaptionRow}>
            <Ionicons name="people" size={12} color="#fcd34d" />
            <Text style={styles.mediaCaptionMeta}>{guestLabel}</Text>
          </View>
        </View>
      </View>
      {item.note ? (
        <View style={styles.cardFooter}>
          <Text style={[styles.note, { color: subColor }]} numberOfLines={2}>
            {item.note}
          </Text>
        </View>
      ) : (
        <View style={[styles.cardFooterCompact, { borderTopColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
          <Text style={[styles.tapHint, { color: subColor }]}>
            {hasPhotos ? feedSharedText('guestPulseBreakfastTapHint') : guestLabel}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export const GuestBreakfastGallerySection = memo(function GuestBreakfastGallerySection({
  items,
  loading = false,
  textColor,
  subColor,
  isNight = false,
  compact = false,
}: Props) {
  const { width } = useWindowDimensions();
  const cardW = compact ? Math.min(width * 0.62, 240) : Math.min(width * 0.68, 272);
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  if (loading && items.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color="#d97706" />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <Text style={[styles.empty, { color: subColor }]}>{feedSharedText('guestPulseBreakfastEmpty')}</Text>
    );
  }

  return (
    <>
      <ScrollView
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {items.map((item) => (
          <BreakfastCard
            key={item.id}
            item={item}
            width={cardW}
            subColor={subColor}
            isNight={isNight}
            onOpen={() =>
              setLightbox({
                urls: item.photo_urls,
                index: 0,
                title: formatBreakfastDate(item.record_date),
                subtitle: [
                  feedSharedText('guestPulseBreakfastGuestCount', { count: item.guest_count }),
                  item.note?.trim(),
                ]
                  .filter(Boolean)
                  .join(' · '),
              })
            }
          />
        ))}
      </ScrollView>

      <BreakfastPhotoLightbox
        visible={lightbox != null}
        urls={lightbox?.urls ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
        accentColor="#fef3c7"
        title={lightbox?.title}
        subtitle={lightbox?.subtitle}
      />
    </>
  );
});

const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: 20, alignItems: 'center' },
  empty: { fontSize: 13, fontStyle: 'italic', lineHeight: 20, paddingVertical: 6 },
  row: { gap: 14, paddingVertical: 4, paddingRight: 4 },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#d97706',
        shadowOpacity: 0.14,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 4 },
    }),
  },
  mediaWrap: { height: 168, position: 'relative', backgroundColor: '#1c1917' },
  cover: { width: '100%', height: '100%' },
  coverPlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  mediaGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  mediaTopRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  datePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.42)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  datePillText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  countPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(217,119,6,0.85)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
  },
  countPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  expandHint: {
    position: 'absolute',
    right: 10,
    bottom: 52,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  mediaCaption: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    gap: 4,
  },
  mediaCaptionTitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  mediaCaptionMeta: { color: '#fff', fontSize: 13, fontWeight: '800' },
  mediaCaptionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardFooter: { paddingHorizontal: 12, paddingVertical: 10 },
  cardFooterCompact: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  note: { fontSize: 12, lineHeight: 17, fontWeight: '500' },
  tapHint: { fontSize: 11, fontWeight: '600' },
});
