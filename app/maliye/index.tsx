import { useEffect } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { FIXED_MALIYE_QR_TOKEN } from '@/constants/maliyeQr';
import { buildPublicMaliyeWebUrl } from '@/lib/maliyePortalUrl';
import { openPublicMaliyePortal } from '@/lib/openMaliyePortal';

function resolveMaliyeToken(params: { token?: string; t?: string }): string {
  const raw =
    (typeof params.token === 'string' && params.token.trim()) ||
    (typeof params.t === 'string' && params.t.trim()) ||
    '';
  return raw || FIXED_MALIYE_QR_TOKEN;
}

/** valoria.tr/maliye — statik denetim portalı (Vercel); native’de sistem tarayıcısı */
export default function PublicMaliyeScreen() {
  const params = useLocalSearchParams<{ token?: string; t?: string }>();
  const token = resolveMaliyeToken(params);
  const portalUrl = buildPublicMaliyeWebUrl(token);

  useEffect(() => {
    if (!portalUrl) return;
    if (Platform.OS === 'web') {
      openPublicMaliyePortal(token);
      return;
    }
    void Linking.openURL(portalUrl);
  }, [portalUrl, token]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#93c5fd" />
      {Platform.OS !== 'web' ? (
        <Text style={styles.hint}>Maliye portalı tarayıcıda açılıyor…</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0b1220',
    padding: 24,
  },
  hint: { marginTop: 16, color: 'rgba(255,255,255,0.75)', fontSize: 14, textAlign: 'center' },
});
