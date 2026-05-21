import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

/** /sozlesme ve /sözleşme → misafir sözleşme onayı */
export default function SozlesmePublicAliasScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ t?: string; token?: string; l?: string; lang?: string }>();

  useEffect(() => {
    const t = (typeof params.t === 'string' ? params.t : params.token) ?? '';
    const l =
      (typeof params.l === 'string' ? params.l : typeof params.lang === 'string' ? params.lang : '') || 'tr';
    router.replace({ pathname: '/guest/sign-one', params: { t, l } });
  }, [router, params.t, params.token, params.l, params.lang]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#1a365d" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f6f8' },
});
