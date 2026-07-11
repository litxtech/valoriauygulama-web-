import { useEffect } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import {
  buildPublicBreakfastPassDocumentUrl,
  isStaticBreakfastPassDocumentLoaded,
} from '@/lib/breakfastPassPortalUrl';

/** Web: Expo /breakfast-pass → statik misafir kartı (dist/breakfast-pass/index.html) */
export function BreakfastPassWebPortalRedirect({ token }: { token: string }) {
  const portalUrl = buildPublicBreakfastPassDocumentUrl(token, { bustCache: true });

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !portalUrl) return;
    if (isStaticBreakfastPassDocumentLoaded()) return;
    window.location.replace(portalUrl);
  }, [portalUrl]);

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#166534" />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#eef2f7',
  },
});
