import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { canAccessLostFound } from '@/lib/staffPermissions';
import { theme } from '@/constants/theme';

type Props = { children: React.ReactNode };

/** Emanet modülü: yalnızca admin veya emanet_buluntu yetkili personel. */
export function LostFoundAccessGate({ children }: Props) {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const allowed = canAccessLostFound(staff);

  useEffect(() => {
    if (staff && !allowed) {
      router.replace('/staff');
    }
  }, [staff, allowed, router]);

  if (!staff) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
});
