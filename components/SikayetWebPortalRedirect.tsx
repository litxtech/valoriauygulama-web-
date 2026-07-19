import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import {
  buildPublicSikayetDocumentUrl,
  isStaticSikayetDocumentLoaded,
} from '@/lib/sikayetPortalUrl';

/** Web: Expo /sikayet → statik şikayet formu (dist/sikayet/index.html) */
export function SikayetWebPortalRedirect() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (isStaticSikayetDocumentLoaded()) return;
    const portalUrl = buildPublicSikayetDocumentUrl({
      bustCache: true,
      search: window.location.search || '',
    });
    window.location.replace(portalUrl);
  }, []);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#c9a227" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#070b14',
  },
});
