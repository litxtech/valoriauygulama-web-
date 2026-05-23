import { Platform, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

type Props = {
  uri: string;
};

/** Statik maliye portalı — Edge HTML’i düz metin göstermemek için valoria.tr/maliye/index.html */
export function MaliyePortalWebView({ uri }: Props) {
  if (!uri) return null;

  return (
    <View style={styles.root}>
      <WebView
        source={{ uri }}
        style={styles.webview}
        originWhitelist={['https://*', 'http://*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        setSupportMultipleWindows={false}
        startInLoadingState
        allowsBackForwardNavigationGestures
        {...(Platform.OS === 'android' ? { mixedContentMode: 'always' as const } : {})}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1220' },
  webview: { flex: 1, backgroundColor: '#0b1220' },
});
