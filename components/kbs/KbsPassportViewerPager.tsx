import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ListRenderItem,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayCapturedName, type KbsCapturedDocumentRow } from '@/lib/kbsCaptureHistory';
import { KbsPersonAvatar } from '@/components/kbs/KbsPersonAvatar';
import { theme } from '@/constants/theme';

const { width: WIN_W } = Dimensions.get('window');

type Props = {
  roommates: KbsCapturedDocumentRow[];
  initialIndex: number;
  canSeeImage: boolean;
  onIndexChange?: (index: number, row: KbsCapturedDocumentRow) => void;
  renderPage: (row: KbsCapturedDocumentRow, index: number) => ReactNode;
};

export function KbsPassportViewerPager({
  roommates,
  initialIndex,
  canSeeImage,
  onIndexChange,
  renderPage,
}: Props) {
  const listRef = useRef<FlatList<KbsCapturedDocumentRow>>(null);
  const [page, setPage] = useState(initialIndex);
  const didScroll = useRef(false);

  useEffect(() => {
    const i = Math.min(Math.max(0, initialIndex), Math.max(0, roommates.length - 1));
    setPage(i);
    if (didScroll.current || roommates.length <= 1) return;
    didScroll.current = true;
    requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({ offset: i * WIN_W, animated: false });
    });
  }, [initialIndex, roommates.length]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(1, WIN_W));
      const clamped = Math.min(Math.max(0, next), Math.max(0, roommates.length - 1));
      setPage(clamped);
      const row = roommates[clamped];
      if (row) onIndexChange?.(clamped, row);
    },
    [onIndexChange, roommates]
  );

  const jumpTo = useCallback(
    (index: number) => {
      const clamped = Math.min(Math.max(0, index), Math.max(0, roommates.length - 1));
      setPage(clamped);
      listRef.current?.scrollToOffset({ offset: clamped * WIN_W, animated: true });
      const row = roommates[clamped];
      if (row) onIndexChange?.(clamped, row);
    },
    [onIndexChange, roommates]
  );

  const renderItem: ListRenderItem<KbsCapturedDocumentRow> = useCallback(
    ({ item, index }) => (
      <View style={{ width: WIN_W, flex: 1 }}>{renderPage(item, index)}</View>
    ),
    [renderPage]
  );

  const getItemLayout = useCallback(
    (_: ArrayLike<KbsCapturedDocumentRow> | null | undefined, index: number) => ({
      length: WIN_W,
      offset: WIN_W * index,
      index,
    }),
    []
  );

  const current = roommates[page];
  const roomLabel = current?.room_number?.trim() || '—';
  const hasMultiple = roommates.length > 1;

  return (
    <View style={styles.root}>
      {hasMultiple ? (
        <View style={styles.navBar}>
          <Pressable
            style={[styles.navBtn, page <= 0 && styles.navBtnDisabled]}
            onPress={() => jumpTo(page - 1)}
            disabled={page <= 0}
            accessibilityLabel="Önceki pasaport"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </Pressable>

          <View style={styles.navCenter}>
            <View style={styles.roomPill}>
              <Ionicons name="bed-outline" size={14} color="#5eead4" />
              <Text style={styles.roomPillText}>Oda {roomLabel}</Text>
            </View>
            <Text style={styles.counterText}>
              {page + 1} / {roommates.length}
            </Text>
          </View>

          <Pressable
            style={[styles.navBtn, page >= roommates.length - 1 && styles.navBtnDisabled]}
            onPress={() => jumpTo(page + 1)}
            disabled={page >= roommates.length - 1}
            accessibilityLabel="Sonraki pasaport"
          >
            <Ionicons name="chevron-forward" size={22} color="#fff" />
          </Pressable>
        </View>
      ) : null}

      {hasMultiple ? (
        <FlatList
          ref={listRef}
          data={roommates}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          windowSize={3}
          removeClippedSubviews
          style={styles.pager}
        />
      ) : (
        <View style={styles.pager}>{current ? renderPage(current, 0) : null}</View>
      )}

      {hasMultiple && canSeeImage ? (
        <View style={styles.thumbStrip}>
          <Text style={styles.thumbStripLabel}>Oda pasaportları</Text>
          <FlatList
            horizontal
            data={roommates}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbStripContent}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => {
              const active = index === page;
              return (
                <Pressable
                  style={[styles.thumbItem, active && styles.thumbItemActive]}
                  onPress={() => jumpTo(index)}
                  accessibilityLabel={displayCapturedName(item)}
                >
                  <KbsPersonAvatar
                    uri={item.front_image_url}
                    size={52}
                    fallbackLabel={displayCapturedName(item)}
                  />
                  {active ? <View style={styles.thumbActiveRing} /> : null}
                </Pressable>
              );
            }}
          />
          <Text style={styles.swipeHint}>Yana kaydırarak diğer pasaportlara geçin</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  navBtnDisabled: { opacity: 0.35 },
  navCenter: { alignItems: 'center', gap: 4 },
  roomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    backgroundColor: 'rgba(13,148,136,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.35)',
  },
  roomPillText: { color: '#ccfbf1', fontSize: 13, fontWeight: '800' },
  counterText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  pager: { flex: 1 },
  thumbStrip: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 10,
    paddingBottom: 12,
  },
  thumbStripLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  thumbStripContent: { paddingHorizontal: 12, gap: 10 },
  thumbItem: {
    borderRadius: 12,
    overflow: 'hidden',
    opacity: 0.65,
  },
  thumbItemActive: { opacity: 1 },
  thumbActiveRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2dd4bf',
  },
  swipeHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
});
