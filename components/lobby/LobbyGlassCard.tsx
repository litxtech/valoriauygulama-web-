import { type ReactNode } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { lobbyTheme } from '@/constants/lobbyTheme';

type LobbyGlassCardProps = { children: ReactNode; style?: object };

/** Fotoğrafın altına oturan canlı zemin paneli */
export function LobbyGlassCard({ children, style }: LobbyGlassCardProps) {
  return (
    <View style={[styles.panel, style]}>
      <LinearGradient
        colors={[lobbyTheme.gold, lobbyTheme.lake, lobbyTheme.sky]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.accentBar}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: lobbyTheme.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingHorizontal: 22,
    paddingTop: 28,
    paddingBottom: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(20, 184, 166, 0.18)',
    ...Platform.select({
      ios: {
        shadowColor: '#0d9488',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.18,
        shadowRadius: 20,
      },
      android: { elevation: 10 },
      default: {},
    }),
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
});
