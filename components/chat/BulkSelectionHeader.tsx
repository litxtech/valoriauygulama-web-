import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatTheme } from '@/constants/chatTheme';

type Props = {
  count: number;
  onClose: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  deleteDisabled?: boolean;
  label?: (count: number) => string;
  /** Varsayılan başlık: sohbet listesi çoklu seçim */
  selectionKind?: 'chats' | 'items';
};

export function BulkSelectionHeader({
  count,
  onClose,
  onDelete,
  onSelectAll,
  deleteDisabled,
  label,
  selectionKind = 'chats',
}: Props) {
  const { t } = useTranslation();
  const title = label
    ? label(count)
    : selectionKind === 'chats'
      ? t('staffChatBulkChatsSelected', { count })
      : t('staffChatBulkSelected', { count });

  return (
    <View style={styles.bar}>
      <Pressable onPress={onClose} hitSlop={12} style={styles.iconBtn}>
        <Ionicons name="close" size={24} color={chatTheme.text} />
      </Pressable>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.actions}>
        {onSelectAll ? (
          <Pressable onPress={onSelectAll} hitSlop={12} style={styles.iconBtn}>
            <Ionicons name="checkbox-outline" size={22} color={chatTheme.text} />
          </Pressable>
        ) : null}
        {onDelete ? (
          <Pressable
            onPress={onDelete}
            disabled={deleteDisabled || count === 0}
            hitSlop={12}
            style={[styles.iconBtn, (deleteDisabled || count === 0) && styles.disabled]}
          >
            <Ionicons name="trash-outline" size={22} color={chatTheme.danger} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: chatTheme.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chatTheme.border,
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: chatTheme.text,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  iconBtn: {
    padding: 6,
  },
  disabled: {
    opacity: 0.35,
  },
});
