import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import { AvatarWithBadge } from '@/components/VerifiedBadge';
import { chatTheme } from '@/constants/chatTheme';
import { formatChatMessageDateTime } from '@/lib/formatChatTime';
import type { ChatMessageReaderRow } from '@/lib/chatMessageReaders';

type Props = {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  readers: ChatMessageReaderRow[];
  isGroup: boolean;
};

function ReaderRow({ item }: { item: ChatMessageReaderRow }) {
  const { t } = useTranslation();
  const name = item.display_name;
  const initial = name.charAt(0).toUpperCase();
  return (
    <View style={styles.row}>
      <AvatarWithBadge badge={item.verification_badge} avatarSize={44} badgeSize={12} showBadge={false}>
        {item.viewer_avatar ? (
          <CachedImage uri={item.viewer_avatar} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarPlaceholder]}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </View>
        )}
      </AvatarWithBadge>
      <View style={styles.rowBody}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.meta, item.has_read ? styles.metaRead : styles.metaPending]}>
          {item.has_read && item.read_at
            ? formatChatMessageDateTime(item.read_at)
            : t('staffChatReadersNotRead')}
        </Text>
      </View>
      {item.has_read ? (
        <Ionicons name="checkmark-done" size={18} color={chatTheme.readCheck} />
      ) : (
        <Ionicons name="checkmark" size={18} color={chatTheme.deliveredCheck} />
      )}
    </View>
  );
}

export function MessageReadersModal({ visible, onClose, loading, readers, isGroup }: Props) {
  const { t } = useTranslation();
  const { height } = useWindowDimensions();
  const read = readers.filter((r) => r.has_read);
  const pending = readers.filter((r) => !r.has_read);
  const title = isGroup ? t('staffChatReadersTitleGroup') : t('staffChatReadersTitleDirect');

  const sections: { key: string; title: string; data: ChatMessageReaderRow[] }[] = [];
  if (read.length) {
    sections.push({
      key: 'read',
      title: t('staffChatReadersSectionRead', { count: read.length }),
      data: read,
    });
  }
  if (pending.length) {
    sections.push({
      key: 'pending',
      title: t('staffChatReadersSectionPending', { count: pending.length }),
      data: pending,
    });
  }
  const flatData = sections.flatMap((s) => [
    { type: 'header' as const, key: `h-${s.key}`, title: s.title },
    ...s.data.map((r) => ({ type: 'row' as const, key: r.id, item: r })),
  ]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { maxHeight: height * 0.62 }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Ionicons name="close" size={26} color={chatTheme.text} />
            </Pressable>
          </View>
          {loading ? (
            <ActivityIndicator size="large" color={chatTheme.accent} style={styles.loader} />
          ) : readers.length === 0 ? (
            <Text style={styles.empty}>{t('staffChatReadersEmpty')}</Text>
          ) : (
            <FlatList
              data={flatData}
              keyExtractor={(entry) => entry.key}
              renderItem={({ item: entry }) =>
                entry.type === 'header' ? (
                  <Text style={styles.sectionTitle}>{entry.title}</Text>
                ) : (
                  <ReaderRow item={entry.item} />
                )
              }
              contentContainerStyle={styles.listContent}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: chatTheme.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: chatTheme.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: chatTheme.text,
  },
  loader: {
    marginVertical: 32,
  },
  empty: {
    textAlign: 'center',
    color: chatTheme.textMuted,
    fontSize: 15,
    marginVertical: 28,
  },
  listContent: {
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: chatTheme.textMuted,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarPlaceholder: {
    backgroundColor: chatTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 17,
    fontWeight: '700',
    color: chatTheme.text,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: chatTheme.text,
  },
  meta: {
    fontSize: 13,
    marginTop: 2,
  },
  metaRead: {
    color: chatTheme.textSecondary,
  },
  metaPending: {
    color: chatTheme.textMuted,
  },
});
