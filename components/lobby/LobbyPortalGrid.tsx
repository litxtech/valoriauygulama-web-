import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { lobbyPortalCards, lobbyTheme } from '@/constants/lobbyTheme';

export type LobbyPortalItem = {
  id: (typeof lobbyPortalCards)[number]['id'];
  title: string;
  hint: string;
  onPress: () => void;
};

type LobbyPortalGridProps = {
  items: LobbyPortalItem[];
};

/** Rezervasyon öne çıkan CTA; diğerleri renkli satır */
export function LobbyPortalGrid({ items }: LobbyPortalGridProps) {
  const booking = items.find((i) => i.id === 'booking');
  const rest = items.filter((i) => i.id !== 'booking');

  return (
    <View style={styles.list}>
      {booking ? (
        <TouchableOpacity style={styles.featured} onPress={booking.onPress} activeOpacity={0.88}>
          <LinearGradient
            colors={['#14b8a6', '#06b6d4', '#0ea5e9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.featuredGradient}
          >
            <View style={styles.featuredIcon}>
              <Ionicons name="calendar" size={22} color="#0f766e" />
            </View>
            <View style={styles.text}>
              <Text style={styles.featuredTitle}>{booking.title}</Text>
              <Text style={styles.featuredHint} numberOfLines={2}>
                {booking.hint}
              </Text>
            </View>
            <View style={styles.featuredArrow}>
              <Ionicons name="arrow-forward" size={16} color="#fff" />
            </View>
          </LinearGradient>
        </TouchableOpacity>
      ) : null}

      {rest.map((item) => {
        const meta = lobbyPortalCards.find((c) => c.id === item.id)!;
        return (
          <TouchableOpacity key={item.id} style={styles.row} onPress={item.onPress} activeOpacity={0.75}>
            <LinearGradient colors={[...meta.colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
              <Ionicons name={meta.icon} size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.text}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.hint} numberOfLines={1}>
                {item.hint}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={16} color={meta.iconColor} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 6,
  },
  featured: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#06b6d4',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 6,
  },
  featuredGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 18,
    paddingHorizontal: 14,
  },
  featuredIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#fff',
  },
  featuredHint: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.92)',
    marginTop: 2,
  },
  featuredArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: lobbyTheme.line,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: 2 },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: lobbyTheme.ink,
  },
  hint: {
    fontSize: 12,
    color: lobbyTheme.inkSoft,
  },
});
