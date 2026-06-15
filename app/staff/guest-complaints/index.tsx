import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { canAccessGuestComplaints } from '@/lib/staffPermissions';
import AdminComplaintsIndex from '@/app/admin/complaints/index';

/** Personel: misafir_sikayetleri yetkisi ile admin şikayet ekranının aynısı. */
export default function StaffGuestComplaintsScreen() {
  const router = useRouter();
  const { staff, loading, staffCheckComplete } = useAuthStore();
  const allowed = canAccessGuestComplaints(staff);

  useEffect(() => {
    if (!staffCheckComplete || loading) return;
    if (!allowed) {
      router.replace('/staff');
    }
  }, [allowed, loading, router, staffCheckComplete]);

  if (!staffCheckComplete || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!allowed) return null;

  return <AdminComplaintsIndex />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
