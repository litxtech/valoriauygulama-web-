import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useKitchenFinanceAccess } from '@/hooks/useKitchenFinanceAccess';

type Props = {
  children: React.ReactNode;
  allowReception?: boolean;
};

export function KitchenFinanceAccessGate({ children, allowReception = false }: Props) {
  const { loading, allowed, isReception } = useKitchenFinanceAccess();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!allowed && !(allowReception && isReception)) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={48} color={theme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Finans yetkisi gerekli</Text>
        <Text style={styles.denied}>
          Admin panelinden «Finans erişimi» ile seçilen personel bu ekranı kullanabilir.
        </Text>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: theme.colors.backgroundSecondary },
  deniedTitle: { marginTop: 12, fontSize: 17, fontWeight: '800', color: theme.colors.text },
  denied: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
