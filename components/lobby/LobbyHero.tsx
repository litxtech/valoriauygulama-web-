import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Platform, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { lobbyTheme } from '@/constants/lobbyTheme';

function liveGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Günaydın';
  if (h >= 12 && h < 18) return 'İyi günler';
  if (h >= 18 && h < 23) return 'İyi akşamlar';
  return 'Hoş geldiniz';
}

type LobbyHeroProps = {
  brand: string;
  tagline: string;
  location: string;
  paddingTop: number;
};

/**
 * Fotoğrafın üstünde tek kompozisyon:
 * marka + bir cümle + konum. Chip / bilet yok.
 */
export function LobbyHero({ brand, tagline, location, paddingTop }: LobbyHeroProps) {
  const { height, width } = useWindowDimensions();
  const enter = useRef(new Animated.Value(0)).current;
  const accent = useRef(new Animated.Value(0)).current;
  const [greeting] = useState(liveGreeting);
  const heroH = Math.max(420, height * 0.72);
  const brandSize = Math.min(58, Math.max(40, width * 0.13));

  useEffect(() => {
    Animated.parallel([
      Animated.timing(enter, { toValue: 1, duration: 1100, useNativeDriver: true }),
      Animated.timing(accent, {
        toValue: 1,
        duration: 1400,
        delay: 280,
        useNativeDriver: false,
      }),
    ]).start();
  }, [enter, accent]);

  const opacity = enter;
  const y = enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] });
  const ruleWidth = accent.interpolate({ inputRange: [0, 1], outputRange: [0, 56] });

  return (
    <View style={[styles.root, { minHeight: heroH, paddingTop: paddingTop + 24 }]}>
      <Animated.View style={[styles.copy, { opacity, transform: [{ translateY: y }] }]}>
        <Text style={styles.greeting}>{greeting}</Text>
        <Text
          style={[styles.brand, { fontSize: brandSize, lineHeight: brandSize * 1.08 }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {brand}
        </Text>
        <Animated.View style={[styles.ruleWrap, { width: ruleWidth }]}>
          <LinearGradient
            colors={[lobbyTheme.gold, lobbyTheme.lake, lobbyTheme.sky]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.rule}
          />
        </Animated.View>
        <Text style={styles.tagline}>{tagline}</Text>
        <Text style={styles.place}>{location}</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    justifyContent: 'flex-end',
    paddingHorizontal: 28,
    paddingBottom: 48,
  },
  copy: {
    maxWidth: 420,
  },
  greeting: {
    fontSize: 12,
    fontWeight: '700',
    color: lobbyTheme.gold,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 12,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  brand: {
    fontWeight: Platform.OS === 'ios' ? '300' : '400',
    color: '#fff',
    letterSpacing: Platform.OS === 'android' ? 0.5 : 1.5,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia' }),
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 14,
  },
  ruleWrap: {
    marginTop: 14,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  rule: {
    flex: 1,
  },
  tagline: {
    marginTop: 14,
    fontSize: 17,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.94)',
    lineHeight: 26,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  place: {
    marginTop: 10,
    fontSize: 13,
    fontWeight: '700',
    color: lobbyTheme.lake,
    letterSpacing: 0.6,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
});
