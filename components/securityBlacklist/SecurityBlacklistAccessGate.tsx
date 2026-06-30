import { type ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { canAccessSecurityBlacklist } from '@/lib/staffPermissions';
import { blacklistTheme } from '@/lib/securityBlacklistTheme';

export function SecurityBlacklistAccessGate({ children }: { children: ReactNode }) {
  const staff = useAuthStore((s) => s.staff);
  const router = useRouter();

  if (!canAccessSecurityBlacklist(staff)) {
    return (
      <View style={styles.denied}>
        <Ionicons name="lock-closed-outline" size={40} color={blacklistTheme.textMuted} />
        <Text style={styles.deniedTitle}>Kara Liste</Text>
        <Text style={styles.deniedText}>Kayıt eklemek için yönetici (admin) rolü gerekir.</Text>
        <Text style={styles.deniedLink} onPress={() => router.back()}>
          Geri dön
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  denied: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10, backgroundColor: blacklistTheme.bg },
  deniedTitle: { fontSize: 18, fontWeight: '800', color: blacklistTheme.text },
  deniedText: { fontSize: 14, color: blacklistTheme.textMuted, textAlign: 'center', lineHeight: 20 },
  deniedLink: { marginTop: 8, fontSize: 15, fontWeight: '700', color: blacklistTheme.accent },
});
