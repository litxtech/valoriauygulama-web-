import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { menuUi } from '@/components/hotelKitchenMenu/hotelKitchenMenuUi';

type Props = {
  urls: string[];
  itemId: string;
  width: number;
  height: number;
  onPress?: () => void;
  showArrows?: boolean;
  recyclingKeyPrefix?: string;
  activeIndex?: number;
  onIndexChange?: (index: number) => void;
};

export function MenuItemImageCarousel({
  urls,
  itemId,
  width,
  height,
  onPress,
  showArrows = false,
  recyclingKeyPrefix = 'menu-carousel',
  activeIndex,
  onIndexChange,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [internalIndex, setInternalIndex] = useState(0);
  const index = activeIndex ?? internalIndex;

  const setIndex = useCallback(
    (next: number) => {
      if (onIndexChange) onIndexChange(next);
      else setInternalIndex(next);
    },
    [onIndexChange]
  );

  const count = urls.length;

  const goTo = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(count - 1, next));
      setIndex(clamped);
      scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    },
    [count, setIndex, width]
  );

  useEffect(() => {
    if (activeIndex === undefined || width <= 0) return;
    scrollRef.current?.scrollTo({ x: activeIndex * width, animated: false });
  }, [activeIndex, width]);

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const next = Math.round(x / Math.max(width, 1));
      setIndex(Math.max(0, Math.min(count - 1, next)));
    },
    [count, setIndex, width]
  );

  if (count === 0) {
    return (
      <Pressable
        style={[styles.slide, { width, height }]}
        onPress={onPress}
        disabled={!onPress}
      >
        <View style={[styles.placeholder, { width, height }]}>
          <Ionicons name="restaurant" size={28} color={menuUi.accent} />
        </View>
      </Pressable>
    );
  }

  if (count === 1) {
    return (
      <Pressable style={{ width, height }} onPress={onPress} disabled={!onPress}>
        <CachedImage
          uri={urls[0]}
          style={{ width, height }}
          contentFit="cover"
          recyclingKey={`${recyclingKeyPrefix}-${itemId}-0`}
          priority="high"
        />
      </Pressable>
    );
  }

  return (
    <View style={{ width, height }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        nestedScrollEnabled
        onMomentumScrollEnd={onScrollEnd}
        style={[styles.scroller, Platform.OS === 'web' && styles.scrollerWeb, { width, height }]}
        contentContainerStyle={{ height }}
      >
        {urls.map((url, i) => (
          <Pressable
            key={`${url}-${i}`}
            style={{ width, height }}
            onPress={onPress}
            disabled={!onPress}
          >
            <CachedImage
              uri={url}
              style={{ width, height }}
              contentFit="cover"
              recyclingKey={`${recyclingKeyPrefix}-${itemId}-${i}`}
              priority={i === 0 ? 'high' : 'normal'}
            />
          </Pressable>
        ))}
      </ScrollView>

      {showArrows && count > 1 ? (
        <>
          <Pressable
            style={[styles.arrow, styles.arrowLeft, index === 0 && styles.arrowDisabled]}
            onPress={() => goTo(index - 1)}
            disabled={index === 0}
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={18} color="#fff" />
          </Pressable>
          <Pressable
            style={[styles.arrow, styles.arrowRight, index >= count - 1 && styles.arrowDisabled]}
            onPress={() => goTo(index + 1)}
            disabled={index >= count - 1}
            hitSlop={8}
          >
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </Pressable>
        </>
      ) : null}

      <View style={styles.dots} pointerEvents="none">
        {urls.map((_, i) => (
          <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.counter} pointerEvents="none">
        <Text style={styles.counterText}>
          {index + 1}/{count}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: { flexGrow: 0 },
  scrollerWeb: {
    scrollSnapType: 'x mandatory',
    WebkitOverflowScrolling: 'touch',
  } as object,
  slide: { overflow: 'hidden' },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: menuUi.imagePlaceholder,
  },
  dots: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  dotActive: {
    width: 14,
    backgroundColor: '#fff',
  },
  counter: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(5, 8, 16, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  counterText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  arrow: {
    position: 'absolute',
    top: '50%',
    marginTop: -16,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(5, 8, 16, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  arrowLeft: { left: 6 },
  arrowRight: { right: 6 },
  arrowDisabled: { opacity: 0.3 },
});
