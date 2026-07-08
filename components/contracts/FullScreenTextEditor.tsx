import { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';

type Props = {
  visible: boolean;
  title: string;
  initialValue: string;
  placeholder?: string;
  onCancel: () => void;
  onSave: (text: string) => void;
};

type Sel = { start: number; end: number };

/** Uzun sözleşme metni için rahat tam ekran editör: tümünü seç, başa/sona git, kaydırma. */
export function FullScreenTextEditor({
  visible,
  title,
  initialValue,
  placeholder,
  onCancel,
  onSave,
}: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [text, setText] = useState(initialValue);
  const [selection, setSelection] = useState<Sel | null>(null);

  useEffect(() => {
    if (visible) {
      setText(initialValue);
      setSelection(null);
    }
  }, [visible, initialValue]);

  const charCount = text.length;
  const lineCount = text ? text.split('\n').length : 0;
  const dirty = text !== initialValue;

  const selectAll = () => {
    inputRef.current?.focus();
    setSelection({ start: 0, end: text.length });
  };

  const goTo = (pos: 'top' | 'bottom') => {
    inputRef.current?.focus();
    const at = pos === 'top' ? 0 : text.length;
    setSelection({ start: at, end: at });
  };

  const clearAll = () => {
    setText('');
    setSelection({ start: 0, end: 0 });
    inputRef.current?.focus();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} presentationStyle="fullScreen">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={onCancel} hitSlop={8}>
            <Ionicons name="close" size={24} color={adminTheme.colors.text} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.headerMeta}>
              {lineCount} satır · {charCount} karakter
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.saveBtn, !dirty && styles.saveBtnMuted]}
            onPress={() => onSave(text)}
            hitSlop={8}
          >
            <Text style={styles.saveBtnText}>Bitti</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.toolbar}
          contentContainerStyle={styles.toolbarContent}
          keyboardShouldPersistTaps="always"
        >
          <ToolBtn icon="checkmark-done-outline" label="Tümünü seç" onPress={selectAll} />
          <ToolBtn icon="arrow-up-outline" label="Başa git" onPress={() => goTo('top')} />
          <ToolBtn icon="arrow-down-outline" label="Sona git" onPress={() => goTo('bottom')} />
          <ToolBtn icon="trash-outline" label="Temizle" onPress={clearAll} danger />
        </ScrollView>

        <KeyboardAvoidingView
          style={styles.body}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={insets.top + 8}
        >
          <TextInput
            ref={inputRef}
            style={[styles.input, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (selection) setSelection(null);
            }}
            selection={selection ?? undefined}
            onSelectionChange={(e) => {
              if (!selection) return;
              const s = e.nativeEvent.selection;
              if (!(s.start === selection.start && s.end === selection.end)) setSelection(null);
            }}
            multiline
            scrollEnabled
            textAlignVertical="top"
            autoCorrect={false}
            autoCapitalize="sentences"
            placeholder={placeholder}
            placeholderTextColor={adminTheme.colors.textMuted}
          />
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function ToolBtn({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.toolBtn} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={18} color={danger ? adminTheme.colors.error : adminTheme.colors.primary} />
      <Text style={[styles.toolBtnText, danger && styles.toolBtnTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, marginHorizontal: 8 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  headerMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  saveBtn: {
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
  },
  saveBtnMuted: { opacity: 0.55 },
  saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  toolbar: {
    maxHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  toolbarContent: { paddingHorizontal: 10, paddingVertical: 8, gap: 8, alignItems: 'center' },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  toolBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  toolBtnTextDanger: { color: adminTheme.colors.error },
  body: { flex: 1 },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: adminTheme.colors.text,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
});
