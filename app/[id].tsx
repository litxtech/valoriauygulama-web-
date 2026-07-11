import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Redirect, useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { PUBLIC_BREAKFAST_PASS_PATH, PUBLIC_MALIYE_PATH } from '@/constants/publicWebPaths';

/** valoria://tech-asset/<uuid> bağlantılarında pathname tek segment "/<uuid>" olur; Expo Router bu ekranı eşleştirir. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PUBLIC_SINGLE_SEGMENT = new Set([
  PUBLIC_BREAKFAST_PASS_PATH,
  PUBLIC_MALIYE_PATH,
  'maliye',
  'menu',
  'menü',
  'guest',
  'login',
  'auth',
  'payment',
  'odeme',
]);

export default function TechAssetDeepLinkRootRedirect() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; token?: string; t?: string }>();
  const raw = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : '';
  const isUuid = !!raw && UUID_RE.test(raw);
  const loading = useAuthStore((s) => s.loading);
  const staff = useAuthStore((s) => s.staff);

  useEffect(() => {
    if (!isUuid) return;
    if (loading) return;
    if (staff) {
      router.replace({ pathname: '/staff/technical-assets/[id]', params: { id: raw } } as never);
    } else {
      router.replace('/');
    }
  }, [isUuid, raw, loading, staff, router]);

  if (!isUuid) {
    if (raw?.toLowerCase() === PUBLIC_BREAKFAST_PASS_PATH) {
      const token = (params.token ?? params.t ?? '').trim();
      return (
        <Redirect
          href={
            token
              ? { pathname: '/breakfast-pass', params: { token } }
              : '/breakfast-pass'
          }
        />
      );
    }
    if (raw && PUBLIC_SINGLE_SEGMENT.has(raw.toLowerCase())) {
      return <Redirect href={`/${raw}` as '/'} />;
    }
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color="#1a365d" />
      <Text style={styles.hint}>Teknik varlık açılıyor…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7fafc' },
  hint: { marginTop: 12, fontSize: 14, color: '#4a5568' },
});
