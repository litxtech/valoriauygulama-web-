import { View, Text, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';

/** VisionCamera + ML Kit yalnızca native dev client / EAS build içinde çalışır. */
export function MrzNativeBuildRequired() {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{t('kbsMrzNativeBuildTitle')}</Text>
      <Text style={styles.body}>{t('kbsMrzNativeBuildBody')}</Text>
      <Text style={styles.cmd}>npx expo run:ios</Text>
      <Text style={styles.cmd}>npx expo run:android</Text>
      <Text style={styles.hint}>{t('kbsMrzNativeBuildHint')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 10 },
  body: { fontSize: 14, color: theme.colors.textSecondary, lineHeight: 21, marginBottom: 16 },
  cmd: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '700',
    marginBottom: 6,
  },
  hint: { marginTop: 12, fontSize: 12, color: theme.colors.textMuted, lineHeight: 18 },
});
