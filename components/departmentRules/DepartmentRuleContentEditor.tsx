import { useRef } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';

type ToolbarAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  insert: string;
};

const TOOLBAR: ToolbarAction[] = [
  { icon: 'text', label: 'Başlık', insert: '\n## ' },
  { icon: 'remove-outline', label: 'Alt başlık', insert: '\n### ' },
  { icon: 'bold', label: 'Kalın', insert: '**kalın metin**' },
  { icon: 'list-outline', label: 'Madde', insert: '\n- ' },
  { icon: 'reorder-four-outline', label: 'Numara', insert: '\n1. ' },
  { icon: 'warning-outline', label: 'Uyarı', insert: '\n> ' },
  { icon: 'alert-circle-outline', label: 'Acil', insert: '\n!!! ' },
  { icon: 'create-outline', label: 'İmza', insert: '\n[imza]\n' },
];

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
};

export function DepartmentRuleContentEditor({ value, onChange, placeholder }: Props) {
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: value.length, end: value.length });

  const insertAtCursor = (snippet: string) => {
    const { start, end } = selectionRef.current;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const next = `${before}${snippet}${after}`;
    onChange(next);
    const newPos = start + snippet.length;
    selectionRef.current = { start: newPos, end: newPos };
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Kural metni</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolbar} contentContainerStyle={styles.toolbarInner}>
        {TOOLBAR.map((t) => (
          <TouchableOpacity key={t.label} style={styles.toolBtn} onPress={() => insertAtCursor(t.insert)} activeOpacity={0.75}>
            <Ionicons name={t.icon} size={16} color={adminTheme.colors.primaryMuted} />
            <Text style={styles.toolLabel}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TextInput
        ref={inputRef}
        style={styles.input}
        multiline
        textAlignVertical="top"
        value={value}
        onChangeText={onChange}
        onSelectionChange={(e) => {
          selectionRef.current = e.nativeEvent.selection;
        }}
        placeholder={placeholder ?? 'Kural ve talimat metnini yazın…'}
        placeholderTextColor={adminTheme.colors.textMuted}
      />
      <Text style={styles.hint}>## Başlık · ### Alt başlık · - madde · 1. numara · &gt; uyarı · !!! acil · [imza]</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8 },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text, marginBottom: 8 },
  toolbar: { marginBottom: 8, maxHeight: 44 },
  toolbarInner: { gap: 6, paddingVertical: 2 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  toolLabel: { fontSize: 11, color: adminTheme.colors.textMuted, fontWeight: '600' },
  input: {
    minHeight: 220,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    lineHeight: 22,
    color: adminTheme.colors.text,
    backgroundColor: '#fff',
  },
  hint: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 6 },
});
