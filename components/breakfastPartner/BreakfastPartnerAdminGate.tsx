import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export function BreakfastPartnerAdminGate({ children }: { children: ReactNode }) {
  const staff = useAuthStore((s) => s.staff);
  const router = useRouter();
  const allowed = staff?.role === 'admin';

  if (!allowed) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={40} color="#64748b" />
        <Text style={styles.deniedTitle}>Kahvaltı partner otelleri</Text>
        <Text style={styles.deniedText}>Bu modül yalnızca admin tarafından yönetilir.</Text>
        <Text style={styles.deniedLink} onPress={() => router.back()}>
          Geri dön
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, backgroundColor: '#0f172a' },
  deniedTitle: { fontSize: 18, fontWeight: '800', color: '#f8fafc' },
  deniedText: { fontSize: 14, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },
  deniedLink: { marginTop: 8, fontSize: 15, fontWeight: '700', color: '#f59e0b' },
});
