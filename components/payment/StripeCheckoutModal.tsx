import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { parsePaymentCheckoutReturnUrl } from '@/lib/paymentCheckoutIntercept';
import { subscribePaymentRequestStatus } from '@/lib/payments';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

type Props = {
  visible: boolean;
  payUrl: string;
  paymentRequestId: string;
  title?: string;
  onClose: () => void;
  onFinished?: (result: { status: 'success' | 'cancel'; paymentRequestId: string }) => void;
};

export function StripeCheckoutModal({
  visible,
  payUrl,
  paymentRequestId,
  title = 'Güvenli ödeme',
  onClose,
  onFinished,
}: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const finishedRef = useRef(false);

  const finish = useCallback(
    (status: 'success' | 'cancel', id?: string, token?: string) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onClose();
      onFinished?.({ status, paymentRequestId });
      router.push({
        pathname: `/payment/${status}`,
        params: { id: id || paymentRequestId, token: token ?? '' },
      });
    },
    [onClose, onFinished, paymentRequestId, router]
  );

  useEffect(() => {
    if (!visible) {
      finishedRef.current = false;
      setLoading(true);
      return;
    }

    return subscribePaymentRequestStatus(paymentRequestId, (patch) => {
      if (patch.status === 'paid') finish('success');
    });
  }, [visible, paymentRequestId, finish]);

  const tryIntercept = useCallback(
    (url: string | undefined | null): boolean => {
      if (!url) return true;
      const hit = parsePaymentCheckoutReturnUrl(url);
      if (!hit) return true;
      finish(hit.status, hit.id, hit.token);
      return false;
    },
    [finish]
  );

  const onNavChange = useCallback(
    (nav: WebViewNavigation) => {
      tryIntercept(nav.url);
    },
    [tryIntercept]
  );

  const handleClose = () => {
    finish('cancel');
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.85} hitSlop={8}>
            <Ionicons name="close" size={22} color={partnerTheme.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Ionicons name="lock-closed" size={14} color={partnerTheme.accent} />
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
          <View style={styles.closeBtn} />
        </View>

        <View style={styles.webWrap}>
          {loading ? (
            <View style={styles.loader}>
              <ActivityIndicator size="large" color={partnerTheme.accent} />
              <Text style={styles.loaderText}>Stripe ödeme sayfası açılıyor…</Text>
            </View>
          ) : null}
          <WebView
            source={{ uri: payUrl }}
            originWhitelist={['*']}
            setSupportMultipleWindows={false}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onNavigationStateChange={onNavChange}
            onShouldStartLoadWithRequest={(req) => tryIntercept(req.url)}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            style={styles.webview}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: partnerTheme.cardBorder,
    backgroundColor: partnerTheme.card,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  headerTitle: { color: partnerTheme.text, fontWeight: '800', fontSize: 15 },
  webWrap: { flex: 1, backgroundColor: '#fff' },
  webview: { flex: 1, backgroundColor: '#fff' },
  loader: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: partnerTheme.bg,
    gap: 12,
  },
  loaderText: { color: partnerTheme.muted, fontSize: 13, fontWeight: '600' },
});
