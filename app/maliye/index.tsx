import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MaliyePortalWebView } from '@/components/MaliyePortalWebView';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';
import { buildPublicMaliyeDocumentUrl } from '@/lib/maliyePortalUrl';
import { openPublicMaliyePortal } from '@/lib/openMaliyePortal';

function resolveMaliyeToken(params: { token?: string; t?: string }): string {
  const raw =
    (typeof params.token === 'string' && params.token.trim()) ||
    (typeof params.t === 'string' && params.t.trim()) ||
    '';
  return raw || FIXED_MALIYE_QR_TOKEN;
}

/** valoria.tr/maliye/index.html — statik portal; native’de WebView */
export default function PublicMaliyeScreen() {
  const params = useLocalSearchParams<{ token?: string; t?: string }>();
  const token = resolveMaliyeToken(params);
  const portalUrl = buildPublicMaliyeDocumentUrl(token);

  useEffect(() => {
    if (Platform.OS === 'web') openPublicMaliyePortal(token);
  }, [token]);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#93c5fd" />
      </View>
    );
  }

  if (!portalUrl) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#93c5fd" />
      </View>
    );
  }

  return <MaliyePortalWebView uri={portalUrl} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0b1220',
  },
});
