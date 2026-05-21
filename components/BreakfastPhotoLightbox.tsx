import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Pressable,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '@/components/CachedImage';
import { prefetchImageUrls } from '@/lib/prefetchImageUrls';

type Props = {
  visible: boolean;
  urls: string[];
  initialIndex?: number;
  onClose: () => void;
  accentColor?: string;
};

/**
 * iOS: ScrollView max/minZoom (pinch) — extra native modül gerekmez.
 * Android: RN ScrollView’da zoom yok; yatay sayfa + tam ekran resim. (Gesture handler eklentisi dev client yeniden build istiyordu.)
 */
function LightboxImagePage({ uri, pageW, pageH, iosZoom }: { uri: string; pageW: number; pageH: number; iosZoom: boolean }) {
  if (iosZoom) {
    return (
      <ScrollView
        style={{ width: pageW, height: pageH }}
        contentContainerStyle={{ width: pageW, minHeight: pageH, justifyContent: 'center', alignItems: 'center' }}
        maximumZoomScale={4}
        minimumZoomScale={1}
        centerContent
        bounces
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        <CachedImage uri={uri} style={{ width: pageW, height: pageH }} contentFit="contain" priority="high" recyclingKey={uri} />
      </ScrollView>
    );
  }
  return (
    <View style={{ width: pageW, height: pageH, justifyContent: 'center', alignItems: 'center' }}>
      <CachedImage uri={uri} style={{ width: pageW, height: pageH }} contentFit="contain" priority="high" recyclingKey={uri} />
    </View>
  );
}

export function BreakfastPhotoLightbox({
  visible,
  urls,
  initialIndex = 0,
  onClose,
  accentColor = '#fff',
}: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const list = urls.filter(Boolean);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const imgH = Math.min(height * 0.9, height - insets.top - insets.bottom - 20);
  const iosZoom = Platform.OS === 'ios';

  useEffect(() => {
    if (!visible) return;
    void prefetchImageUrls(list, 8);
    const i = Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1));
    setPage(i);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: i * width, animated: false });
    });
  }, [visible, initialIndex, list, width]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(1, width));
      setPage(Math.min(Math.max(0, next), Math.max(0, list.length - 1)));
    },
    [list.length, width]
  );

  if (!list.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdropRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Kapat" />

        <View pointerEvents="box-none" style={styles.centerColumn}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            keyboardShouldPersistTaps="handled"
            style={{ width, height: imgH }}
            nestedScrollEnabled
          >
            {list.map((uri, index) => (
              <View
                key={`${uri}-${index}`}
                style={{ width, height: imgH, justifyContent: 'center', alignItems: 'center' }}
              >
                <LightboxImagePage uri={uri} pageW={width} pageH={imgH} iosZoom={iosZoom} />
              </View>
            ))}
          </ScrollView>
        </View>

        <View pointerEvents="box-none" style={styles.topBar}>
          <View style={[styles.topBarRow, { top: insets.top + 6 }]}>
            {list.length > 1 ? (
              <View style={styles.counterPill} accessibilityLiveRegion="polite" pointerEvents="auto">
                <Text style={styles.counterText}>
                  {page + 1} / {list.length}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { top: insets.top + 8, right: 12 }]}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.85}
          >
            <Ionicons name="close" size={32} color={accentColor} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)' },
  centerColumn: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    zIndex: 1,
  },
  topBar: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  topBarRow: { position: 'absolute', left: 0, right: 0, paddingLeft: 16 },
  counterPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  counterText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  closeBtn: { position: 'absolute', zIndex: 20, padding: 4 },
});
