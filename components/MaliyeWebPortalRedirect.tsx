import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { buildPublicMaliyeWebUrl } from '@/lib/maliyePortalUrl';

function isStaticMaliyePortalLoaded(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.querySelector('script[src*="maliye-config"]');
}

/** Web: /maliye → statik portal HTML (Expo SPA / ham kaynak metni önlenir). */
export function MaliyeWebPortalRedirect({ token }: { token?: string }) {
  const portalUrl = buildPublicMaliyeWebUrl(token);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !portalUrl) return;
    if (isStaticMaliyePortalLoaded()) return;
    window.location.replace(portalUrl);
  }, [portalUrl]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#93c5fd" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0b1220' },
});
