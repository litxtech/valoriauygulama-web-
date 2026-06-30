import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { lobbyTheme } from '@/constants/lobbyTheme';

function liveGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Günaydın';
  if (h >= 12 && h < 18) return 'İyi günler';
  if (h >= 18 && h < 23) return 'İyi akşamlar';
  return 'Hoş geldiniz';
}

function formatClock(): string {
  return new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

type LobbyHeroProps = {
  brand: string;
  tagline: string;
  location: string;
  paddingTop: number;
};

export function LobbyHero({ brand, tagline, location, paddingTop }: LobbyHeroProps) {
  const pulse = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const [clock, setClock] = useState(formatClock);

  useEffect(() => {
    const t = setInterval(() => setClock(formatClock()), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ])
    ).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(float, { toValue: 1, duration: 3200, useNativeDriver: true }),
        Animated.timing(float, { toValue: 0, duration: 3200, useNativeDriver: true }),
      ])
    ).start();
  }, [float, pulse]);

  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const dotOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const badgeY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -4] });

  return (
    <View style={[styles.root, { paddingTop: paddingTop + 20 }]}>
      <LinearGradient
        colors={['rgba(45,212,191,0.12)', 'transparent']}
        style={styles.heroGlow}
        pointerEvents="none"
      />

      <Animated.View style={[styles.liveBadge, { transform: [{ translateY: badgeY }] }]}>
        <Animated.View style={[styles.liveDot, { transform: [{ scale: dotScale }], opacity: dotOpacity }]} />
        <Text style={styles.liveText}>Canlı otel portalu</Text>
        <View style={styles.clockChip}>
          <Ionicons name="time-outline" size={12} color={lobbyTheme.accent} />
          <Text style={styles.clockText}>{clock}</Text>
        </View>
      </Animated.View>

      <View style={styles.logoWrap}>
        <LinearGradient
          colors={['#2dd4bf', '#38bdf8', '#a78bfa', '#2dd4bf']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.logoRing}
        >
          <View style={styles.logoInner}>
            <Text style={styles.logoLetter}>V</Text>
          </View>
        </LinearGradient>
      </View>

      <Text style={styles.greeting}>{liveGreeting()}</Text>
      <Text style={styles.brand}>{brand}</Text>

      <View style={styles.taglineRow}>
        <LinearGradient colors={['transparent', lobbyTheme.accent, 'transparent']} style={styles.taglineLine} />
        <Text style={styles.tagline}>{tagline}</Text>
        <LinearGradient colors={['transparent', lobbyTheme.accent, 'transparent']} style={styles.taglineLine} />
      </View>

      <View style={styles.chipsRow}>
        <View style={styles.chip}>
          <Ionicons name="location" size={13} color={lobbyTheme.accent} />
          <Text style={styles.chipText}>{location}</Text>
        </View>
        <View style={styles.chip}>
          <Ionicons name="sparkles" size={13} color={lobbyTheme.amber} />
          <Text style={styles.chipText}>7/24 dijital</Text>
        </View>
      </View>

      <View style={styles.statsStrip}>
        {[
          { icon: 'people-outline' as const, label: 'Misafir' },
          { icon: 'shield-checkmark-outline' as const, label: 'Personel' },
          { icon: 'restaurant-outline' as const, label: 'Partner' },
        ].map((item) => (
          <View key={item.label} style={styles.statItem}>
            <Ionicons name={item.icon} size={16} color="rgba(255,255,255,0.55)" />
            <Text style={styles.statLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 52,
  },
  heroGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.25)',
    marginBottom: 22,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
  },
  liveText: {
    color: lobbyTheme.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  clockChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 4,
    paddingLeft: 10,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.12)',
  },
  clockText: {
    color: lobbyTheme.accent,
    fontSize: 12,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  logoWrap: { marginBottom: 14 },
  logoRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInner: {
    width: '100%',
    height: '100%',
    borderRadius: 45,
    backgroundColor: 'rgba(5, 10, 20, 0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoLetter: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -1,
  },
  greeting: {
    fontSize: 14,
    fontWeight: '600',
    color: lobbyTheme.accent,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  brand: {
    fontSize: 40,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: Platform.OS === 'android' ? 0.5 : -1.5,
    textShadowColor: 'rgba(45, 212, 191, 0.4)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 16,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
    maxWidth: '100%',
  },
  taglineLine: { width: 32, height: 2, borderRadius: 1 },
  tagline: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '600',
    color: lobbyTheme.textMuted,
    textAlign: 'center',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: lobbyTheme.glass,
    borderWidth: 1,
    borderColor: lobbyTheme.cardBorder,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '700',
    color: lobbyTheme.textMuted,
  },
  statsStrip: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    width: '100%',
  },
  statItem: { alignItems: 'center', gap: 4 },
  statLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.45)',
    letterSpacing: 0.3,
  },
});
