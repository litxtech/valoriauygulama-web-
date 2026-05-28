import { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, Stack, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getChatInputBottomPadding, getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import {
  staffGetMessages,
  staffSendMessage,
  formatChatMessageSendError,
  staffMarkConversationRead,
  staffGetConversationHeader,
  staffSetConversationMuted,
  staffDeleteMessage,
  staffListMentionParticipants,
  subscribeToMessages,
  subscribeToTypingPresence,
} from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { mergeChatMessagesCapped, replaceChatMessage, upsertIncomingChatMessage, latestMessageCreatedAtIso, capChatMessageList, type Message } from '@/lib/messaging';
import {
  CHAT_LIST_INVERTED_CONTENT_STYLE,
  scrollChatListToLatest,
  useInvertedChatListItems,
} from '@/lib/chatListScroll';
import { CHAT_FLAT_LIST_PROPS, useChatHeavyMediaReady } from '@/lib/chatListPerf';
import { theme } from '@/constants/theme';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import * as ImagePicker from 'expo-image-picker';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import {
  useMessagingBubbleStore,
  getBubbleColorForSender,
  getContrastTextColor,
  BUBBLE_OTHER_DIRECT,
  BUBBLE_COLOR_OPTIONS,
} from '@/stores/messagingBubbleStore';
import { useTranslation } from 'react-i18next';
import { MessageTranslation } from '@/components/MessageTranslation';
import { prefetchTranslations } from '@/lib/translateText';
import { ChatVideoMessage } from '@/components/ChatVideoMessage';
import { ChatImageMessage } from '@/components/ChatImageMessage';
import { ChatImageAlbum } from '@/components/ChatImageAlbum';
import { ChatFullscreenImageModal } from '@/components/ChatFullscreenImageModal';
import { ChatVideoAlbum } from '@/components/ChatVideoAlbum';
import { buildChatListDisplayItems } from '@/lib/chatImageAlbum';
import { ChatVideoBatchBar } from '@/components/ChatVideoBatchBar';
import {
  createSessionChatVideoHandlers,
  expireStaleChatVideoUploadsForConversation,
  getChatVideoBatchSummary,
  pruneDoneChatVideoUploads,
  registerChatVideoScreen,
  retryChatVideoUploadWithSession,
  sendChatVideoFromPickerWithSession,
  useChatVideoUploadStates,
  type ChatVideoUploadState,
} from '@/lib/chatVideoUploadSession';
import {
  pickChatImageFromCamera,
  pickChatImagesFromLibrary,
  sendChatImageUris,
} from '@/lib/chatMediaSend';
import { formatChatMessageDateTime, formatChatMessageTime } from '@/lib/formatChatTime';
import { useChatScreenshotListener } from '@/lib/chatScreenshot';
import { ChatScreenshotNotice } from '@/components/ChatScreenshotNotice';
import { ChatMentionComposer } from '@/components/ChatMentionComposer';
import { ChatMentionText } from '@/components/ChatMentionText';
import {
  notifyChatMessageWithMentions,
  syncMentionsWithText,
  parseMessageMentions,
  type ChatMention,
  type ChatMentionParticipant,
} from '@/lib/chatMentions';
import { usePendingMuxVideoPoll } from '@/lib/usePendingMuxVideoPoll';

const ALL_STAFF_GROUP_NAME = 'Tüm Çalışanlar';
const STAFF_CHAT_CACHE_PREFIX = 'staff_chat_cache_v1:';
type StaffChatCacheEntry = {
  messages: Message[];
  headerName: string;
  headerAvatar: string | null;
  updatedAt: number;
};
const staffChatMemoryCache: Record<string, StaffChatCacheEntry> = {};

function MessageBubble({
  msg,
  isOwn,
  isGroup,
  onImagePress,
  onDelete,
  onToggleSelect,
  selected,
  selectionMode,
  bubbleColor,
  videoUpload,
  videoUploads,
  onVideoRetry,
  onVideoRetryForMessage,
  imageAlbum,
  videoAlbum,
  mediaPreloadReady = true,
}: {
  msg: Message;
  isOwn: boolean;
  isGroup: boolean;
  onImagePress?: (uri: string) => void;
  onDelete?: (msg: Message) => void;
  onToggleSelect?: (msg: Message) => void;
  selected?: boolean;
  selectionMode?: boolean;
  bubbleColor?: string;
  videoUpload?: ChatVideoUploadState;
  videoUploads?: Record<string, ChatVideoUploadState>;
  onVideoRetry?: () => void;
  onVideoRetryForMessage?: (msg: Message) => void;
  imageAlbum?: Message[];
  videoAlbum?: Message[];
  mediaPreloadReady?: boolean;
}) {
  const { t } = useTranslation();
  const voiceUri = msg.message_type === 'voice' ? (msg.media_url || msg.content) : null;
  const isVideo = msg.message_type === 'video';
  const isImage = msg.message_type === 'image' && (msg.media_url || msg.media_thumbnail);
  const isMediaCard = isVideo || !!imageAlbum?.length || !!videoAlbum?.length || isImage;
  const imageUri = msg.media_url || msg.media_thumbnail || '';
  const displayName = msg.sender_name?.trim() || (msg.sender_type === 'guest' ? t('guestDefaultName') : null) || '?';
  const initial = displayName.charAt(0).toUpperCase();
  const timeStr = isGroup ? formatChatMessageDateTime(msg.created_at) : formatChatMessageTime(msg.created_at);
  const color = bubbleColor ?? BUBBLE_OTHER_DIRECT;
  const textColor = getContrastTextColor(color);

  const renderContent = (own: boolean) => {
    if (msg.message_type === 'text') {
      const mentionList = parseMessageMentions(msg.mentions);
      return (
        <>
          <ChatMentionText
            content={msg.content || ''}
            mentions={mentionList}
            style={[own ? styles.bubbleTextOwn : styles.bubbleTextOther, { color: textColor }]}
            mentionStyle={{ color: own ? '#fff' : theme.colors.accent, fontWeight: '700' }}
          />
          <MessageTranslation content={msg.content || ''} enabled={!own} textColor={textColor} />
        </>
      );
    }
    if (msg.message_type === 'voice' && voiceUri) {
      return <VoiceMessagePlayer uri={voiceUri} isOwn={own} />;
    }
    if (videoAlbum && videoAlbum.length > 1) {
      return (
        <ChatVideoAlbum
          messages={videoAlbum}
          isOwn={own}
          videoUploads={videoUploads}
          onRetryVideo={(m) => onVideoRetryForMessage?.(m)}
          deferLocalVideo={!mediaPreloadReady}
        />
      );
    }
    if (isVideo) {
      const upload =
        videoUpload ?? videoUploads?.[msg.id] ?? Object.values(videoUploads ?? {}).find((s) => s.messageId === msg.id);
      return (
        <View style={styles.chatVideoWrap}>
          <ChatVideoMessage
            mediaUrl={msg.media_url}
            mediaThumbnail={msg.media_thumbnail}
            isOwn={own}
            uploadProgress={upload?.progress}
            uploadPhase={upload?.phase}
            uploadFailed={upload?.phase === 'failed'}
            onRetry={onVideoRetry}
            preloadEnabled={mediaPreloadReady}
          />
        </View>
      );
    }
    if (imageAlbum && imageAlbum.length > 1) {
      return (
        <ChatImageAlbum
          messages={imageAlbum}
          onPressImage={(uri) => onImagePress?.(uri)}
        />
      );
    }
    if (isImage && imageUri) {
      return <ChatImageMessage uri={imageUri} onPress={onImagePress} />;
    }
    return (
      <Text style={[own ? styles.bubbleTextOwn : styles.bubbleTextOther, { color: textColor }]}>
        [{msg.message_type}] {msg.content || msg.media_url || '—'}
      </Text>
    );
  };

  return (
    <Pressable
      style={[
        styles.bubbleWrap,
        isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther,
        selected ? styles.bubbleWrapSelected : null,
      ]}
      onLongPress={isOwn && onDelete ? () => onDelete(msg) : undefined}
      onPress={selectionMode && isOwn ? () => onToggleSelect?.(msg) : undefined}
      delayLongPress={400}
    >
      {!isOwn && (
        <View style={styles.otherMeta}>
          <View style={styles.avatarWrap}>
            {msg.sender_avatar ? (
              <CachedImage uri={msg.sender_avatar} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>
          <View style={styles.otherContent}>
            {displayName ? (
              <Text style={styles.senderName}>{displayName}</Text>
            ) : null}
            <View
              style={[
                styles.bubble,
                styles.bubbleOther,
                isMediaCard && styles.bubbleVideo,
                !isMediaCard && { backgroundColor: color },
              ]}
            >
              {renderContent(false)}
              <View style={styles.bubbleFooter}>
                <Text
                  style={[
                    styles.bubbleTimeOther,
                    isMediaCard ? styles.bubbleTimeVideo : null,
                    !isMediaCard && { color: textColor, opacity: 0.9 },
                  ]}
                >
                  {timeStr}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}
      {isOwn && (
        <View
          style={[
            styles.bubble,
            styles.bubbleOwn,
            isMediaCard && styles.bubbleVideo,
            !isMediaCard && { backgroundColor: color },
          ]}
        >
          {renderContent(true)}
          <View style={styles.bubbleFooter}>
            <Text
              style={[
                styles.bubbleTimeOwn,
                isMediaCard ? styles.bubbleTimeVideo : null,
                !isMediaCard && { color: textColor, opacity: 0.9 },
              ]}
            >
              {timeStr}
            </Text>
            {msg.is_read ? (
              <Ionicons
                name="checkmark-done"
                size={14}
                color={isMediaCard ? theme.colors.primary : textColor}
                style={styles.readIcon}
              />
            ) : (
              <Ionicons
                name="checkmark"
                size={14}
                color={isMediaCard ? theme.colors.textMuted : textColor}
                style={styles.readIcon}
              />
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function StaffChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { openGroupSettings } = useLocalSearchParams<{ openGroupSettings?: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { t } = useTranslation();
  const { staff } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationType, setConversationType] = useState<string>('direct');
  const [conversationName, setConversationName] = useState<string>(() => t('screenChat'));
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(null);
  const [isAllStaffGroup, setIsAllStaffGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupAvatar, setEditGroupAvatar] = useState<string | null>(null);
  const [groupThemeColor, setGroupThemeColor] = useState<string>(theme.colors.primary);
  const [editGroupThemeColor, setEditGroupThemeColor] = useState<string>(theme.colors.primary);
  const [savingGroup, setSavingGroup] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [input, setInput] = useState('');
  const [pendingMentions, setPendingMentions] = useState<ChatMention[]>([]);
  const [mentionParticipants, setMentionParticipants] = useState<ChatMentionParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const videoUploads = useChatVideoUploadStates(conversationId);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [showBubbleColorModal, setShowBubbleColorModal] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [allStaffMuted, setAllStaffMuted] = useState(false);
  const listRef = useRef<FlatList>(null);
  const sendInFlightRef = useRef(false);
  const subscriptionRef = useRef<ReturnType<typeof subscribeToMessages> | null>(null);
  const typingPresenceRef = useRef<ReturnType<typeof subscribeToTypingPresence> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const chatHasVideosEarly = useMemo(
    () => messages.some((m) => m.message_type === 'video'),
    [messages]
  );
  const heavyMediaReady = useChatHeavyMediaReady(conversationId, loading, {
    hasVideos: chatHasVideosEarly,
  });

  useEffect(() => {
    setMessages([]);
    setLoading(true);
  }, [conversationId]);

  const { myBubbleColor, setMyBubbleColor, loadStored: loadBubbleStore } = useMessagingBubbleStore();
  const inputRowExtra = Platform.OS === 'android' ? -20 : 56;
  const bottomInset = getEffectiveBottomInset(insets);
  const chatInputBottomPad = getChatInputBottomPadding(insets);
  const androidKbPadding =
    Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + inputRowExtra + bottomInset : 0;

  useEffect(() => {
    if (!conversationId) return;
    return registerChatVideoScreen(conversationId, { patchMessages: setMessages });
  }, [conversationId]);

  usePendingMuxVideoPoll(messages, setMessages, {
    enabled: Boolean(conversationId && staff?.id && !loading),
  });

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const memory = staffChatMemoryCache[conversationId];
    if (memory?.messages?.length) {
      setMessages(memory.messages);
      if (memory.headerName) setConversationName(memory.headerName);
      setHeaderAvatar(memory.headerAvatar ?? null);
      setLoading(false);
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${STAFF_CHAT_CACHE_PREFIX}${conversationId}`);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as StaffChatCacheEntry;
        if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
          setMessages(parsed.messages);
          if (parsed.headerName) setConversationName(parsed.headerName);
          setHeaderAvatar(parsed.headerAvatar ?? null);
          setLoading(false);
        }
      } catch {
        // cache parse hatası sessiz geçilir
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    if (messages.length === 0 && !headerAvatar && !conversationName) return;
    const entry: StaffChatCacheEntry = {
      messages: capChatMessageList(messages),
      headerName: conversationName,
      headerAvatar: headerAvatar ?? null,
      updatedAt: Date.now(),
    };
    staffChatMemoryCache[conversationId] = entry;
    void AsyncStorage.setItem(`${STAFF_CHAT_CACHE_PREFIX}${conversationId}`, JSON.stringify(entry)).catch(() => {});
  }, [conversationId, messages, conversationName, headerAvatar]);

  useEffect(() => {
    loadBubbleStore();
  }, []);
  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('conversations')
      .select('type, name, group_theme_color')
      .eq('id', conversationId)
      .single()
      .then(async ({ data }) => {
        const row = data as { type: string; name: string | null; group_theme_color?: string | null } | null;
        setConversationType(row?.type ?? 'direct');
        const isAllStaff = row?.type === 'group' && row?.name === ALL_STAFF_GROUP_NAME;
        setIsAllStaffGroup(isAllStaff);
        const resolvedTheme = (row?.group_theme_color ?? '').trim();
        if (/^#[A-Fa-f0-9]{6}$/.test(resolvedTheme)) {
          setGroupThemeColor(resolvedTheme);
        } else {
          setGroupThemeColor(theme.colors.primary);
        }
        if (staff?.id) {
          const header = await staffGetConversationHeader(conversationId, staff.id);
          setConversationName(header.name);
          setHeaderAvatar(header.avatar);
        } else {
          setConversationName(row?.name ?? t('screenChat'));
          setHeaderAvatar(null);
        }
        if (isAllStaff && staff?.id) {
          const { data: part } = await supabase
            .from('conversation_participants')
            .select('is_muted')
            .eq('conversation_id', conversationId)
            .eq('participant_id', staff.id)
            .in('participant_type', ['staff', 'admin'])
            .maybeSingle();
          setAllStaffMuted(!!(part as { is_muted?: boolean } | null)?.is_muted);
        }
      });
  }, [conversationId, staff?.id, t]);

  const isAdmin = staff?.role === 'admin';
  const isGroup = conversationType === 'group';
  const chatListItems = useMemo(() => buildChatListDisplayItems(messages), [messages]);
  const invertedChatListItems = useInvertedChatListItems(chatListItems);
  const canEditGroup = isAdmin && isGroup;
  const screenshotSenderName =
    staff?.full_name?.trim() || staff?.email?.trim() || t('chatMessageSenderStaff');
  const screenshotPushBody = useMemo(
    () => t('chatScreenshotNotice', { name: screenshotSenderName }),
    [t, screenshotSenderName]
  );

  useEffect(() => {
    if (!conversationId || !staff?.id) {
      setMentionParticipants([]);
      return;
    }
    let cancelled = false;
    void staffListMentionParticipants(conversationId).then((list) => {
      if (!cancelled) setMentionParticipants(list);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, staff?.id]);

  const mentionEnabled = mentionParticipants.length > 0;

  useChatScreenshotListener(
    Boolean(staff?.id && conversationId && !loading),
    staff?.id && conversationId
      ? {
          kind: 'staff',
          staffId: staff.id,
          senderName: screenshotSenderName,
          conversationId,
          chatUrl: `/staff/chat/${conversationId}`,
        }
      : null,
    staff?.id && conversationId
      ? {
          conversationName,
          isGroup,
          pushBody: screenshotPushBody,
          ownSenderId: staff.id,
          onLocalMessage: (msg) => {
            setMessages((prev) => upsertIncomingChatMessage(prev, msg, { ownSenderId: staff!.id }));
            setTimeout(() => scrollChatListToLatest(listRef, true), 100);
          },
          reloadStaffMessages: () => staffGetMessages(conversationId, 50, undefined, staff!.id),
        }
      : null
  );

  const openGroupSettingsModal = () => {
    setEditGroupName(conversationName);
    setEditGroupAvatar(headerAvatar);
    setEditGroupThemeColor(groupThemeColor);
    setShowGroupSettings(true);
  };

  useEffect(() => {
    if (!canEditGroup) return;
    if (openGroupSettings !== '1') return;
    const openSettingsTimer = setTimeout(() => openGroupSettingsModal(), 150);
    return () => clearTimeout(openSettingsTimer);
  }, [canEditGroup, openGroupSettings, conversationName, headerAvatar, groupThemeColor]);

  useEffect(() => {
    const isAllStaff = isAllStaffGroup;
    const headerTitleMaxWidth = Math.max(120, Math.min(280, winWidth - 120));
    navigation.setOptions({
      headerTitle: () => (
        <View style={[styles.headerTitleRow, { maxWidth: headerTitleMaxWidth }]}>
          {headerAvatar ? (
            <CachedImage uri={headerAvatar} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarInitial}>{(conversationName || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.headerTitleText} numberOfLines={1}>{conversationName}</Text>
        </View>
      ),
      headerStyle: {
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
      },
      headerTintColor: theme.colors.text,
      headerBackTitle: t('back'),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
          {selectionMode ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  const ownIds = messages
                    .filter((m) => m.sender_id === staff?.id && !m.is_deleted)
                    .map((m) => m.id);
                  setSelectedMessageIds((prev) => (prev.length === ownIds.length ? [] : ownIds));
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ marginRight: 10 }}
              >
                <Ionicons
                  name={selectedMessageIds.length > 0 ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={theme.colors.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setSelectionMode(false);
                  setSelectedMessageIds([]);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </>
          ) : (
            <>
          {canEditGroup ? (
            <TouchableOpacity
              onPress={openGroupSettingsModal}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ marginRight: 10 }}
            >
              <Ionicons name="settings-outline" size={22} color={groupThemeColor} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setShowBubbleColorModal(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={{ marginRight: isAllStaff ? 10 : 0 }}
          >
            <Ionicons name="color-palette-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          {isAllStaff ? (
            <TouchableOpacity
              onPress={async () => {
                if (!staff?.id || !conversationId) return;
                const next = !allStaffMuted;
                const { error } = await staffSetConversationMuted(conversationId, staff.id, next);
                if (error) Alert.alert(t('error'), error);
                else setAllStaffMuted(next);
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={{ marginRight: 8 }}
            >
              <Ionicons
                name={allStaffMuted ? 'notifications-off' : 'notifications'}
                size={24}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
          ) : null}
          {isAllStaff ? (
            <View style={styles.headerGroupBadge}>
              <Ionicons name="people" size={18} color={theme.colors.primary} />
              <Text style={styles.headerGroupBadgeText}>{t('group')}</Text>
            </View>
          ) : null}
            </>
          )}
        </View>
      ),
    });
  }, [
    conversationName,
    headerAvatar,
    isAllStaffGroup,
    allStaffMuted,
    navigation,
    conversationId,
    staff?.id,
    t,
    canEditGroup,
    groupThemeColor,
    winWidth,
    selectionMode,
    selectedMessageIds.length,
    messages,
  ]);

  useEffect(() => {
    if (!staff || !conversationId) {
      setLoading(false);
      return;
    }
    (async () => {
      const seedFromMemory = staffChatMemoryCache[conversationId]?.messages ?? [];
      const afterIso = latestMessageCreatedAtIso(seedFromMemory);
      const useIncremental = Boolean(afterIso && seedFromMemory.length > 0);

      let list: Message[];
      if (useIncremental) {
        list = await staffGetMessages(conversationId, 120, undefined, staff.id, {
          afterCreatedAt: afterIso!,
        });
        if (list.length === 0) {
          staffMarkConversationRead(conversationId, staff.id);
          setLoading(false);
          return;
        }
      } else {
        list = await staffGetMessages(conversationId, 50, undefined, staff.id);
      }

      setMessages((prev) => {
        const base = prev.length > 0 ? prev : staffChatMemoryCache[conversationId]?.messages ?? [];
        return mergeChatMessagesCapped(list, base);
      });
      staffMarkConversationRead(conversationId, staff.id);
      setLoading(false);
    })();
  }, [staff?.id, conversationId]);

  const prefetchKeyRef = useRef('');
  useEffect(() => {
    if (!staff?.id || messages.length === 0) return;
    const incoming = messages
      .filter((m) => m.message_type === 'text' && m.sender_id !== staff.id && (m.content ?? '').trim())
      .map((m) => (m.content ?? '').trim())
      .slice(-8);
    const key = incoming.join('\u0001');
    if (key === prefetchKeyRef.current) return;
    prefetchKeyRef.current = key;
    prefetchTranslations(incoming);
  }, [messages, staff?.id]);

  useEffect(() => {
    if (!conversationId) return;
    subscriptionRef.current = subscribeToMessages(
      conversationId,
      (newMsg) => {
        setMessages((prev) => upsertIncomingChatMessage(prev, newMsg, { ownSenderId: staff?.id }));
        if (
          newMsg.message_type === 'text' &&
          newMsg.sender_id !== staff?.id &&
          (newMsg.content ?? '').trim()
        ) {
          prefetchTranslations([(newMsg.content ?? '').trim()]);
        }
        setTimeout(() => scrollChatListToLatest(listRef, true), 100);
      },
      {
        onMessageDeleted: (messageId) => {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        },
        onMessageUpdated: (updated) => {
          setMessages((prev) => replaceChatMessage(prev, updated));
        },
      }
    );
    return () => subscriptionRef.current?.unsubscribe?.();
  }, [conversationId, staff?.id]);

  useEffect(() => {
    if (!selectionMode) return;
    const ownIds = new Set(
      messages.filter((m) => m.sender_id === staff?.id && !m.is_deleted).map((m) => m.id)
    );
    setSelectedMessageIds((prev) => prev.filter((id) => ownIds.has(id)));
  }, [messages, selectionMode, staff?.id]);

  useEffect(() => {
    if (!conversationId || !staff) return;
    typingPresenceRef.current = subscribeToTypingPresence(
      conversationId,
      { displayName: staff.full_name || staff.email || t('visitorTypeStaff'), userId: staff.id },
      setTypingNames
    );
    return () => {
      typingPresenceRef.current?.unsubscribe?.();
      typingPresenceRef.current = null;
    };
  }, [conversationId, staff?.id, staff?.full_name, staff?.email, t]);

  // Android: klavye açılınca mesaj kutusu klavyenin üstünde kalsın
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || !staff || !conversationId || sendInFlightRef.current) return;
    const mentions = syncMentionsWithText(text, pendingMentions);
    sendInFlightRef.current = true;
    setInput('');
    setPendingMentions([]);
    typingPresenceRef.current?.updateTyping(false);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: staff.id,
      sender_type: 'staff',
      sender_name: staff.full_name || staff.email,
      sender_avatar: staff.profile_image ?? null,
      message_type: 'text',
      content: text,
      media_url: null,
      media_thumbnail: null,
      file_name: null,
      file_size: null,
      mime_type: null,
      is_delivered: false,
      delivered_at: null,
      is_read: false,
      read_at: null,
      is_edited: false,
      edited_at: null,
      is_deleted: false,
      deleted_at: null,
      reply_to_id: null,
      scheduled_at: null,
      created_at: new Date().toISOString(),
      mentions: mentions.length ? mentions : [],
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => scrollChatListToLatest(listRef, true), 50);
    try {
      const { data: sent, error, conversationId: nextConversationId } = await staffSendMessage(
        conversationId,
        staff.id,
        staff.full_name || staff.email,
        staff.profile_image ?? null,
        text,
        'text',
        undefined,
        undefined,
        undefined,
        mentions.length ? mentions : undefined
      );
      if (error) {
        setInput(text);
        setPendingMentions(mentions);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        Alert.alert(t('messageSendFailedTitle'), typeof error === 'string' ? error : String(error));
        return;
      }
      if (sent) {
        setMessages((prev) => upsertIncomingChatMessage(prev, sent, { ownSenderId: staff.id }));
        const convId = nextConversationId ?? conversationId;
        const preview = text.slice(0, 80) + (text.length > 80 ? '…' : '');
        void notifyChatMessageWithMentions({
          conversationId: convId,
          conversationTitle: conversationName || t('notifNewMessage'),
          messageText: text,
          mentions,
          senderDisplayName: staff.full_name || staff.email || '',
          excludeStaffId: staff.id,
          chatUrl: `/staff/chat/${convId}`,
          mentionPushBody: t('chatMentionPushBody', {
            name: staff.full_name || staff.email,
            preview,
          }),
          defaultPushBody: preview,
        });
        if (nextConversationId !== conversationId) {
          router.replace({ pathname: '/staff/chat/[id]', params: { id: nextConversationId } });
          return;
        }
        scrollChatListToLatest(listRef, true);
      } else {
        setInput(text);
        setPendingMentions(mentions);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        Alert.alert(t('messageSendFailedTitle'), t('chatMessageBlockedBody'));
      }
    } catch (e) {
      setInput(text);
      setPendingMentions(mentions);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert(t('messageSendFailedTitle'), formatChatMessageSendError(e, t('unknownError')));
    } finally {
      sendInFlightRef.current = false;
    }
  };

  const sendImagesFromLibrary = async () => {
    if (!staff || !conversationId || sending) return;
    const uris = await pickChatImagesFromLibrary();
    if (!uris.length) return;
    setSending(true);
    try {
      const actor = {
        kind: 'staff' as const,
        staffId: staff.id,
        staffName: staff.full_name || staff.email,
        staffAvatar: staff.profile_image ?? null,
        conversationId,
      };
      const { conversationId: convId, sentMessages, failed } = await sendChatImageUris(actor, uris, t('photo'));
      if (sentMessages.length) {
        const { notifyConversationRecipients } = await import('@/lib/notificationService');
        notifyConversationRecipients({
          conversationId: convId,
          excludeStaffId: staff.id,
          title: conversationName || t('notifNewMessage'),
          body: t('staffChatPhotoSentBody'),
          data: { conversationId: convId, url: `/staff/chat/${convId}` },
        }).catch(() => {});
        setMessages((prev) =>
          sentMessages.reduce((acc, m) => upsertIncomingChatMessage(acc, m, { ownSenderId: staff.id }), prev)
        );
        scrollChatListToLatest(listRef, true);
      }
      if (failed > 0) Alert.alert(t('error'), t('chatMediaPartialFail', { count: failed }));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
    }
  };

  const sendImageFromCamera = async () => {
    if (!staff || !conversationId || sending) return;
    const granted = await ensureCameraPermission({
      title: t('chatCameraPermissionTitle'),
      message: t('chatCameraPermissionMessage'),
      settingsMessage: t('chatCameraPermissionSettings'),
    });
    if (!granted) return;
    const uri = await pickChatImageFromCamera();
    if (!uri) return;
    setSending(true);
    try {
      const actor = {
        kind: 'staff' as const,
        staffId: staff.id,
        staffName: staff.full_name || staff.email,
        staffAvatar: staff.profile_image ?? null,
        conversationId,
      };
      const { sentMessages, failed, conversationId: convId } = await sendChatImageUris(actor, [uri], t('photo'));
      if (sentMessages[0]) {
        const { notifyConversationRecipients } = await import('@/lib/notificationService');
        notifyConversationRecipients({
          conversationId: convId,
          excludeStaffId: staff.id,
          title: conversationName || t('notifNewMessage'),
          body: t('staffChatPhotoSentBody'),
          data: { conversationId: convId, url: `/staff/chat/${convId}` },
        }).catch(() => {});
        setMessages((prev) => upsertIncomingChatMessage(prev, sentMessages[0], { ownSenderId: staff.id }));
        scrollChatListToLatest(listRef, true);
      } else if (failed) Alert.alert(t('error'), t('imageSendFailed'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
    }
  };

  const uploadGroupAvatar = async (uri: string): Promise<string> => {
    if (!conversationId) throw new Error(t('conversationNotFound'));
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: 'profiles',
      uri,
      subfolder: `conversations/${conversationId}`,
    });
    return publicUrl;
  };

  const pickAvatarForGroup = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: t('groupAvatarGalleryPermissionTitle'),
      message: t('groupAvatarGalleryPermissionMessage'),
      settingsMessage: t('groupAvatarGalleryPermissionSettings'),
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadGroupAvatar(result.assets[0].uri);
      setEditGroupAvatar(url);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageUploadFailedShort'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveGroupSettings = async () => {
    if (!conversationId || savingGroup) return;
    const name = (editGroupName || '').trim() || conversationName;
    setSavingGroup(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({
          name,
          avatar: editGroupAvatar ?? null,
          group_theme_color: editGroupThemeColor,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conversationId);
      if (error) {
        Alert.alert(t('error'), error.message);
        return;
      }
      setConversationName(name);
      setHeaderAvatar(editGroupAvatar);
      setGroupThemeColor(editGroupThemeColor);
      setShowGroupSettings(false);
    } finally {
      setSavingGroup(false);
    }
  };

  const videoBatchActive = getChatVideoBatchSummary(videoUploads).active;

  useEffect(() => {
    if (!conversationId) return;
    const id = setInterval(() => {
      expireStaleChatVideoUploadsForConversation(conversationId);
    }, 4000);
    return () => clearInterval(id);
  }, [conversationId]);

  useEffect(() => {
    const summary = getChatVideoBatchSummary(videoUploads);
    if (!summary.active && summary.total > 0 && summary.failed === 0) {
      const timer = setTimeout(() => {
        if (conversationId) pruneDoneChatVideoUploads(conversationId);
      }, 2800);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [videoUploads, conversationId]);

  const sendVideoFromSource = async (source: 'camera' | 'library') => {
    if (!staff || !conversationId || videoBatchActive) return;
    const actor = {
      kind: 'staff' as const,
      staffId: staff.id,
      staffName: staff.full_name || staff.email,
      staffAvatar: staff.profile_image ?? null,
      conversationId,
    };
    const handlers = createSessionChatVideoHandlers(conversationId, actor, {
      setMessages,
      onConversationId: (convId) => {
        if (convId !== conversationId) {
          router.replace({ pathname: '/staff/chat/[id]', params: { id: convId } });
        }
      },
      onBatchReady: ({ conversationId: convId }) => {
        void import('@/lib/notificationService').then(({ notifyConversationRecipients }) =>
          notifyConversationRecipients({
            conversationId: convId,
            excludeStaffId: staff.id,
            title: conversationName || t('notifNewMessage'),
            body: t('staffChatVideoSentBody'),
            data: { conversationId: convId, url: `/staff/chat/${convId}` },
          })
        );
        scrollChatListToLatest(listRef, true);
      },
      onBatchComplete: ({ failed, lastError }) => {
        if (failed > 0) {
          Alert.alert(t('error'), lastError?.trim() || t('chatMediaPartialFail', { count: failed }));
        }
      },
    });
    try {
      await sendChatVideoFromPickerWithSession(actor, source, handlers);
      scrollChatListToLatest(listRef, true);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('chatVideoSendFailed'));
    }
  };

  const retryVideoUpload = (upload: ChatVideoUploadState) => {
    if (!staff || !conversationId) return;
    void retryChatVideoUploadWithSession(
      {
        kind: 'staff',
        staffId: staff.id,
        staffName: staff.full_name || staff.email,
        staffAvatar: staff.profile_image ?? null,
        conversationId,
      },
      upload,
      { setMessages }
    );
  };

  const showAttachOptions = () => {
    Alert.alert(
      t('chatAttachTitle'),
      undefined,
      [
        { text: t('takePhoto'), onPress: () => void sendImageFromCamera() },
        { text: t('chatPickMultiplePhotos'), onPress: () => void sendImagesFromLibrary() },
        { text: t('chatPickMultipleVideos'), onPress: () => void sendVideoFromSource('library') },
        { text: t('chatRecordVideo'), onPress: () => sendVideoFromSource('camera') },
        { text: t('cancel'), style: 'cancel' },
      ]
    );
  };

  const deleteSelectedMessages = async (ids: string[]) => {
    if (!conversationId || ids.length === 0) return;
    const results = await Promise.all(ids.map((id) => staffDeleteMessage(conversationId, id)));
    const failed = results.filter((r) => r.error).length;
    const successIds = ids.filter((_, idx) => !results[idx].error);
    if (successIds.length) {
      setMessages((prev) => prev.filter((m) => !successIds.includes(m.id)));
    }
    if (failed > 0) Alert.alert(t('error'), `${failed} mesaj silinemedi.`);
  };

  const confirmDeleteSelected = () => {
    if (selectedMessageIds.length === 0) return;
    Alert.alert('Toplu mesaj sil', `${selectedMessageIds.length} mesaj silinsin mi?`, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteSelectedMessages(selectedMessageIds);
          setSelectionMode(false);
          setSelectedMessageIds([]);
        },
      },
    ]);
  };

  const toggleSelectedMessage = (msg: Message) => {
    if (msg.sender_id !== staff?.id) return;
    setSelectedMessageIds((prev) =>
      prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
    );
  };

  const handleDeleteMessage = (msg: Message) => {
    if (!conversationId || msg.sender_id !== staff?.id) return;
    if (selectionMode) {
      toggleSelectedMessage(msg);
      return;
    }
    Alert.alert('Mesaj işlemi', undefined, [
      {
        text: 'Çoklu seç',
        onPress: () => {
          setSelectionMode(true);
          setSelectedMessageIds([msg.id]);
        },
      },
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          const { error } = await staffDeleteMessage(conversationId, msg.id);
          if (error) {
            Alert.alert(t('error'), typeof error === 'string' ? error : String(error));
            return;
          }
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        },
      },
    ]);
  };

  if (!staff) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen
          options={{
            title: conversationName,
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
          }}
        />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingLabel}>{t('loadingMessages')}</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: conversationName,
          headerStyle: {
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.borderLight,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, androidKbPadding > 0 && { paddingBottom: androidKbPadding }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={invertedChatListItems}
          keyExtractor={(item) => (item.kind === 'message' ? item.message.id : item.key)}
          contentContainerStyle={[CHAT_LIST_INVERTED_CONTENT_STYLE, styles.listContent]}
          showsVerticalScrollIndicator={false}
          {...CHAT_FLAT_LIST_PROPS}
          renderItem={({ item }) => {
            const msg = item.kind === 'message' ? item.message : item.messages[item.messages.length - 1];
            if (msg.message_type === 'screenshot_notice') {
              return <ChatScreenshotNotice message={msg} />;
            }
            const isOwn = msg.sender_id === staff?.id;
            const bubbleColor = isOwn ? (myBubbleColor ?? BUBBLE_OTHER_DIRECT) : (isGroup ? getBubbleColorForSender(msg.sender_id) : BUBBLE_OTHER_DIRECT);
            const resolveVideoUpload = (m: Message) =>
              videoUploads[m.id] ?? Object.values(videoUploads).find((s) => s.messageId === m.id);
            return (
              <MessageBubble
                msg={msg}
                isOwn={isOwn}
                isGroup={isGroup}
                imageAlbum={item.kind === 'image_album' ? item.messages : undefined}
                videoAlbum={item.kind === 'video_album' ? item.messages : undefined}
                videoUploads={videoUploads}
                onImagePress={setFullscreenImageUri}
                onDelete={handleDeleteMessage}
                onToggleSelect={toggleSelectedMessage}
                selected={selectedMessageIds.includes(msg.id)}
                selectionMode={selectionMode}
                bubbleColor={bubbleColor}
                videoUpload={resolveVideoUpload(msg)}
                onVideoRetry={
                  resolveVideoUpload(msg)?.phase === 'failed'
                    ? () => {
                        const st = resolveVideoUpload(msg);
                        if (st) void retryVideoUpload(st);
                      }
                    : undefined
                }
                onVideoRetryForMessage={(m) => {
                  const st = resolveVideoUpload(m);
                  if (st?.phase === 'failed') void retryVideoUpload(st);
                }}
                mediaPreloadReady={heavyMediaReady}
              />
            );
          }}
          ListEmptyComponent={
            <View style={[styles.emptyWrap, styles.emptyWrapInverted]}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubble-outline" size={40} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>{t('staffChatNoMessages')}</Text>
              <Text style={styles.emptyText}>
                {isGroup ? t('staffChatEmptyGroupFirst') : t('staffChatEmptyDirectFirst')}
              </Text>
            </View>
          }
        />
        {typingNames.length > 0 ? (
          <View style={styles.typingRow}>
            {typingNames.length === 1 ? (
              <Text style={styles.typingText} numberOfLines={1}>
                {t('staffChatTypingOne', { name: typingNames[0] })}
              </Text>
            ) : (
              <View style={styles.typingMultiRow}>
                {typingNames.slice(0, 4).map((name) => (
                  <View key={name} style={styles.typingChip}>
                    <Text style={styles.typingChipLetter}>{name.charAt(0).toUpperCase()}</Text>
                  </View>
                ))}
                <Text style={styles.typingTextSmall}> yazıyor...</Text>
              </View>
            )}
          </View>
        ) : null}
        <ChatVideoBatchBar states={videoUploads} />
        {selectionMode ? (
          <View style={styles.bulkBar}>
            <Text style={styles.bulkBarText}>{selectedMessageIds.length} mesaj seçildi</Text>
            <TouchableOpacity
              style={[styles.bulkDeleteBtn, selectedMessageIds.length === 0 && styles.bulkDeleteBtnDisabled]}
              disabled={selectedMessageIds.length === 0}
              onPress={confirmDeleteSelected}
              activeOpacity={0.85}
            >
              <Ionicons name="trash-outline" size={16} color="#fff" />
              <Text style={styles.bulkDeleteBtnText}>Toplu sil</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={[styles.inputRow, { paddingBottom: chatInputBottomPad }]}>
          <ChatMentionComposer
            style={styles.input}
            placeholder={mentionEnabled ? t('chatMentionInputPlaceholder') : t('messageInputPlaceholder')}
            placeholderTextColor={theme.colors.textMuted}
            value={input}
            onChangeText={(next) => {
              setInput(next);
              typingPresenceRef.current?.updateTyping(true);
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => {
                typingPresenceRef.current?.updateTyping(false);
                typingTimeoutRef.current = null;
              }, 3000);
            }}
            participants={mentionParticipants}
            mentions={pendingMentions}
            onMentionsChange={setPendingMentions}
            enabled={mentionEnabled}
            multiline
            maxLength={2000}
            onSubmitEditing={send}
          />
          <TouchableOpacity style={styles.mediaBtn} onPress={showAttachOptions} disabled={sending} activeOpacity={0.7}>
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mediaBtn}
            onPress={() => sendVideoFromSource('library')}
            disabled={videoBatchActive}
            activeOpacity={0.7}
          >
            <Ionicons name="videocam-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, !input.trim() && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim()}
            activeOpacity={0.85}
          >
            <Ionicons name="send" size={20} color={theme.colors.white} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showGroupSettings} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          style={styles.bubbleColorModalOverlay}
          onPress={() => setShowGroupSettings(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.bubbleColorModalBox}>
            <Text style={styles.bubbleColorModalTitle}>{t('staffChatGroupSettings')}</Text>
            <View style={styles.modalAvatarRow}>
              <TouchableOpacity
                onPress={pickAvatarForGroup}
                disabled={uploadingAvatar}
                style={styles.modalAvatarTouch}
              >
                {editGroupAvatar ? (
                  <CachedImage uri={editGroupAvatar} style={styles.modalAvatarImg} contentFit="cover" />
                ) : (
                  <View style={styles.modalAvatarPlaceholder}>
                    <Text style={styles.modalAvatarPlaceholderText}>Fotoğraf</Text>
                  </View>
                )}
                {uploadingAvatar ? (
                  <View style={styles.modalAvatarLoading}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : null}
              </TouchableOpacity>
              <Text style={styles.modalAvatarHint}>{t('staffChatProfilePhoto')}</Text>
            </View>
            <Text style={styles.modalLabel}>{t('staffChatGroupName')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editGroupName}
              onChangeText={setEditGroupName}
              placeholder={t('groupNameExamplePlaceholder')}
              placeholderTextColor={theme.colors.textMuted}
            />
            <Text style={styles.modalLabel}>Tema rengi</Text>
            <View style={styles.themePickerRow}>
              {BUBBLE_COLOR_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={`group-theme-${c}`}
                  style={[
                    styles.themeColorChip,
                    { backgroundColor: c },
                    editGroupThemeColor === c && styles.themeColorChipSelected,
                  ]}
                  onPress={() => setEditGroupThemeColor(c)}
                />
              ))}
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowGroupSettings(false)}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, savingGroup && styles.modalSaveBtnDisabled]}
                onPress={saveGroupSettings}
                disabled={savingGroup}
              >
                {savingGroup ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showBubbleColorModal} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.bubbleColorModalOverlay} onPress={() => setShowBubbleColorModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.bubbleColorModalBox}>
            <Text style={styles.bubbleColorModalTitle}>{t('chatYourBubbleColorTitle')}</Text>
            <View style={styles.bubbleColorRow}>
              {BUBBLE_COLOR_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.bubbleColorChip, { backgroundColor: c }, myBubbleColor === c && styles.bubbleColorChipSelected]}
                  onPress={() => { setMyBubbleColor(c); setShowBubbleColorModal(false); }}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.bubbleColorModalClose} onPress={() => setShowBubbleColorModal(false)}>
              <Text style={styles.bubbleColorModalCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ChatFullscreenImageModal uri={fullscreenImageUri} onClose={() => setFullscreenImageUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingLabel: {
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  headerGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  headerGroupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
  },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAvatarInitial: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
    minWidth: 0,
  },
  listContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  bubbleWrap: {
    marginBottom: 14,
  },
  bubbleWrapSelected: {
    opacity: 0.72,
  },
  bubbleWrapOwn: {
    alignItems: 'flex-end',
  },
  bubbleWrapOther: {
    alignItems: 'flex-start',
  },
  otherMeta: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  otherContent: {
    flex: 1,
    minWidth: 0,
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: theme.colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 4,
    marginLeft: 2,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    ...theme.shadows.sm,
  },
  bubbleOwn: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  bubbleTextOwn: {
    color: theme.colors.white,
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextOther: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    gap: 4,
  },
  bubbleTimeOwn: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.88)',
  },
  bubbleTimeOther: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  readIcon: {
    marginLeft: 2,
  },
  bubbleVideo: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  bubbleTimeVideo: {
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  chatVideoWrap: { marginBottom: 0 },
  imageWrap: { marginTop: 2, width: 200, height: 200, borderRadius: 12, overflow: 'hidden' },
  imageWrapPlaceholder: { backgroundColor: theme.colors.borderLight },
  bubbleImage: { width: 200, height: 200, borderRadius: 12 },
  bubbleColorModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  bubbleColorModalBox: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 320 },
  bubbleColorModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 20 },
  bubbleColorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  bubbleColorChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  bubbleColorChipSelected: { borderColor: theme.colors.primary },
  bubbleColorModalClose: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24 },
  bubbleColorModalCloseText: { fontSize: 16, color: theme.colors.primary, fontWeight: '600' },
  modalAvatarRow: { alignItems: 'center', marginBottom: 20 },
  modalAvatarTouch: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', alignSelf: 'center' },
  modalAvatarImg: { width: 80, height: 80 },
  modalAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAvatarPlaceholderText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalAvatarLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAvatarHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  themePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 18,
  },
  themeColorChip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  themeColorChipSelected: {
    borderColor: '#111827',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: theme.colors.textMuted, fontWeight: '600' },
  modalSaveBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: { opacity: 0.7 },
  modalSaveText: { color: '#fff', fontWeight: '700' },
  mediaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.backgroundSecondary ?? '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyWrapInverted: {
    transform: [{ scaleY: -1 }],
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  typingRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    paddingBottom: 2,
    minHeight: 22,
    backgroundColor: theme.colors.surface,
  },
  typingText: { fontSize: 12, color: theme.colors.textMuted },
  typingMultiRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  typingChip: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  typingChipLetter: { fontSize: 11, fontWeight: '700', color: theme.colors.white },
  typingTextSmall: { fontSize: 11, color: theme.colors.textMuted },
  bulkBar: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulkBarText: {
    fontSize: 13,
    color: theme.colors.textMuted,
    fontWeight: '600',
  },
  bulkDeleteBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulkDeleteBtnDisabled: {
    opacity: 0.5,
  },
  bulkDeleteBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingBottom: 8,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 100,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
