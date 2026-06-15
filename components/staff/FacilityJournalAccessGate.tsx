import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { canAccessFacilityJournal } from '@/lib/staffPermissions';
import { theme } from '@/constants/theme';

type Props = { children: React.ReactNode };

/** Otel eşyaları kullanımı: admin veya tesis_gunlugu yetkili personel. */
export function FacilityJournalAccessGate({ children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const staff = useAuthStore((s) => s.staff);
  const allowed = canAccessFacilityJournal(staff);
  const isAdminRoute = pathname?.startsWith('/admin') ?? false;

  useEffect(() => {
    if (staff && !allowed) {
      router.replace(isAdminRoute ? '/admin' : '/staff');
    }
  }, [staff, allowed, router, isAdminRoute]);

  if (!staff) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.background },
});
