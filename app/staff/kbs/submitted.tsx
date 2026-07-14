import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { canKbsCheckout } from '@/lib/kbsStaysPermissions';

/** Bildirilenler artık İçeride (Konaklayanlar) ekranında yönetilir. */
export default function SubmittedPassportsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const canOut = canKbsCheckout(staff);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('kbsNavSubmitted')}</Text>
      <Text style={styles.p}>
        Bildirilen konaklayanlar «İçeride» listesinde. Çıkış ve düzeltme oradan yapılır.
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => router.replace('/staff/kbs/lodgers' as never)}
      >
        <Text style={styles.btnText}>{canOut ? 'İçeride — Çıkış yap' : t('kbsLodgersTitle')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 12 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
  btn: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontWeight: '900' },
});
