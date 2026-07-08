import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';

/** ePasaport NFC yalnızca EIdReader native modülü olan dev client / EAS build içinde çalışır. */
export function NfcNativeBuildRequired() {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('kbsNfcNativeBuildTitle')}</Text>
      <Text style={styles.body}>{t('kbsNfcNativeBuildBody')}</Text>
      <Text style={styles.cmd}>eas build --profile development --platform ios</Text>
      <Text style={styles.cmd}>eas build --profile development --platform android</Text>
      <Text style={styles.hint}>{t('kbsNfcNativeBuildHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0b1220',
  },
  title: { fontSize: 18, fontWeight: '900', color: '#fff', marginBottom: 10 },
  body: { fontSize: 14, color: 'rgba(255,255,255,0.75)', lineHeight: 21, marginBottom: 16 },
  cmd: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#93c5fd',
    fontWeight: '700',
    marginBottom: 6,
  },
  hint: { marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 18 },
});
