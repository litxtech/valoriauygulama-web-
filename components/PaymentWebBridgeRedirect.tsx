import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, usePathname } from 'expo-router';
import {
  buildPaymentPublicBridgeUrl,
  isPaymentPublicPath,
  paymentPublicBridgeFromToken,
  resolvePaymentEdgeFunctionFromPath,
  type PaymentEdgeFunction,
} from '@/lib/paymentPortalUrl';

type Props = {
  edgeFunction: PaymentEdgeFunction;
};

function hasPaymentToken(search: string): boolean {
  if (!search) return false;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return Boolean((params.get('t') ?? params.get('token') ?? '').trim());
}

function bridgeKindFromPath(pathname: string, edgeFunction: PaymentEdgeFunction): 'single' | 'qr' {
  const fn = resolvePaymentEdgeFunctionFromPath(pathname) ?? edgeFunction;
  return fn === 'open-payment-qr' ? 'qr' : 'single';
}

/** Expo köprüsü — valoria.tr/payment/qr üzerinden Stripe Checkout'a gider (Supabase URL gösterilmez) */
export function PaymentWebBridgeRedirect({ edgeFunction }: Props) {
  const pathname = usePathname();
  const params = useLocalSearchParams<{ t?: string; token?: string }>();
  const [error, setError] = useState<string | null>(null);

  const search = useMemo(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return window.location.search || '';
    }
    const token = (params.t ?? params.token ?? '').trim();
    return token ? `?t=${encodeURIComponent(token)}` : '';
  }, [params.t, params.token, pathname]);

  useEffect(() => {
    if (!hasPaymentToken(search)) {
      setError('Ödeme bağlantısı eksik veya geçersiz.');
      return;
    }

    const kind = bridgeKindFromPath(pathname, edgeFunction);
    const token = (params.t ?? params.token ?? '').trim();
    const target =
      Platform.OS === 'web'
        ? buildPaymentPublicBridgeUrl(pathname, search)
        : paymentPublicBridgeFromToken(kind, token || undefined);

    if (!target) {
      setError('Ödeme servisi yapılandırılmamış.');
      return;
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const current = `${window.location.origin}${window.location.pathname}${window.location.search}`;
      if (current !== target) {
        window.location.replace(target);
      }
      return;
    }

    void Linking.openURL(target).catch(() => {
      setError('Stripe ödeme sayfası açılamadı.');
    });
  }, [edgeFunction, params.t, params.token, pathname, search]);

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
