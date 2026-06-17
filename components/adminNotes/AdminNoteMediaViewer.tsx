import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  ActivityIndicator,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '@/components/CachedImage';
import type { AdminQuickNoteMediaRow } from '@/lib/adminQuickNotes';
import { shareQuickNoteMedia } from '@/lib/adminQuickNoteShare';

type Props = {
  visible: boolean;
  media: AdminQuickNoteMediaRow[];
  initialIndex?: number;
  noteNumber: string;
  onClose: () => void;
};

export function AdminNoteMediaViewer({ visible, media, initialIndex = 0, noteNumber, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const videoRefs = useRef<Record<number, Video | null>>({});
  const [page, setPage] = useState(0);
  const [sharing, setSharing] = useState(false);
  const pageW = width;
  const pageH = height - insets.top - insets.bottom - 80;

  const items = media ?? [];
  const current = items[page];

  useEffect(() => {
    if (!visible) {
      Object.values(videoRefs.current).forEach((v) => void v?.pauseAsync());
      return;
    }
    const i = Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1));
    setPage(i);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: i * pageW, animated: false });
    });
  }, [visible, initialIndex, items.length, pageW]);

  useEffect(() => {
    if (!visible) return;
    Object.entries(videoRefs.current).forEach(([idx, ref]) => {
      const n = Number(idx);
      if (n !== page) void ref?.pauseAsync();
    });
    if (current?.media_type === 'video') {
      void videoRefs.current[page]?.playAsync();
    }
  }, [visible, page, current?.media_type]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(1, pageW));
      setPage(Math.min(Math.max(0, next), Math.max(0, items.length - 1)));
    },
    [items.length, pageW]
  );

  const onShare = async () => {
    if (!current || sharing) return;
    setSharing(true);
    try {
      await shareQuickNoteMedia(current, noteNumber);
    } finally {
      setSharing(false);
    }
  };

  if (!items.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} accessibilityLabel="Kapat">
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.counter}>
            {page + 1} / {items.length}
          </Text>
          <TouchableOpacity style={styles.iconBtn} onPress={onShare} disabled={sharing} accessibilityLabel="Paylaş">
            {sharing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="share-outline" size={22} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: 'center' }}
        >
          {items.map((m, idx) => (
            <View key={m.id} style={{ width: pageW, height: pageH, justifyContent: 'center', alignItems: 'center' }}>
              {m.media_type === 'image' ? (
                Platform.OS === 'ios' ? (
                  <ScrollView
                    style={{ width: pageW, height: pageH }}
                    contentContainerStyle={{
                      width: pageW,
                      minHeight: pageH,
                      justifyContent: 'center',
                      alignItems: 'center',
                    }}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    centerContent
                    bounces
                    showsHorizontalScrollIndicator={false}
                    showsVerticalScrollIndicator={false}
                    nestedScrollEnabled
                  >
                    <CachedImage uri={m.public_url} style={{ width: pageW, height: pageH }} contentFit="contain" priority="high" />
                  </ScrollView>
                ) : (
                  <CachedImage
                    uri={m.public_url}
                    style={{ width: pageW * 0.94, height: pageH * 0.88 }}
                    contentFit="contain"
                    priority="high"
                  />
                )
              ) : (
                <Video
                  ref={(r) => {
                    videoRefs.current[idx] = r;
                  }}
                  source={{ uri: m.public_url }}
                  style={{ width: pageW * 0.94, height: pageH * 0.75 }}
                  resizeMode={ResizeMode.CONTAIN}
                  useNativeControls
                  shouldPlay={idx === page}
                  isLooping={false}
                />
              )}
            </View>
          ))}
        </ScrollView>

        <View style={[styles.bottomHint, { paddingBottom: insets.bottom + 12 }]}>
          <Text style={styles.hintText}>
            {current?.media_type === 'video' ? 'Video oynatıcı — kaydırarak diğer ekler' : 'Tam ekran görsel'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  counter: { color: '#fff', fontWeight: '800', fontSize: 14 },
  bottomHint: { alignItems: 'center', paddingTop: 8 },
  hintText: { color: 'rgba(255,255,255,0.55)', fontSize: 11 },
});
