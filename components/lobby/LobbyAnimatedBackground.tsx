import { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Video, ResizeMode } from 'expo-av';
import { lobbyTheme } from '@/constants/lobbyTheme';
import { useLobbyCover } from '@/hooks/useLobbyCover';
import type { LobbyCover } from '@/lib/lobbyCover';

const DEFAULT_HERO = require('../../assets/lobby-hero-uzungol.png');

type Props = {
  /** Test / önizleme override; yoksa canlı ayar kullanılır */
  cover?: LobbyCover | null;
};

/**
 * Full-bleed lobi kapağı (resim veya video) + canlı renk wash.
 * Soft dawn pulse ve lake shimmer — soyut orb yok.
 * Video eklendiğinde resim kalkar; aynı ebat (cover / absolute fill).
 * Kapak app_settings üzerinden anlık güncellenir.
 */
export function LobbyAnimatedBackground({ cover: coverOverride }: Props) {
  const liveCover = useLobbyCover();
  const cover = coverOverride !== undefined ? coverOverride : liveCover;
  const { height, width } = useWindowDimensions();
  const dawn = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const dawnLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dawn, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(dawn, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 9000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    dawnLoop.start();
    shimmerLoop.start();
    return () => {
      dawnLoop.stop();
      shimmerLoop.stop();
    };
  }, [dawn, shimmer]);

  const dawnOpacity = dawn.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.48] });
  const shimmerX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-width * 0.35, width * 0.55],
  });

  const isRemoteVideo = cover?.mediaType === 'video' && !!cover.url;
  const isRemoteImage = cover?.mediaType === 'image' && !!cover.url;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {isRemoteVideo ? (
        <Video
          key={cover.url}
          source={{ uri: cover.url }}
          style={styles.photo}
          resizeMode={ResizeMode.COVER}
          isLooping
          isMuted
          shouldPlay
          useNativeControls={false}
        />
      ) : isRemoteImage ? (
        <Image key={cover.url} source={{ uri: cover.url }} style={styles.photo} resizeMode="cover" />
      ) : (
        <Image source={DEFAULT_HERO} style={styles.photo} resizeMode="cover" />
      )}

      <LinearGradient
        colors={[
          'rgba(4,47,46,0.42)',
          'rgba(13,148,136,0.12)',
          'transparent',
          lobbyTheme.floor,
        ]}
        locations={[0, 0.28, 0.58, 0.8]}
        style={[styles.wash, { height }]}
      />

      <Animated.View style={[styles.dawnBand, { opacity: dawnOpacity, height: height * 0.38 }]}>
        <LinearGradient
          colors={['rgba(251,191,36,0.45)', 'rgba(251,146,60,0.18)', 'transparent']}
          locations={[0, 0.45, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.shimmer,
          {
            height: height * 0.55,
            transform: [{ translateX: shimmerX }, { rotate: '-18deg' }],
          },
        ]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(45,212,191,0.18)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      <LinearGradient
        colors={['transparent', 'rgba(20,184,166,0.18)', lobbyTheme.floor]}
        locations={[0.35, 0.72, 1]}
        style={[styles.lakeFade, { height: height * 0.45, top: height * 0.48 }]}
      />

      <View style={[styles.floorFill, { top: height * 0.78 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  photo: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  wash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  dawnBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  shimmer: {
    position: 'absolute',
    top: '18%',
    width: 120,
  },
  lakeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  floorFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: lobbyTheme.floor,
  },
});
