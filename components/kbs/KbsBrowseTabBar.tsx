import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

type Tab = 'captures' | 'passports' | 'phonebook';

type Props = {
  active: Tab;
};

const ROUTES: Record<Tab, Href> = {
  captures: '/staff/kbs/capture-history' as Href,
  passports: '/staff/kbs/passport-explore' as Href,
  phonebook: '/staff/kbs/phonebook' as Href,
};

const TABS: { key: Tab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'captures', label: 'Kimlikler', icon: 'id-card' },
  { key: 'passports', label: 'Pasaport', icon: 'globe-outline' },
  { key: 'phonebook', label: 'Rehber', icon: 'book-outline' },
];

export function KbsBrowseTabBar({ active }: Props) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      {TABS.map((tab) => {
        const on = active === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, on && styles.tabOn]}
            onPress={() => {
              if (active !== tab.key) router.replace(ROUTES[tab.key]);
            }}
            activeOpacity={0.85}
          >
            <Ionicons name={tab.icon} size={13} color={on ? '#fff' : theme.colors.textMuted} />
            <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    height: 34,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  tabOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: theme.colors.textMuted,
  },
  tabTextOn: {
    color: '#fff',
  },
});
