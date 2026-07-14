import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { theme } from '@/constants/theme';

type Tab = 'captures' | 'passports';

type Props = {
  active: Tab;
};

const ROUTES: Record<Tab, Href> = {
  captures: '/staff/kbs/capture-history' as Href,
  passports: '/staff/kbs/passport-explore' as Href,
};

export function KbsBrowseTabBar({ active }: Props) {
  const router = useRouter();

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.tab, active === 'captures' && styles.tabOn]}
        onPress={() => {
          if (active !== 'captures') router.replace(ROUTES.captures);
        }}
      >
        <Text style={[styles.tabText, active === 'captures' && styles.tabTextOn]}>Çekilen Kimlikler</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.tab, active === 'passports' && styles.tabOn]}
        onPress={() => {
          if (active !== 'passports') router.replace(ROUTES.passports);
        }}
      >
        <Text style={[styles.tabText, active === 'passports' && styles.tabTextOn]}>Pasaport Keşfeti</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    alignItems: 'center',
  },
  tabOn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: theme.colors.textSecondary,
  },
  tabTextOn: {
    color: '#fff',
  },
});
