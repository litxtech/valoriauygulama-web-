import { useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import { isPaymentPublicPath, navigateToPaymentBridge } from '@/lib/paymentPortalUrl';

/** Web: eski valoria.tr /payment/* → Supabase Edge */
export function PaymentWebPortalRedirect() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const path = (window.location.pathname || '').replace(/\/$/, '') || '/';
    if (!isPaymentPublicPath(path)) return;

    const search = window.location.search || '';
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    if (!(params.get('t') ?? params.get('token') ?? '').trim()) {
      setError('Ödeme bağlantısı eksik.');
      return;
    }

    navigateToPaymentBridge(path, search);
  }, []);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <Text style={styles.title}>Stripe güvenli ödeme sayfasına yönlendiriliyorsunuz…</Text>
      <ActivityIndicator size="large" color="#635bff" style={styles.spinner} />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f172a',
  },
  title: { color: '#e2e8f0', fontSize: 15, textAlign: 'center', marginBottom: 16 },
  spinner: { marginTop: 8 },
  error: { color: '#fca5a5', fontSize: 15, textAlign: 'center', lineHeight: 22 },
});
