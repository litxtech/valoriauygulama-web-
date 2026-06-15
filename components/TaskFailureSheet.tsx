import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { useTranslation } from 'react-i18next';

type Props = {
  visible: boolean;
  taskTitle: string;
  saving?: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
};

export function TaskFailureSheet({ visible, taskTitle, saving, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [reason, setReason] = useState('');

  const footerBottomPad =
    getEffectiveBottomInset(insets) + theme.spacing.lg + (Platform.OS === 'android' ? 12 : 0);

  useEffect(() => {
    if (!visible) setReason('');
  }, [visible]);

  const close = () => {
    if (saving) return;
    setReason('');
    onClose();
  };

  const handleSubmit = () => {
    const trimmed = reason.trim();
    if (trimmed.length < 3) return;
    onSubmit(trimmed);
  };

  const canSubmit = reason.trim().length >= 3;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'fullScreen'}
      onRequestClose={close}
    >
      <SafeAreaView style={styles.sheet} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('taskFailSheetTitle')}</Text>
          <TouchableOpacity onPress={close} hitSlop={12} disabled={saving}>
            <Ionicons name="close" size={26} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.taskName} numberOfLines={3}>
            {taskTitle}
          </Text>
          <Text style={styles.hint}>{t('taskFailSheetHint')}</Text>

          <Text style={styles.label}>{t('taskFailSheetReasonLabel')}</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder={t('taskFailSheetReasonPlaceholder')}
            style={[styles.input, styles.textarea]}
            multiline
            maxLength={500}
            editable={!saving}
            autoFocus
          />
          <Text style={styles.charCount}>{reason.trim().length}/500</Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: footerBottomPad }]}>
          <TouchableOpacity style={styles.cancelBtn} onPress={close} disabled={saving}>
            <Text style={styles.cancelBtnText}>{t('cancelAction')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, !canSubmit && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={saving || !canSubmit}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="alert-circle-outline" size={20} color="#fff" />
                <Text style={styles.submitBtnText}>{t('staffTasks_couldNotBtn')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: theme.colors.background },
  scrollView: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  scroll: { padding: theme.spacing.lg, paddingBottom: 24 },
  taskName: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  hint: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 16 },
  label: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  textarea: { minHeight: 120, textAlignVertical: 'top' },
  charCount: { fontSize: 11, color: theme.colors.textMuted, textAlign: 'right', marginTop: 6 },
  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    ...(Platform.OS === 'android' ? { elevation: 8, zIndex: 10 } : {}),
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  submitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.error,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
  },
  submitBtnDisabled: { opacity: 0.45 },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '800', flexShrink: 1 },
});
