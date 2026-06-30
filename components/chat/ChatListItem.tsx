import { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { chatLayout } from '@/constants/chatTheme';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { formatChatListPreview } from '@/lib/chatPreviewText';
import type { ConversationWithMeta } from '@/lib/messaging';
import { ChatLiveAvatar, resolveGroupAvatarColor } from '@/components/chat/ChatLiveAvatar';

const ALL_STAFF_GROUP_NAME_DB = 'Tüm Çalışanlar';

export type ChatListItemProps = {
  item: ConversationWithMeta;
  selected?: boolean;
  selectionMode?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  timeLabel: string;
  displayName: string;
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
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);

  const unread = item.unread_count ?? 0;
  const isGroup = item.type === 'group';
  const isAllStaff = isGroup && item.name === ALL_STAFF_GROUP_NAME_DB;
  const avatarUri = (item.type === 'direct' ? item.other_avatar : item.avatar) as string | null | undefined;
  const groupColor = isGroup ? resolveGroupAvatarColor(item.group_theme_color, isAllStaff) : undefined;
  const isOnline = !isGroup && Boolean(item.other_participant?.is_online);

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
            color={selected ? chat.accent : chat.textMuted}
          />
        </View>
      ) : null}

      <ChatLiveAvatar
        displayName={displayName}
        avatarUri={avatarUri}
        isGroup={isGroup}
        isAllStaff={isAllStaff}
        groupColor={groupColor}
        unread={unread}
        isOnline={isOnline}
        size={chatLayout.avatarSize}
        accentColor={chat.accent}
        surfaceColor={chat.surface}
        showBadge={false}
      />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <Text style={[styles.name, unread > 0 && styles.nameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          <View style={styles.metaRight}>
            {item.is_muted ? (
              <Ionicons name="volume-mute" size={14} color={chat.textMuted} style={styles.mutedIcon} />
            ) : null}
            {showStatus ? (
              <Ionicons
                name={isRead ? 'checkmark-done' : 'checkmark'}
                size={15}
                color={isRead ? chat.readCheck : chat.deliveredCheck}
              />
            ) : null}
            <Text style={[styles.time, unread > 0 && styles.timeUnread]}>{timeLabel}</Text>
          </View>
        </View>

        <View style={styles.previewRow}>
          <Text style={styles.previewLine} numberOfLines={1}>
            {isGroup ? (
              <Text style={styles.groupHint}>{t('staffMessagesGroupBadge')} · </Text>
            ) : null}
            <Text style={[styles.preview, unread > 0 && styles.previewUnread]}>
              {preview || '—'}
            </Text>
          </Text>
          {unread > 0 ? (
            <View style={styles.unreadPill}>
              <Text style={styles.unreadPillText}>{unread > 99 ? '99+' : unread}</Text>
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
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: chat.surface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
    },
    rowSelected: {
      backgroundColor: chat.selected,
    },
    rowPressed: {
      backgroundColor: chat.rowPressed,
    },
    checkWrap: {
      marginRight: 8,
    },
    body: {
      flex: 1,
      minWidth: 0,
      marginLeft: 12,
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
      fontWeight: '500',
      color: chat.text,
    },
    nameUnread: {
      fontWeight: '700',
    },
    metaRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      flexShrink: 0,
    },
    mutedIcon: {
      marginRight: 2,
    },
    time: {
      fontSize: 13,
      color: chat.textMuted,
    },
    timeUnread: {
      color: chat.accent,
      fontWeight: '600',
    },
    previewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      minHeight: 20,
    },
    previewLine: {
      flex: 1,
      fontSize: 15,
    },
    groupHint: {
      color: chat.textMuted,
      fontSize: 14,
      fontWeight: '500',
    },
    preview: {
      color: chat.textSecondary,
    },
    previewUnread: {
      color: chat.text,
      fontWeight: '500',
    },
    unreadPill: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 6,
      marginLeft: 4,
    },
    unreadPillText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '700',
    },
  });
}
