import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '@/components/CachedImage';
import type { KitchenMenuPromoVideo } from '@/lib/kitchenMenuPromoVideo';
import {
  resolvePromoVideoPlayUrl,
  resolvePromoVideoPoster,
} from '@/lib/kitchenMenuPromoVideo';

type Props = {
  visible: boolean;
  videos: KitchenMenuPromoVideo[];
  initialIndex?: number;
  accentColor?: string;
  onClose: () => void;
};

function PromoVideoPlayer({ uri, poster }: { uri: string; poster: string | null }) {
  const ref = useRef<Video>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.isPlaying) setLoading(false);
  };

  return (
    <View style={styles.playerWrap}>
      {poster && loading && !error ? (
        <CachedImage uri={poster} style={StyleSheet.absoluteFillObject} contentFit="cover" />
      ) : null}
      {loading && !error ? (
        <View style={styles.playerOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
      {error ? (
        <View style={styles.playerOverlay}>
          <Ionicons name="alert-circle-outline" size={32} color="#f87171" />
          <Text style={styles.errorText}>Video oynatılamadı</Text>
          <Pressable style={styles.retryBtn} onPress={() => { setError(false); setLoading(true); void ref.current?.replayAsync(); }}>
            <Text style={styles.retryText}>Tekrar dene</Text>
          </Pressable>
        </View>
      ) : (
        <Video
          ref={ref}
          style={styles.video}
          source={{ uri }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping={false}
          posterSource={poster ? { uri: poster } : undefined}
          usePoster={!!poster}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          onPlaybackStatusUpdate={handleStatus}
        />
      )}
    </View>
  );
}

export function PublicKitchenMenuPromoModal({
  visible,
  videos,
  initialIndex = 0,
  accentColor = '#c9a227',
  onClose,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [visible, initialIndex]);

  const current = videos[index];
  const playUrl = current ? resolvePromoVideoPlayUrl(current) : null;
  const poster = current ? resolvePromoVideoPoster(current) : null;

  if (!videos.length) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} accessibilityLabel={t('publicKitchenMenuPromoClose')} />

        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <Ionicons name="film-outline" size={20} color={accentColor} />
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {current?.title ?? t('publicKitchenMenuPromoTitle')}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#e2e8f0" />
            </TouchableOpacity>
          </View>

          {playUrl ? (
            <PromoVideoPlayer key={`${current?.id}-${playUrl}`} uri={playUrl} poster={poster} />
          ) : (
            <View style={[styles.playerWrap, styles.playerOverlay]}>
              <Text style={styles.errorText}>{t('publicKitchenMenuPromoNoUrl')}</Text>
            </View>
          )}

          {videos.length > 1 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.picker}
              contentContainerStyle={styles.pickerInner}
            >
              {videos.map((v, i) => {
                const active = i === index;
                const thumb = resolvePromoVideoPoster(v);
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[styles.pickerChip, active && { borderColor: accentColor, backgroundColor: `${accentColor}22` }]}
                    onPress={() => setIndex(i)}
                  >
                    {thumb ? (
                      <CachedImage uri={thumb} style={styles.pickerThumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.pickerThumb, styles.pickerThumbPlaceholder]}>
                        <Ionicons name="play" size={16} color="#94a3b8" />
                      </View>
                    )}
                    <Text style={[styles.pickerLabel, active && { color: accentColor }]} numberOfLines={2}>
                      {v.title}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : null}

          <Text style={styles.hint}>{t('publicKitchenMenuPromoIntro')}</Text>
        </View>
      </View>
    </Modal>
  );
}

export function promoSessionStorageKey(orgSlug: string): string {
  return `vk-promo-seen:${orgSlug.trim().toLowerCase()}`;
}

export function markPromoSeen(orgSlug: string): void {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(promoSessionStorageKey(orgSlug), '1');
  } catch {
    /* private mode */
  }
}

export function hasSeenPromo(orgSlug: string): boolean {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(promoSessionStorageKey(orgSlug)) === '1';
  } catch {
    return false;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,14,0.82)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    ...Platform.select({
      web: { boxShadow: '0 24px 80px rgba(0,0,0,0.55)' } as object,
      default: {},
    }),
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 12,
  },
  sheetTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheetTitle: { flex: 1, color: '#f8fafc', fontSize: 17, fontWeight: '700' },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: { width: '100%', height: '100%' },
  playerOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 10,
  },
  errorText: { color: '#cbd5e1', fontSize: 14, textAlign: 'center', paddingHorizontal: 16 },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  retryText: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  picker: { maxHeight: 96 },
  pickerInner: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  pickerChip: {
    width: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  pickerThumb: { width: '100%', height: 56 },
  pickerThumbPlaceholder: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#1e293b' },
  pickerLabel: { color: '#94a3b8', fontSize: 11, fontWeight: '600', padding: 6 },
  hint: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 4,
  },
});
