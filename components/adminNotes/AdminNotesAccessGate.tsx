import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { canAccessQuickNotes } from '@/lib/staffPermissions';
import { notesTheme } from '@/constants/adminNotesTheme';

export function AdminNotesAccessGate({ children }: { children: ReactNode }) {
  const staff = useAuthStore((s) => s.staff);
  const router = useRouter();

  if (!canAccessQuickNotes(staff)) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={40} color={notesTheme.textMuted} />
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
  denied: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 10,
    backgroundColor: notesTheme.bg,
  },
  deniedTitle: { fontSize: 18, fontWeight: '800', color: notesTheme.text },
  deniedText: { fontSize: 14, color: notesTheme.textMuted, textAlign: 'center', lineHeight: 20 },
  deniedLink: { marginTop: 8, fontSize: 15, fontWeight: '700', color: notesTheme.accent },
});
