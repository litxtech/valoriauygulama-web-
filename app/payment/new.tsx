import { useEffect } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PaymentNewForm } from '@/components/payments/PaymentNewForm';
import { parsePaymentNewKind, parsePaymentNewMode } from '@/lib/paymentNewRoute';
import { useAuthStore } from '@/stores/authStore';
import { safeRouterReplace } from '@/lib/safeRouter';
import { theme } from '@/constants/theme';

/** Web portal — staff layout dışında; giriş yoksa yönlendirme döngüsü olmaz */
export default function PaymentNewPortalScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string | string[]; kind?: string | string[] }>();
  const staff = useAuthStore((s) => s.staff);
  const loading = useAuthStore((s) => s.loading);
  const staffCheckComplete = useAuthStore((s) => s.staffCheckComplete);

  const initialMode = parsePaymentNewMode(params.mode);
  const initialKind = parsePaymentNewKind(params.kind);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    safeRouterReplace(router, {
      pathname: '/staff/payments/new',
      params: {
        mode: initialMode ?? 'standing',
        kind: initialKind ?? 'food',
      },
    });
  }, [router, initialMode, initialKind]);

  if (Platform.OS !== 'web') return null;

  if (loading || !staffCheckComplete) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#635bff" />
      </View>
    );
  }

  if (!staff) {
    return (
      <View style={styles.centered}>
        <Text style={styles.gateTitle}>Personel girişi gerekli</Text>
        <Text style={styles.gateBody}>
          Sabit veya serbest tutarlı ödeme QR oluşturmak için ana sayfadan personel hesabınızla giriş yapın,
          ardından bu sayfaya tekrar gelin.
        </Text>
        <TouchableOpacity style={styles.gateBtn} onPress={() => safeRouterReplace(router, '/')} activeOpacity={0.88}>
          <Text style={styles.gateBtnText}>Giriş sayfasına git</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <PaymentNewForm
      successBasePath="/staff/payments"
      initialMode={initialMode}
      initialServiceKind={initialKind}
    />
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  gateTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  gateBody: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 22,
    maxWidth: 420,
  },
  gateBtn: {
    backgroundColor: '#635bff',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 12,
  },
  gateBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
