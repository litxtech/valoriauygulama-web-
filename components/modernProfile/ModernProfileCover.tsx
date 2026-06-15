import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { CachedImage } from '@/components/CachedImage';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';

type Props = {
  imageUri?: string | null;
  height: number;
  onPress?: () => void;
  disabled?: boolean;
  children?: ReactNode;
  /** Tam genişlik, alt köşe yuvarlak yok */
  edgeToEdge?: boolean;
  /** Kapak üzerinde hafif blur (header altında net görünüm için false) */
  softenOverlay?: boolean;
};

export function ModernProfileCover({
  imageUri,
  height,
  onPress,
  disabled,
  children,
  edgeToEdge = true,
  softenOverlay = true,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.root, { height }, edgeToEdge && styles.edgeToEdge]}
      accessibilityRole="imagebutton"
    >
      {imageUri ? (
        <>
          <CachedImage uri={imageUri} style={styles.coverImage} contentFit="cover" />
          {softenOverlay ? <BlurView intensity={18} tint="dark" style={styles.blurOverlay} /> : null}
        </>
      ) : (
        <>
          <LinearGradient
            colors={[P.gradient.start, '#4338ca', '#312e81']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.coverImage}
          />
          <View style={styles.orbA} pointerEvents="none" />
          <View style={styles.orbB} pointerEvents="none" />
        </>
      )}
      <LinearGradient
        colors={['transparent', 'rgba(15,23,42,0.2)', 'rgba(15,23,42,0.65)']}
        locations={[0.2, 0.55, 1]}
        style={styles.bottomFade}
        pointerEvents="none"
      />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
  },
  edgeToEdge: {
    borderBottomLeftRadius: P.hero.bottomRadius,
    borderBottomRightRadius: P.hero.bottomRadius,
  },
  orbA: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    top: -40,
    right: -20,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  orbB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: 20,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.22,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
});
