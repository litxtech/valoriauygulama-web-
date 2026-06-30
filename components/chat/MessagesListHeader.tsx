import { useMemo } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { ChatThemePalette } from '@/hooks/useScreenTheme';
import { useChatTheme } from '@/hooks/useScreenTheme';
import type { ConversationWithMeta } from '@/lib/messaging';
import { MessagesFrequentStrip } from '@/components/chat/MessagesFrequentStrip';

export type MessagesFilter = 'all' | 'groups' | 'unread';

type Props = {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  activeFilter: MessagesFilter;
  onFilterChange: (f: MessagesFilter) => void;
  frequentChats: ConversationWithMeta[];
  getDisplayName: (item: ConversationWithMeta) => string;
  formatTime: (item: ConversationWithMeta) => string;
  onFrequentPress: (item: ConversationWithMeta) => void;
  onNewChat: () => void;
  onNewGroup?: () => void;
  isAdmin?: boolean;
  unreadTotal?: number;
  showAllChatsLabel?: boolean;
};

const FILTERS: MessagesFilter[] = ['all', 'groups', 'unread'];

export function MessagesListHeader({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  frequentChats,
  getDisplayName,
  formatTime,
  onFrequentPress,
  onNewChat,
  onNewGroup,
  isAdmin,
  unreadTotal = 0,
  showAllChatsLabel = false,
}: Props) {
  const { t } = useTranslation();
  const chat = useChatTheme();
  const styles = useMemo(() => createStyles(chat), [chat]);

  const filterLabel = (f: MessagesFilter) => {
    if (f === 'all') return t('staffMessagesFilterAll');
    if (f === 'groups') return t('staffMessagesFilterGroups');
    return t('staffMessagesFilterUnread');
  };

  const showFrequent = !searchQuery.trim();

  return (
    <View style={styles.wrap}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={chat.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('staffMessagesSearchPlaceholder')}
          placeholderTextColor={chat.textMuted}
          value={searchQuery}
          onChangeText={onSearchChange}
          clearButtonMode="while-editing"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 ? (
          <Pressable onPress={() => onSearchChange('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={chat.textMuted} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.filterTabs}>
        {FILTERS.map((f) => {
          const active = activeFilter === f;
          return (
            <Pressable
              key={f}
              onPress={() => onFilterChange(f)}
              style={styles.filterTab}
            >
              <View style={styles.filterTabInner}>
                <Text style={[styles.filterTabText, active && styles.filterTabTextActive]}>
                  {filterLabel(f)}
                </Text>
                {f === 'unread' && unreadTotal > 0 ? (
                  <View style={styles.filterCount}>
                    <Text style={styles.filterCountText}>
                      {unreadTotal > 99 ? '99+' : unreadTotal}
                    </Text>
                  </View>
                ) : null}
              </View>
              {active ? <View style={styles.filterUnderline} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actionsRow}>
        <Pressable onPress={onNewChat} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
          <Ionicons name="create-outline" size={18} color={chat.accent} />
          <Text style={styles.actionBtnText}>{t('staffMessagesNewChat')}</Text>
        </Pressable>
        {isAdmin && onNewGroup ? (
          <Pressable onPress={onNewGroup} style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}>
            <Ionicons name="people-outline" size={18} color={chat.accent} />
            <Text style={styles.actionBtnText}>{t('staffMessagesNewGroup')}</Text>
          </Pressable>
        ) : null}
      </View>

      {showFrequent ? (
        <MessagesFrequentStrip
          chats={frequentChats}
          getDisplayName={getDisplayName}
          formatTime={formatTime}
          onPress={onFrequentPress}
          onNewChat={onNewChat}
          title={t('staffMessagesFrequentTitle')}
          newChatLabel={t('staffMessagesNewChat')}
        />
      ) : null}

      {showAllChatsLabel && showFrequent && frequentChats.length > 0 ? (
        <Text style={styles.sectionTitle}>{t('staffMessagesAllChats')}</Text>
      ) : null}
    </View>
  );
}

function createStyles(chat: ChatThemePalette) {
  return StyleSheet.create({
    wrap: {
      backgroundColor: chat.background,
      paddingBottom: 4,
      gap: 8,
    },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 12,
      paddingHorizontal: 12,
      paddingVertical: 9,
      backgroundColor: chat.searchBg,
      borderRadius: 10,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: chat.text,
      padding: 0,
    },
    filterTabs: {
      flexDirection: 'row',
      paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: chat.border,
    },
    filterTab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
    },
    filterTabInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    filterTabText: {
      fontSize: 14,
      fontWeight: '500',
      color: chat.textMuted,
    },
    filterTabTextActive: {
      color: chat.accent,
      fontWeight: '600',
    },
    filterUnderline: {
      position: 'absolute',
      bottom: 0,
      left: '15%',
      right: '15%',
      height: 2,
      borderRadius: 1,
      backgroundColor: chat.accent,
    },
    filterCount: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: chat.accent,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 4,
    },
    filterCountText: {
      fontSize: 10,
      fontWeight: '700',
      color: '#fff',
    },
    actionsRow: {
      flexDirection: 'row',
      paddingHorizontal: 12,
      gap: 8,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 18,
      backgroundColor: chat.searchBg,
    },
    actionBtnPressed: {
      opacity: 0.8,
    },
    actionBtnText: {
      fontSize: 14,
      fontWeight: '600',
      color: chat.accent,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: chat.textSecondary,
      paddingHorizontal: 16,
      paddingTop: 4,
    },
  });
}
