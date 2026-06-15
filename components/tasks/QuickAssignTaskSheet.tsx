import { Modal, View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { QuickAssignTaskForm } from '@/components/tasks/QuickAssignTaskForm';

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function QuickAssignTaskSheet({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[styles.wrap, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="clipboard-outline" size={22} color={theme.colors.primary} />
          </View>
          <Text style={styles.title}>{t('quickAssign_title')}</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={26} color={theme.colors.text} />
          </Pressable>
        </View>
        <QuickAssignTaskForm
          showCancel
          onCancel={onClose}
          onSuccess={(count) => {
            Alert.alert(t('assignPage_successTitle'), t('quickAssign_success', { count }), [
              { text: t('ok'), onPress: onClose },
            ]);
          }}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  headerIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: theme.colors.text },
  closeBtn: { padding: 4 },
});
