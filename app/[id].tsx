import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

/** valoria://tech-asset/<uuid> bağlantılarında pathname tek segment "/<uuid>" olur; Expo Router bu ekranı eşleştirir. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default function TechAssetDeepLinkRootRedirect() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const raw = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : '';
  const loading = useAuthStore((s) => s.loading);
  const staff = useAuthStore((s) => s.staff);

  useEffect(() => {
    if (!raw) {
      router.replace('/');
      return;
    }
    if (!UUID_RE.test(raw)) {
      router.replace('/');
      return;
    }
    if (loading) return;
    if (staff) {
      router.replace({ pathname: '/staff/technical-assets/[id]', params: { id: raw } } as never);
    } else {
      router.replace('/');
    }
  }, [raw, loading, staff, router]);

  if (!raw || !UUID_RE.test(raw)) return null;

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
