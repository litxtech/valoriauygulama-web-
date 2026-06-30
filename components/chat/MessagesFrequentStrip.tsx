import { useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { useChatTheme } from '@/hooks/useScreenTheme';
import { formatChatListPreview } from '@/lib/chatPreviewText';
import type { ConversationWithMeta } from '@/lib/messaging';
import { ChatLiveAvatar, resolveGroupAvatarColor } from '@/components/chat/ChatLiveAvatar';

const ALL_STAFF_GROUP_NAME_DB = 'Tüm Çalışanlar';
const AVATAR_SIZE = 48;

type Props = {
  chats: ConversationWithMeta[];
  getDisplayName: (item: ConversationWithMeta) => string;
  formatTime: (item: ConversationWithMeta) => string;
  onPress: (item: ConversationWithMeta) => void;
  onNewChat: () => void;
  title: string;
  newChatLabel: string;
};

function FrequentRow({
  item,
  displayName,
  timeLabel,
  onPress,
  chat,
  styles,
  groupLabel,
}: {
  item: ConversationWithMeta;
  displayName: string;
  timeLabel: string;
  onPress: () => void;
  chat: ChatThemePalette;
  styles: ReturnType<typeof createStyles>;
  groupLabel: string;
}) {
  const unread = item.unread_count ?? 0;
  const isGroup = item.type === 'group';
  const isAllStaff = isGroup && item.name === ALL_STAFF_GROUP_NAME_DB;
  const avatarUri = (item.type === 'direct' ? item.other_avatar : item.avatar) as string | null | undefined;
  const groupColor = isGroup ? resolveGroupAvatarColor(item.group_theme_color, isAllStaff) : undefined;
  const isOnline = !isGroup && Boolean(item.other_participant?.is_online);
  const preview = formatChatListPreview(item.last_message_preview, null, { unreadCount: unread });

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <ChatLiveAvatar
        displayName={displayName}
        avatarUri={avatarUri}
        isGroup={isGroup}
        isAllStaff={isAllStaff}
        groupColor={groupColor}
        unread={unread}
        isOnline={isOnline}
        size={AVATAR_SIZE}
        accentColor={chat.accent}
        surfaceColor={chat.surface}
      />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <Text style={[styles.cardName, unread > 0 && styles.cardNameUnread]} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={[styles.cardTime, unread > 0 && styles.cardTimeUnread]}>{timeLabel}</Text>
        </View>
        <Text style={styles.cardPreviewLine} numberOfLines={1}>
          {isGroup ? <Text style={styles.groupHint}>{groupLabel} · </Text> : null}
          <Text style={[styles.cardPreview, unread > 0 && styles.cardPreviewUnread]}>
            {preview || '—'}
          </Text>
        </Text>
      </View>
    </Pressable>
  );
}

export function MessagesFrequentStrip({
  chats,
  getDisplayName,
  formatTime,
  onPress,
  onNewChat,
  title,
  newChatLabel,
}: Props) {
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);
  const groupLabel = t('staffMessagesGroupBadge');

  if (chats.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {chats.map((item) => (
          <FrequentRow
            key={item.id}
            item={item}
            displayName={getDisplayName(item)}
            timeLabel={formatTime(item)}
            onPress={() => onPress(item)}
            chat={chat}
            styles={styles}
            groupLabel={groupLabel}
          />
        ))}
        <Pressable
          onPress={onNewChat}
          style={({ pressed }) => [styles.newCard, pressed && styles.cardPressed]}
        >
          <View style={styles.newIconWrap}>
            <Ionicons name="add" size={28} color={chat.accent} />
          </View>
          <Text style={styles.newLabel}>{newChatLabel}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function createStyles(chat: ChatThemePalette) {
  return StyleSheet.create({
    wrap: {
      gap: 8,
      paddingBottom: 4,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: chat.accent,
      paddingHorizontal: 16,
    },
    scrollContent: {
      paddingHorizontal: 12,
      gap: 8,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 220,
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: chat.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
      gap: 8,
    },
    cardPressed: {
      opacity: 0.88,
      backgroundColor: chat.rowPressed,
    },
    cardBody: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    cardName: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: chat.text,
    },
    cardPreviewLine: {
      fontSize: 13,
    },
    groupHint: {
      color: chat.textMuted,
      fontSize: 12,
      fontWeight: '500',
    },
    cardNameUnread: {
      fontWeight: '700',
    },
    cardTime: {
      fontSize: 11,
      color: chat.textMuted,
      flexShrink: 0,
    },
    cardTimeUnread: {
      color: chat.accent,
      fontWeight: '600',
    },
    cardPreview: {
      color: chat.textSecondary,
    },
    cardPreviewUnread: {
      color: chat.text,
      fontWeight: '500',
    },
    newCard: {
      width: 100,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: chat.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: chat.border,
      gap: 6,
    },
    newIconWrap: {
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      borderRadius: AVATAR_SIZE / 2,
      backgroundColor: chat.searchBg,
      justifyContent: 'center',
      alignItems: 'center',
    },
    newLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: chat.textSecondary,
      textAlign: 'center',
    },
  });
}
