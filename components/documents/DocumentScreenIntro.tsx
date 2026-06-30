import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DOC_SCREEN_INTROS } from '@/constants/documentManagementCopy';
import { docTheme } from '@/constants/documentManagementTheme';

type Props = {
  screenKey: keyof typeof DOC_SCREEN_INTROS;
};

export function DocumentScreenIntro({ screenKey }: Props) {
  const meta = DOC_SCREEN_INTROS[screenKey];
  if (!meta) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Ionicons name={meta.icon} size={20} color={docTheme.accent} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{meta.title}</Text>
        <Text style={styles.description}>{meta.description}</Text>
        {meta.tip ? (
          <View style={styles.tipRow}>
            <Ionicons name="bulb-outline" size={14} color={docTheme.accentDark} />
            <Text style={styles.tip}>{meta.tip}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: docTheme.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: docTheme.border,
    padding: 14,
    marginBottom: 14,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: docTheme.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '800', color: docTheme.text },
  description: { fontSize: 13, color: docTheme.textMuted, lineHeight: 19 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 6 },
  tip: { flex: 1, fontSize: 12, color: docTheme.accentDark, fontWeight: '600', lineHeight: 17 },
});
