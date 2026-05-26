import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function LightboxImagePage({
  uri,
  pageW,
  pageH,
  iosZoom,
}: {
  uri: string;
  pageW: number;
  pageH: number;
  iosZoom: boolean;
}) {
  if (Platform.OS === 'web') {
    return (
      <View style={[styles.webPage, { width: pageW, height: pageH }]}>
        <CachedImage
          uri={uri}
          style={styles.webImage}
          contentFit="contain"
          priority="high"
          recyclingKey={uri}
        />
      </View>
    );
  }

  if (iosZoom) {
    return (
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
        <CachedImage
          uri={uri}
          style={{ width: pageW, height: pageH }}
          contentFit="contain"
          priority="high"
          recyclingKey={uri}
        />
      </ScrollView>
    );
  }

  return (
    <View style={{ width: pageW, height: pageH, justifyContent: 'center', alignItems: 'center' }}>
      <CachedImage
        uri={uri}
        style={{ width: pageW, height: pageH }}
        contentFit="contain"
        priority="high"
        recyclingKey={uri}
      />
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
  const list = useMemo(() => urls.filter(Boolean), [urls]);
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const didInitialScroll = useRef(false);
  const isWeb = Platform.OS === 'web';
  const pageW = isWeb ? width : width;
  const pageH = isWeb
    ? Math.max(320, height - insets.top - insets.bottom - 24)
    : Math.min(height * 0.9, height - insets.top - insets.bottom - 20);
  const iosZoom = Platform.OS === 'ios';

  useEffect(() => {
    if (!visible) {
      didInitialScroll.current = false;
      return;
    }
    void prefetchImageUrls(list, 8);
    if (didInitialScroll.current) return;
    didInitialScroll.current = true;
    const i = Math.min(Math.max(0, initialIndex), Math.max(0, list.length - 1));
    setPage(i);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ x: i * pageW, animated: false });
    });
  }, [visible, initialIndex, list, pageW]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(1, pageW));
      setPage(Math.min(Math.max(0, next), Math.max(0, list.length - 1)));
    },
    [list.length, pageW]
  );

  if (!list.length) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdropRoot}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />

        <View pointerEvents="box-none" style={styles.centerColumn}>
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            keyboardShouldPersistTaps="handled"
            style={{ width: pageW, height: pageH }}
            contentContainerStyle={{ alignItems: 'center' }}
            nestedScrollEnabled
          >
            {list.map((uri, index) => (
              <View
                key={`${uri}-${index}`}
                style={{ width: pageW, height: pageH, justifyContent: 'center', alignItems: 'center' }}
              >
                <LightboxImagePage uri={uri} pageW={pageW} pageH={pageH} iosZoom={iosZoom} />
              </View>
            ))}
          </ScrollView>
        </View>

        <View pointerEvents="box-none" style={styles.topBar}>
          <View style={[styles.topBarRow, { top: insets.top + 8 }]}>
            {list.length > 1 ? (
              <View style={styles.counterPill} accessibilityLiveRegion="polite" pointerEvents="auto">
                <Text style={styles.counterText}>
                  {page + 1} / {list.length}
                </Text>
              </View>
            ) : null}
          </View>
          <TouchableOpacity
            style={[styles.closeBtn, { top: insets.top + 10, right: isWeb ? 20 : 12 }]}
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.85}
          >
            <View style={styles.closeBtnBg}>
              <Ionicons name="close" size={28} color={accentColor} />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropRoot: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.94)' },
  centerColumn: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  webPage: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  webImage: {
    width: '92%',
    height: '92%',
    maxWidth: 1100,
    maxHeight: 900,
  },
  topBar: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  topBarRow: { position: 'absolute', left: 0, right: 0, paddingLeft: 20 },
  counterPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  counterText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  closeBtn: { position: 'absolute', zIndex: 20 },
  closeBtnBg: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 24,
    padding: 6,
  },
});
