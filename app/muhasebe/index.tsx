import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { safeRouterReplace } from '@/lib/safeRouter';
import { adminTheme } from '@/constants/adminTheme';

export default function MuhasebeIndexScreen() {
  const router = useRouter();

  useEffect(() => {
    safeRouterReplace(router, '/muhasebe/payments');
  }, [router]);

  return (
    <View style={styles.boot}>
      <ActivityIndicator size="large" color={adminTheme.colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
});
