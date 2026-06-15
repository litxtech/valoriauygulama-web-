import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { chatLayout } from '@/constants/chatTheme';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { formatChatListPreview } from '@/lib/chatPreviewText';
import type { ConversationWithMeta } from '@/lib/messaging';

const ALL_STAFF_GROUP_NAME_DB = 'Tüm Çalışanlar';

export type ChatListItemProps = {
  item: ConversationWithMeta;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  timeLabel: string;
  displayName: string;
  staffId?: string;
  lastMessageByMe?: boolean;
  isRead?: boolean;
  isDelivered?: boolean;
};

export function ChatListItem({
  item,
  selected,
  selectionMode,
  onPress,
  onLongPress,
  timeLabel,
  displayName,
  lastMessageByMe,
  isRead,
}: ChatListItemProps) {
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);

  const unread = item.unread_count ?? 0;
  const isGroup = item.type === 'group';
  const isAllStaff = isGroup && item.name === ALL_STAFF_GROUP_NAME_DB;
  const avatarUri = (item.type === 'direct' ? item.other_avatar : item.avatar) as string | null | undefined;

  const preview = formatChatListPreview(item.last_message_preview, null, {
    unreadCount: unread,
  });

  const showStatus = lastMessageByMe && !selectionMode && unread === 0;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={({ pressed }) => [
        styles.row,
        selected && styles.rowSelected,
        pressed && !selectionMode && styles.rowPressed,
      ]}
    >
      {selectionMode ? (
        <View style={styles.checkWrap}>
          <Ionicons
            name={selected ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={selected ? chat.accentPurple : chat.textMuted}
          />
        </View>
      ) : null}
      <View style={[styles.avatarWrap, isAllStaff && styles.avatarGroup]}>
        {isAllStaff ? (
          <Ionicons name="people" size={22} color="#fff" />
        ) : avatarUri ? (
          <CachedImage uri={avatarUri} style={styles.avatarImg} contentFit="cover" />
        ) : (
          <Text style={styles.avatarLetter}>{displayName.charAt(0).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.timeRow}>
            {showStatus ? (
              <Ionicons
                name={isRead ? 'checkmark-done' : 'checkmark'}
                size={14}
                color={isRead ? chat.readCheck : chat.deliveredCheck}
                style={styles.statusIcon}
              />
            ) : null}
            <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{timeLabel}</Text>
          </View>
        </View>
        <View style={styles.previewRow}>
          <Text
            style={[styles.preview, unread > 0 ? styles.previewUnread : null]}
            numberOfLines={1}
          >
            {preview || '—'}
          </Text>
          {unread > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function createStyles(chat: ChatThemePalette) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: chatLayout.listRowHeight,
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: chat.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
    },
    rowSelected: {
      backgroundColor: chat.selected,
    },
    rowPressed: {
      backgroundColor: chat.selected,
    },
    checkWrap: {
      marginRight: 10,
    },
    avatarWrap: {
      width: chatLayout.avatarSize,
      height: chatLayout.avatarSize,
      borderRadius: chatLayout.avatarSize / 2,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 12,
      overflow: 'hidden',
    },
    avatarGroup: {
      backgroundColor: '#8B6914',
    },
    avatarImg: {
      width: chatLayout.avatarSize,
      height: chatLayout.avatarSize,
    },
    avatarLetter: {
      color: '#fff',
      fontSize: 18,
      fontWeight: '700',
    },
    body: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: 3,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    name: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: chat.text,
    },
    nameUnread: {
      fontWeight: '700',
    },
    timeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    statusIcon: {
      marginRight: 2,
    },
    time: {
      fontSize: 12,
      color: chat.textMuted,
    },
    timeUnread: {
      color: chat.accent,
      fontWeight: '600',
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    preview: {
      flex: 1,
      fontSize: 14,
      color: chat.textSecondary,
    },
    previewUnread: {
      color: chat.text,
      fontWeight: '500',
    },
    badge: {
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: chat.unreadBadge,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 5,
    },
    badgeText: {
      color: '#fff',
      fontSize: 11,
      fontWeight: '700',
    },
  });
}
