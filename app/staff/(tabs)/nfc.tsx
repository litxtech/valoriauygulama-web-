import { Component, type ErrorInfo, type ReactNode, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import KbsNfcCaptureScreen from '@/components/kbs/KbsNfcCaptureScreen';

type BoundaryProps = { children: ReactNode };
type BoundaryState = { error: Error | null };

class NfcScreenErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[NFC screen]', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <NfcCrashFallback
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function NfcCrashFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const goHome = useCallback(() => {
    router.replace('/staff/(tabs)' as never);
  }, [router]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('kbsNfcCaptureTitle')}</Text>
      <Text style={styles.body}>{t('kbsNfcScreenCrash')}</Text>
      <Text style={styles.detail} numberOfLines={4}>
        {message}
      </Text>
      <TouchableOpacity style={styles.btn} onPress={onRetry}>
        <Text style={styles.btnText}>{t('kbsNfcRetryChip')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.btnGhost} onPress={goHome}>
        <Text style={styles.btnGhostText}>{t('back')}</Text>
      </TouchableOpacity>
    </View>
  );
}

/** NFC sekmesi — doğrudan açılır; KBS Redirect tuzağı yok. */
export default function StaffNfcTab() {
  return (
    <NfcScreenErrorBoundary>
      <KbsNfcCaptureScreen />
    </NfcScreenErrorBoundary>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  title: { color: '#38bdf8', fontSize: 20, fontWeight: '900' },
  body: { color: '#e2e8f0', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  detail: { color: '#94a3b8', fontSize: 12, textAlign: 'center', marginBottom: 8 },
  btn: {
    marginTop: 8,
    backgroundColor: '#0ea5e9',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  btnText: { color: '#fff', fontWeight: '800' },
  btnGhost: { padding: 12 },
  btnGhostText: { color: '#94a3b8', fontWeight: '700' },
});
