import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import {
  buildPublicMaliyeDocumentUrl,
  isStaticMaliyeDocumentLoaded,
} from '@/lib/maliyePortalUrl';

/** Web: Expo /maliye rotası → statik belge (dist/maliye/index.html) */
export function MaliyeWebPortalRedirect({ token }: { token?: string }) {
  const portalUrl = buildPublicMaliyeDocumentUrl(token, { bustCache: true });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !portalUrl) return;
    if (isStaticMaliyeDocumentLoaded()) return;
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
