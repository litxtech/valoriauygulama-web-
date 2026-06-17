import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { canAccessQuickNotes } from '@/lib/staffPermissions';
import { theme } from '@/constants/theme';

export function AdminNotesAccessGate({ children }: { children: ReactNode }) {
  const staff = useAuthStore((s) => s.staff);
  const router = useRouter();

  if (!canAccessQuickNotes(staff)) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={40} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Not Al</Text>
        <Text style={styles.deniedText}>
          Bu özellik için yönetici tarafından «Not Al» yetkisi verilmesi gerekir.
        </Text>
        <Text style={styles.deniedLink} onPress={() => router.back()}>
          Geri dön
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  deniedTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  deniedText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  deniedLink: { marginTop: 8, fontSize: 15, fontWeight: '700', color: theme.colors.primary },
});
