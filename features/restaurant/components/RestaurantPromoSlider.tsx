import { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import type { KitchenMenuPromoVideo } from '@/lib/kitchenMenuPromoVideo';
import { resolvePromoVideoPoster } from '@/lib/kitchenMenuPromoVideo';
import type { RestaurantTokens } from '@/features/restaurant/tokens/restaurantTokens';

type Props = {
  tokens: RestaurantTokens;
  promos: KitchenMenuPromoVideo[];
  onPromoPress?: (index: number) => void;
};

const FALLBACK_PROMOS = [
  { title: 'Günün Özel Menüsü', subtitle: 'Şefin seçimi', icon: 'sparkles' as const, grad: ['#1e3a5f', '#0f172a'] },
  { title: 'Kahvaltı', subtitle: 'Taze & zengin', icon: 'sunny' as const, grad: ['#78350f', '#451a03'] },
  { title: 'Tatlı Zamanı', subtitle: 'Özel lezzetler', icon: 'ice-cream' as const, grad: ['#831843', '#500724'] },
];

export function RestaurantPromoSlider({ tokens, promos, onPromoPress }: Props) {
  const { width } = useWindowDimensions();
  const cardW = Math.min(width * 0.82, 360);
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);

  const slides =
    promos.length > 0
      ? promos.map((p, i) => ({
          key: p.id ?? `promo-${i}`,
          title: p.title?.trim() || 'Kampanya',
          subtitle: '',
          poster: resolvePromoVideoPoster(p),
        }))
      : FALLBACK_PROMOS.map((p, i) => ({ key: `fb-${i}`, title: p.title, subtitle: p.subtitle, poster: null as string | null, icon: p.icon, grad: p.grad }));

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + 12}
        decelerationRate="fast"
        contentContainerStyle={styles.strip}
        onScroll={(e) => {
          const x = e.nativeEvent.contentOffset.x;
          const idx = Math.round(x / (cardW + 12));
          if (idx !== active) setActive(idx);
        }}
        scrollEventThrottle={32}
      >
        {slides.map((slide, index) => {
          const grad = 'grad' in slide ? (slide.grad as string[]) : [tokens.navy, tokens.accent];
          return (
            <TouchableOpacity
              key={slide.key}
              activeOpacity={0.92}
              onPress={() => onPromoPress?.(index)}
              style={[styles.card, { width: cardW, borderColor: tokens.border }]}
            >
              {slide.poster ? (
                <CachedImage uri={slide.poster} style={StyleSheet.absoluteFillObject} contentFit="cover" />
              ) : (
                <LinearGradient colors={grad as [string, string]} style={StyleSheet.absoluteFillObject} />
              )}
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.fade} />
              <View style={styles.cardBody}>
                {'icon' in slide && slide.icon ? (
                  <Ionicons name={slide.icon as keyof typeof Ionicons.glyphMap} size={22} color="#fff" />
                ) : null}
                <Text style={styles.cardTitle}>{slide.title}</Text>
                {slide.subtitle ? <Text style={styles.cardSub}>{slide.subtitle}</Text> : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <View style={styles.dots}>
        {slides.map((s, i) => (
          <View key={s.key} style={[styles.dot, { backgroundColor: i === active ? tokens.accent : tokens.border }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  strip: { paddingHorizontal: 16, gap: 12 },
  card: {
    height: 148,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? ({ boxShadow: '0 16px 40px rgba(10,15,26,0.14)' } as object)
      : {}),
  },
  fade: { ...StyleSheet.absoluteFillObject },
  cardBody: { flex: 1, justifyContent: 'flex-end', padding: 16, gap: 4 },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  cardSub: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 10 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
