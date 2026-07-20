import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';
import {
  formatBreakfastMenuDate,
  loadPublicMenuBreakfastGallery,
  type PublicMenuBreakfastItem,
} from '@/lib/publicMenuBreakfastGallery';
import type { PublicMenuLang } from '@/lib/publicKitchenMenuLang';

type Props = {
  organizationId: string;
  menuLang: PublicMenuLang;
  accentColor?: string;
};

const AMBER = '#F59E0B';
const AMBER_BORDER = '#FDE68A';
const AMBER_SOFT = 'rgba(254, 243, 199, 0.55)';

export function PublicKitchenMenuBreakfastGallery({
  organizationId,
  menuLang,
  accentColor = AMBER,
}: Props) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const [items, setItems] = useState<PublicMenuBreakfastItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<{
    urls: string[];
    index: number;
    title: string;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void loadPublicMenuBreakfastGallery(organizationId).then((rows) => {
      if (cancelled) return;
      setItems(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={accentColor} />
      </View>
    );
  }

  if (items.length === 0) return null;

  const cardW = Math.min(width >= 900 ? 280 : width * 0.72, 300);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <View style={[styles.headAccent, { backgroundColor: accentColor }]} />
        <Text style={styles.title}>{t('publicMenuBreakfastTitle')}</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nestedScrollEnabled
        contentContainerStyle={styles.row}
        decelerationRate="fast"
      >
        {items.map((item) => {
          const dateLabel = formatBreakfastMenuDate(item.record_date, menuLang);
          const cover = item.photo_urls[0] ?? null;
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.92}
              style={[styles.card, { width: cardW, borderColor: AMBER_BORDER }]}
              onPress={() =>
                setLightbox({
                  urls: item.photo_urls,
                  index: 0,
                  title: dateLabel,
                })
              }
            >
              <View style={styles.mediaWrap}>
                {cover ? (
                  <CachedImage
                    uri={cover}
                    style={styles.cover}
                    contentFit="cover"
                    recyclingKey={`pub-bf-${item.id}`}
                  />
                ) : (
                  <LinearGradient colors={['#fef3c7', '#fde68a', '#fcd34d']} style={styles.cover}>
                    <Ionicons name="cafe" size={36} color="#b45309" />
                  </LinearGradient>
                )}
                <LinearGradient colors={['transparent', 'rgba(15,23,42,0.5)']} style={styles.mediaFade} />
                <View style={styles.datePill}>
                  <Text style={styles.datePillText}>{dateLabel}</Text>
                </View>
                {item.photo_urls.length > 1 ? (
                  <View style={styles.countPill}>
                    <Ionicons name="images" size={11} color="#fff" />
                    <Text style={styles.countPillText}>{item.photo_urls.length}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <BreakfastPhotoLightbox
        visible={lightbox != null}
        urls={lightbox?.urls ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
        accentColor="#fef3c7"
        title={lightbox?.title}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 8,
    marginBottom: 18,
    paddingHorizontal: 16,
  },
  loadingWrap: { paddingVertical: 18, alignItems: 'center' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  headAccent: {
    width: 3,
    height: 22,
    borderRadius: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
    flex: 1,
  },
  row: { gap: 14, paddingRight: 8, paddingVertical: 2 },
  card: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: AMBER_SOFT,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(255, 251, 235, 0.58)',
      } as object,
      ios: {
        shadowColor: '#d97706',
        shadowOpacity: 0.12,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  mediaWrap: {
    height: 168,
    backgroundColor: '#1c1917',
    position: 'relative',
  },
  cover: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaFade: {
    ...StyleSheet.absoluteFillObject,
  },
  datePill: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    backgroundColor: 'rgba(15,23,42,0.72)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  datePillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  countPill: {
    position: 'absolute',
    top: 12,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(217,119,6,0.88)',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  countPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
