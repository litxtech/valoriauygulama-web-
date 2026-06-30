import { View, Text, StyleSheet, TouchableOpacity, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { lobbyPortalCards } from '@/constants/lobbyTheme';

export type LobbyPortalItem = {
  id: (typeof lobbyPortalCards)[number]['id'];
  title: string;
  hint: string;
  onPress: () => void;
};

type LobbyPortalGridProps = {
  items: LobbyPortalItem[];
};

export function LobbyPortalGrid({ items }: LobbyPortalGridProps) {
  const { width } = useWindowDimensions();
  const twoCol = width >= 380;

  return (
    <View style={[styles.grid, twoCol && styles.gridTwoCol]}>
      {items.map((item) => {
        const meta = lobbyPortalCards.find((c) => c.id === item.id)!;
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.tile, twoCol && styles.tileHalf]}
            onPress={item.onPress}
            activeOpacity={0.9}
          >
            <LinearGradient colors={[...meta.colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.tileGradient}>
              <View style={[styles.glowOrb, { backgroundColor: meta.glow }]} />
              <View style={styles.tileTop}>
                <View style={styles.iconWrap}>
                  <Ionicons name={meta.icon} size={22} color="#fff" />
                </View>
                <View style={styles.arrow}>
                  <Ionicons name="arrow-forward" size={16} color="#fff" />
                </View>
              </View>
              <Text style={styles.pill}>{meta.pill}</Text>
              <Text style={styles.title} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.hint} numberOfLines={2}>
                {item.hint}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 12 },
  gridTwoCol: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    borderRadius: 20,
    overflow: 'hidden',
    minHeight: 148,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 8,
  },
  tileHalf: {
    width: '48.5%',
    flexGrow: 1,
  },
  tileGradient: {
    flex: 1,
    padding: 16,
    minHeight: 148,
    justifyContent: 'flex-end',
  },
  glowOrb: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    top: -40,
    right: -30,
    opacity: 0.55,
  },
  tileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 'auto',
    paddingBottom: 12,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  arrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    fontSize: 10,
    fontWeight: '900',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 20,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
    lineHeight: 16,
  },
});
