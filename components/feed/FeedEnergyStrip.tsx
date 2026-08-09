import { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

export type FeedEnergyChip = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  /** Canlı nabız noktası (yeşil) — diğer tonlar kaldırıldı, tek palet */
  live?: boolean;
  onPress?: () => void;
};

type Props = {
  chips: FeedEnergyChip[];
  title?: string;
  onCreatePress?: () => void;
  trailing?: React.ReactNode;
};

function LiveDot({ color = '#22c55e' }: { color?: string }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: color,
        opacity: pulse,
        transform: [
          {
            scale: pulse.interpolate({ inputRange: [0.45, 1], outputRange: [0.9, 1.15] }),
          },
        ],
      }}
    />
  );
}

/**
 * Feed üst şerit — sade beyaz kart + tek teal aksan (karışık gradient yok).
 */
export const FeedEnergyStrip = memo(function FeedEnergyStrip({
  chips,
  title = 'Canlı',
  onCreatePress,
  trailing,
}: Props) {
  const palette = usePersonelDesign();
  const { isNight } = usePremiumTheme();

  const cardBg = isNight ? palette.cardBg : '#FFFFFF';
  const border = isNight ? palette.cardBorder : 'rgba(15, 118, 110, 0.14)';
  const chipBg = isNight ? 'rgba(255,255,255,0.06)' : '#F3FAF8';
  const chipBorder = isNight ? 'rgba(255,255,255,0.1)' : 'rgba(15, 118, 110, 0.12)';
  const chipFg = isNight ? palette.text : '#0F766E';
  const chipMuted = isNight ? palette.muted : '#5B7A74';

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.hero,
          palette.shadowCard,
          { backgroundColor: cardBg, borderColor: border },
        ]}
      >
        <View style={styles.heroTop}>
          <View style={[styles.liveBadge, { backgroundColor: isNight ? 'rgba(34,197,94,0.16)' : '#ECFDF5' }]}>
            <LiveDot />
            <Text style={[styles.liveBadgeText, { color: isNight ? '#86EFAC' : '#15803D' }]}>
              {title}
            </Text>
          </View>
          <View style={styles.heroActions}>
            {trailing}
            {onCreatePress ? (
              <Pressable
                onPress={onCreatePress}
                style={[styles.createBtn, { backgroundColor: '#0F766E' }]}
                hitSlop={6}
                accessibilityRole="button"
              >
                <Ionicons name="add" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        </View>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {chips.map((chip) => {
            const body = (
              <View
                style={[
                  styles.chip,
                  { backgroundColor: chipBg, borderColor: chipBorder },
                ]}
              >
                {chip.live ? (
                  <LiveDot />
                ) : (
                  <Ionicons name={chip.icon} size={13} color={chipFg} />
                )}
                <Text style={[styles.chipVal, { color: chipFg }]}>{chip.value}</Text>
                <Text style={[styles.chipLabel, { color: chipMuted }]}>{chip.label}</Text>
              </View>
            );
            if (!chip.onPress) return <View key={chip.key}>{body}</View>;
            return (
              <Pressable key={chip.key} onPress={chip.onPress} accessibilityRole="button">
                {body}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  hero: {
    marginHorizontal: 14,
    borderRadius: 18,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  createBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipVal: { fontSize: 13, fontWeight: '800' },
  chipLabel: { fontSize: 11, fontWeight: '600' },
});
