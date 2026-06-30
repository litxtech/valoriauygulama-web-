import { memo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useGuestHotelPulse } from '@/hooks/useGuestHotelPulse';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';
import { feedSharedText } from '@/lib/feedSharedI18n';
import { pulseText } from '@/lib/guestPulseI18n';
import { pds } from '@/constants/personelDesignSystem';

const LIVE_GREEN = '#22c55e';
const ACCENT = '#b8860b';

type Props = {
  refreshKey?: number;
  onCreatePost?: () => void;
};

function LiveDot({ active = true }: { active?: boolean }) {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    if (!active) {
      pulse.setValue(0.35);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 850, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, active]);
  return (
    <Animated.View
      style={{
        width: 7,
        height: 7,
        borderRadius: 4,
        backgroundColor: LIVE_GREEN,
        opacity: pulse,
        transform: [{ scale: pulse.interpolate({ inputRange: [0.35, 1], outputRange: [0.85, 1.2] }) }],
      }}
    />
  );
}

/** Misafir feed üstü: canlı metrik şeridi — personel feed ile aynı ritim */
export const GuestFeedDashboardStrip = memo(function GuestFeedDashboardStrip({ refreshKey = 0, onCreatePost }: Props) {
  const pulse = useGuestHotelPulse(refreshKey, true);
  const router = useRouter();
  const { isNight, toggleNight, colors } = usePremiumTheme();

  const occPct = Math.min(100, Math.max(0, pulse.ops.occupancyPercent ?? 0));
  const loading = pulse.loading && pulse.stats.totalRooms === 0;

  const chips = [
    {
      key: 'live',
      icon: 'pulse' as const,
      value: loading ? '…' : String(pulse.stats.totalOnSite),
      label: (pulseText('guestPulseStatTotalOnSite') ?? 'nüfus').split(' ').slice(-1)[0] ?? 'nüfus',
      color: ACCENT,
      onPress: undefined as (() => void) | undefined,
      live: !loading && pulse.stats.totalOnSite > 0,
    },
    {
      key: 'guests',
      icon: 'people' as const,
      value: loading ? '…' : String(pulse.stats.guestsInHouse),
      label: 'misafir',
      color: LIVE_GREEN,
      onPress: undefined,
      live: false,
    },
    {
      key: 'occ',
      icon: 'bed' as const,
      value: loading ? '…' : `%${occPct}`,
      label: 'doluluk',
      color: pds.indigo,
      onPress: undefined,
      live: false,
    },
    {
      key: 'staff',
      icon: 'radio' as const,
      value: loading ? '…' : String(pulse.ops.staffOnline),
      label: 'çevrimiçi',
      color: '#0ea5e9',
      onPress: undefined,
      live: pulse.ops.staffOnline > 0,
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={[styles.bar, isNight && { borderBottomColor: colors.borderLight }]}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipsScroll}
        >
          {chips.map((c) => {
            const inner = (
              <>
                {c.live ? <LiveDot /> : <Ionicons name={c.icon} size={11} color={c.color} />}
                <Text style={[styles.chipVal, isNight && { color: colors.text }]}>{c.value}</Text>
                <Text style={[styles.chipLabel, isNight && { color: colors.subtext }]}>{c.label}</Text>
              </>
            );
            const chipStyle = [
              styles.chip,
              isNight && styles.chipNight,
              c.live && { borderColor: LIVE_GREEN + '44', backgroundColor: isNight ? LIVE_GREEN + '14' : LIVE_GREEN + '10' },
            ];
            if (!c.onPress) {
              return (
                <View key={c.key} style={chipStyle}>
                  {inner}
                </View>
              );
            }
            return (
              <Pressable key={c.key} style={chipStyle} onPress={c.onPress} hitSlop={4}>
                {inner}
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.actions}>
          {onCreatePost ? (
            <Pressable onPress={onCreatePost} style={[styles.iconBtn, styles.createBtn]} hitSlop={6} accessibilityRole="button">
              <Ionicons name="add" size={19} color="#fff" />
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => router.push('/customer/hotel-info')}
            style={styles.iconBtn}
            hitSlop={6}
            accessibilityRole="button"
          >
            <Ionicons name="business-outline" size={17} color={isNight ? colors.subtext : ACCENT} />
          </Pressable>
          <Pressable onPress={toggleNight} style={styles.iconBtn} hitSlop={6} accessibilityRole="button">
            <Ionicons name={isNight ? 'moon' : 'sunny-outline'} size={17} color={colors.subtext} />
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingTop: 0 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: pds.cardBorder,
    minHeight: 40,
  },
  chipsScroll: { flex: 1, minWidth: 0 },
  chips: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(184,134,11,0.08)',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipNight: { backgroundColor: 'rgba(255,255,255,0.06)' },
  chipVal: { fontSize: 12, fontWeight: '800', color: pds.text },
  chipLabel: { fontSize: 10, fontWeight: '600', color: pds.subtext },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtn: {
    backgroundColor: ACCENT,
    ...StyleSheet.flatten({
      shadowColor: ACCENT,
      shadowOpacity: 0.35,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
    }),
  },
});
