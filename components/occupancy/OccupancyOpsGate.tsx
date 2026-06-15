import { useEffect } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { canAccessOccupancyOps } from '@/lib/staffPermissions';
import { adminTheme } from '@/constants/adminTheme';

type Props = { children: React.ReactNode };

/** Yetkisiz personeli geri gönderir; admin ve doluluk_operasyon erişebilir. */
export function OccupancyOpsGate({ children }: Props) {
  const router = useRouter();
  const { staff, loading, staffCheckComplete } = useAuthStore();
  const allowed = canAccessOccupancyOps(staff);

  useEffect(() => {
    if (!staffCheckComplete || loading) return;
    if (!staff) {
      router.replace('/auth');
      return;
    }
    if (!allowed) {
      router.replace('/staff/(tabs)');
    }
  }, [allowed, loading, router, staff, staffCheckComplete]);

  if (!staffCheckComplete || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <Text style={styles.denied}>Doluluk operasyon yetkiniz yok.</Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  denied: { fontSize: 15, color: '#64748b', textAlign: 'center' },
});
