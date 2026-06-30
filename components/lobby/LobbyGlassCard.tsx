import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

type LobbyGlassCardProps = { children: ReactNode; style?: object };

export function LobbyGlassCard({ children, style }: LobbyGlassCardProps) {
  return (
    <View style={[styles.shell, style]}>
      <LinearGradient
        colors={['rgba(45,212,191,0.55)', 'rgba(56,189,248,0.35)', 'rgba(167,139,250,0.45)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.borderGlow}
      >
        <View style={styles.innerFrame}>
          <LinearGradient
            colors={['#2dd4bf', '#0ea5e9', '#8b5cf6']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.topAccent}
          />
          {Platform.OS === 'ios' ? (
            <BlurView intensity={64} tint="light" style={styles.blur}>
              <View style={styles.sheen} pointerEvents="none" />
              <View style={styles.content}>{children}</View>
            </BlurView>
          ) : (
            <View style={styles.androidBody}>
              <View style={styles.sheenAndroid} pointerEvents="none" />
              <View style={styles.content}>{children}</View>
            </View>
          )}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: 28,
    shadowColor: '#2dd4bf',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 36,
    elevation: 14,
  },
  borderGlow: {
    borderRadius: 28,
    padding: 1.5,
  },
  innerFrame: {
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: Platform.OS === 'ios' ? 'transparent' : 'rgba(255,255,255,0.98)',
  },
  topAccent: { height: 4, width: '100%' },
  blur: { overflow: 'hidden' },
  androidBody: { overflow: 'hidden' },
  sheen: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  sheenAndroid: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  content: { padding: 24 },
});
