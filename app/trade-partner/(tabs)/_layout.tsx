import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useTradePartnerAuthStore } from '@/stores/tradePartnerAuthStore';
import { tradePartnerTheme as theme } from '@/lib/tradePartnerTheme';
import { safeRouterReplace } from '@/lib/safeRouter';

export default function TradePartnerTabsLayout() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const staff = useAuthStore((s) => s.staff);
  const partner = useTradePartnerAuthStore((s) => s.partner);
  const partnerCheckComplete = useTradePartnerAuthStore((s) => s.partnerCheckComplete);

  useEffect(() => {
    if (staff) {
      safeRouterReplace(router, '/staff');
      return;
    }
    if (!user) {
      safeRouterReplace(router, '/trade-partner/login');
      return;
    }
    if (partnerCheckComplete && !partner) {
      safeRouterReplace(router, '/trade-partner/login');
    }
  }, [user, staff, partner, partnerCheckComplete, router]);

  if (!partnerCheckComplete || !partner) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.mutedSoft,
        tabBarStyle: {
          backgroundColor: theme.bgSoft,
          borderTopColor: theme.cardBorder,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'İşlemler',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Cari',
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  boot: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.bg },
});
