import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';

type Props = {
  approverName: string;
  footerNote: string;
  onApproverChange: (v: string) => void;
  onFooterNoteChange: (v: string) => void;
  editable?: boolean;
  compact?: boolean;
};

export function MealMenuPdfSettingsCard({
  approverName,
  footerNote,
  onApproverChange,
  onFooterNoteChange,
  editable = true,
  compact = false,
}: Props) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {!compact ? (
        <>
          <View style={styles.head}>
            <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.primary} />
            <Text style={styles.title}>PDF / yazdırma ayarları</Text>
          </View>
          <Text style={styles.hint}>A4 çıktıda otel adı ve dönem otomatik eklenir.</Text>
        </>
      ) : null}

      <Text style={styles.label}>Hazırlayan</Text>
      {editable ? (
        <TextInput
          style={styles.input}
          value={approverName}
          onChangeText={onApproverChange}
          placeholder="Örn. Soner Toprak"
          placeholderTextColor={adminTheme.colors.textMuted}
        />
      ) : (
        <Text style={styles.readonly}>{approverName}</Text>
      )}

      <Text style={styles.label}>Kurumsal not</Text>
      {editable ? (
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={footerNote}
          onChangeText={onFooterNoteChange}
          placeholder="PDF altında görünecek not"
          placeholderTextColor={adminTheme.colors.textMuted}
          multiline
          textAlignVertical="top"
        />
      ) : (
        <Text style={styles.readonlyNote}>{footerNote}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 14,
    marginBottom: 12,
  },
  wrapCompact: {
    borderWidth: 0,
    padding: 0,
    marginBottom: 0,
    backgroundColor: 'transparent',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  title: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  hint: { fontSize: 12, lineHeight: 18, color: adminTheme.colors.textMuted, marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  noteInput: { minHeight: 64 },
  readonly: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text, marginBottom: 12 },
  readonlyNote: { fontSize: 14, lineHeight: 21, color: adminTheme.colors.text, marginBottom: 4 },
});
