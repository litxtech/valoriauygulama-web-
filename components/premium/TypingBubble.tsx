import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { pds } from '@/constants/personelDesignSystem';

type Props = { names: string[]; singleLabel?: string };

function Dot({ delay }: { delay: number }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(y, { toValue: -4, duration: 280, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 280, useNativeDriver: true }),
        Animated.delay(400),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [delay, y]);
  return <Animated.View style={[styles.dot, { transform: [{ translateY: y }] }]} />;
}

export function TypingBubble({ names, singleLabel }: Props) {
  if (names.length === 0) return null;
  const label = singleLabel ?? (names.length === 1 ? `${names[0]} yazıyor` : `${names.slice(0, 3).join(', ')} yazıyor`);

  return (
    <GlassSurface style={styles.wrap} borderRadius={14} intensity={32}>
      <View style={styles.row}>
        <View style={styles.dots}>
          <Dot delay={0} />
          <Dot delay={120} />
          <Dot delay={240} />
        </View>
        <Text style={styles.text} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 12, marginBottom: 6, alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: pds.indigo },
  text: { fontSize: 12, fontWeight: '600', color: pds.subtext, flexShrink: 1 },
});
