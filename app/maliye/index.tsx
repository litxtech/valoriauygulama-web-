import { useEffect, useMemo } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { WebView } from 'react-native-webview';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';
import { buildPublicMaliyePortalUrl, isMaliyePortalUrl } from '@/lib/maliyePortalUrl';

function resolveMaliyeToken(params: { token?: string; t?: string }): string {
  const raw =
    (typeof params.token === 'string' && params.token.trim()) ||
    (typeof params.t === 'string' && params.t.trim()) ||
    '';
  return raw || FIXED_MALIYE_QR_TOKEN;
}

/** valoria.tr/maliye — canlı denetim portalı (Supabase Edge public-maliye) */
export default function PublicMaliyeScreen() {
  const params = useLocalSearchParams<{ token?: string; t?: string }>();
  const token = resolveMaliyeToken(params);

  const portalUri = useMemo(() => buildPublicMaliyePortalUrl(token), [token]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !portalUri) return;
    if (!isMaliyePortalUrl(window.location.href)) {
      window.location.replace(portalUri);
    }
  }, [portalUri]);

  if (!portalUri) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1d4ed8" />
      </View>
    );
  }

  if (Platform.OS === 'web') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#93c5fd" />
      </View>
    );
  }

  return <WebView source={{ uri: portalUri }} style={styles.webview} startInLoadingState />;
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
  webview: { flex: 1, backgroundColor: '#0b1220' },
});
