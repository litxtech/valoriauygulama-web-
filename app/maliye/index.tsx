import { useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { supabaseUrl } from '@/lib/supabase';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';

/** valoria.tr/maliye — denetim portalı (Supabase Edge HTML) */
export default function PublicMaliyeScreen() {
  const params = useLocalSearchParams<{ token?: string }>();
  const token =
    (typeof params.token === 'string' && params.token.trim()) || FIXED_MALIYE_QR_TOKEN;

  const portalUri = useMemo(() => {
    const base = (supabaseUrl ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '');
    if (!base) return '';
    return `${base}/functions/v1/public-maliye?token=${encodeURIComponent(token)}`;
  }, [token]);

  if (!portalUri) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <iframe
        title="Valoria Maliye"
        src={portalUri}
        style={{
          position: 'fixed',
          inset: 0,
          width: '100%',
          height: '100%',
          border: 'none',
          background: '#0b1220',
        }}
      />
    );
  }

  return <WebView source={{ uri: portalUri }} style={styles.webview} startInLoadingState />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
  webview: { flex: 1, backgroundColor: '#0b1220' },
});
