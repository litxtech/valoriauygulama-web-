import { Modal, View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatTheme } from '@/constants/chatTheme';

export type MessageAction = 'reply' | 'copy' | 'edit' | 'select' | 'info' | 'delete_me' | 'delete_all';

type Props = {
  visible: boolean;
  onClose: () => void;
  canDeleteForEveryone: boolean;
  showMessageInfo?: boolean;
  showEdit?: boolean;
  onAction: (action: MessageAction) => void;
};

export function MessageActionSheet({
  visible,
  onClose,
  canDeleteForEveryone,
  showMessageInfo = false,
  showEdit = false,
  onAction,
}: Props) {
  const { t } = useTranslation();

  const row = (action: MessageAction, label: string, icon: keyof typeof Ionicons.glyphMap, danger?: boolean) => (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => {
        onClose();
        onAction(action);
      }}
    >
      <Ionicons name={icon} size={20} color={danger ? chatTheme.danger : chatTheme.textSecondary} />
      <Text style={[styles.rowText, danger && styles.rowTextDanger]}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {row('reply', t('staffChatActionReply'), 'arrow-undo-outline')}
          {showEdit ? row('edit', t('staffChatActionEdit'), 'create-outline') : null}
          {row('copy', t('staffChatActionCopy'), 'copy-outline')}
          {showMessageInfo ? row('info', t('staffChatActionInfo'), 'information-circle-outline') : null}
          {row('select', t('staffChatActionSelect'), 'checkbox-outline')}
          {row('delete_me', t('staffChatActionDeleteMe'), 'trash-outline', true)}
          {canDeleteForEveryone ? row('delete_all', t('staffChatActionDeleteAll'), 'trash', true) : null}
          <Pressable style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>{t('cancel')}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: chatTheme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowPressed: {
    backgroundColor: chatTheme.background,
  },
  rowText: {
    fontSize: 16,
    color: chatTheme.text,
    fontWeight: '500',
  },
  rowTextDanger: {
    color: chatTheme.danger,
  },
  cancel: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatTheme.border,
  },
  cancelText: {
    fontSize: 16,
    color: chatTheme.textMuted,
    fontWeight: '600',
  },
});
