import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useAppScreenshotWarningStore } from '@/stores/appScreenshotWarningStore';
import { screenshotPolicyText } from '@/lib/appScreenshotPolicyI18n';

export function AppScreenshotWarningModal() {
  const visible = useAppScreenshotWarningStore((s) => s.visible);
  const dismiss = useAppScreenshotWarningStore((s) => s.dismiss);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Ionicons name="camera-outline" size={32} color={theme.colors.error} />
          </View>
          <Text style={styles.title}>{screenshotPolicyText('screenshotProhibitedTitle')}</Text>
          <Text style={styles.body}>{screenshotPolicyText('screenshotProhibitedBody')}</Text>
          <TouchableOpacity style={styles.btn} onPress={dismiss} activeOpacity={0.88}>
            <Text style={styles.btnText}>{screenshotPolicyText('screenshotProhibitedOk')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    ...theme.shadows.md,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.error + '14',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  btn: {
    alignSelf: 'stretch',
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
