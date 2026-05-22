import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { buildPublicMaliyePortalUrl, isMaliyePortalUrl } from '@/lib/maliyePortalUrl';

/** Web: valoria.tr/maliye → doğrudan canlı Edge HTML (Expo unmatched önlenir). */
export function MaliyeWebPortalRedirect({ token }: { token?: string }) {
  const portalUrl = buildPublicMaliyePortalUrl(token);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !portalUrl) return;
    if (!isMaliyePortalUrl(window.location.href)) {
      window.location.replace(portalUrl);
    }
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
