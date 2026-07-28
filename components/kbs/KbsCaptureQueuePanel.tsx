import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

export type KbsCaptureQueueImageItem = {
  kind: 'image';
  id: string;
  imageUri: string;
};

export type KbsCaptureQueueTcItem = {
  kind: 'tc';
  id: string;
  tc: string;
  fullName: string;
  phone: string;
};

export type KbsCaptureQueueItem = KbsCaptureQueueImageItem | KbsCaptureQueueTcItem;

type Props = {
  items: KbsCaptureQueueItem[];
  onOpenImage: (id: string) => void;
  onRemove: (id: string) => void;
  removeA11yLabel: string;
  /** Yatay şerit (kamera) veya kompakt yatay (T.C.). */
  layout?: 'list' | 'strip';
  maxListHeight?: number;
};

const CARD_W = 76;
const CARD_GAP = 10;

export function KbsCaptureQueuePanel({
  items,
  onOpenImage,
  onRemove,
  removeA11yLabel,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    if (items.length > prevCountRef.current && items.length > 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    }
    prevCountRef.current = items.length;
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <View style={styles.rail}>
      <View style={styles.railHead}>
        <View style={styles.railHeadLeft}>
          <View style={styles.railDot} />
          <Text style={styles.railTitle}>Kuyruk</Text>
        </View>
        <View style={styles.railCount}>
          <Text style={styles.railCountText}>{items.length}</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={CARD_W + CARD_GAP}
        snapToAlignment="start"
        contentContainerStyle={styles.railTrack}
        keyboardShouldPersistTaps="handled"
      >
        {items.map((item, index) => {
          const isTc = item.kind === 'tc';
          const isLast = index === items.length - 1;
          return (
            <View key={item.id} style={[styles.card, isLast && styles.cardLatest]}>
              {isTc ? (
                <View style={styles.cardTc}>
                  <Ionicons name="finger-print" size={22} color="#93c5fd" />
                  <Text style={styles.cardTcNum} numberOfLines={1}>
                    {item.tc.slice(-4).padStart(4, '•')}
                  </Text>
                  {item.fullName.trim() ? (
                    <Text style={styles.cardTcName} numberOfLines={1}>
                      {item.fullName.trim()}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <Pressable
                  style={styles.cardImageWrap}
                  onPress={() => onOpenImage(item.id)}
                  accessibilityLabel={`Kimlik ${index + 1}`}
                >
                  <Image source={{ uri: item.imageUri }} style={styles.cardImage} contentFit="cover" />
                  <View style={styles.cardImageScrim} />
                </Pressable>
              )}

              <View style={styles.cardIndex}>
                <Text style={styles.cardIndexText}>{index + 1}</Text>
              </View>

              <TouchableOpacity
                style={styles.cardRemove}
                onPress={() => onRemove(item.id)}
                hitSlop={10}
                accessibilityLabel={removeA11yLabel}
              >
                <Ionicons name="close" size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    marginTop: 2,
    marginHorizontal: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    overflow: 'hidden',
    paddingBottom: 10,
  },
  railHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
  },
  railHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  railDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  railTitle: {
    color: 'rgba(248,250,252,0.92)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  railCount: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 7,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railCountText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
  },
  railTrack: {
    paddingHorizontal: 12,
    gap: CARD_GAP,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  card: {
    width: CARD_W,
    height: 96,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(30,41,59,0.9)',
  },
  cardLatest: {
    borderColor: 'rgba(52,211,153,0.75)',
    shadowColor: '#34d399',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  cardImageWrap: {
    flex: 1,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardImageScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  cardTc: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(30,64,175,0.78)',
  },
  cardTcNum: {
    color: '#e0f2fe',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  cardTcName: {
    color: 'rgba(191,219,254,0.9)',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
  cardIndex: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    minWidth: 20,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIndexText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  cardRemove: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(220,38,38,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
});
