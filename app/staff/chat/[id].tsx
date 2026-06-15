import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
  staffHideMessageForMe,
  staffListHiddenMessageIdsForConversation,
  isPersistedChatMessageId,
  resolveStaffConversationIdForSend,
  staffListMentionParticipants,
  subscribeToMessages,
  subscribeToTypingPresence,
  uploadVoiceMessageForStaff,
} from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import {
  mergeChatMessagesCapped,
  replaceChatMessage,
  upsertIncomingChatMessage,
  latestMessageCreatedAtIso,
  capChatMessageList,
  filterVisibleChatMessages,
  applySilentChatSync,
  type Message,
} from '@/lib/messaging';
import {
  CHAT_LIST_INVERTED_CONTENT_STYLE,
  scrollChatListToLatest,
  useInvertedChatListItems,
  type ChatListRef,
} from '@/lib/chatListScroll';
import { CHAT_FLASH_LIST_PROPS, CHAT_MESSAGES_PAGE_SIZE, useChatHeavyMediaReady } from '@/lib/chatListPerf';
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import { MessageActionSheet, type MessageAction } from '@/components/chat/MessageActionSheet';
import { MessageReadersModal } from '@/components/chat/MessageReadersModal';
import { loadChatMessageReaders, type ChatMessageReaderRow } from '@/lib/chatMessageReaders';
import {
  AttachmentSheet,
  AttachmentToggleIcon,
  type AttachmentAction,
} from '@/components/chat/AttachmentSheet';
import { ConnectionBanner } from '@/components/chat/ConnectionBanner';
import { useChatOutbox } from '@/hooks/chat/useChatOutbox';
import { dequeueTextMessage } from '@/lib/chat/messageQueue';
import { sendOneStaffImage } from '@/lib/chatMediaSend';
import { makeChatAlbumContent } from '@/lib/chatImageAlbum';
import { theme } from '@/constants/theme';
import { ReplyPreviewBar } from '@/components/premium/ReplyPreviewBar';
import { TypingBubble } from '@/components/premium/TypingBubble';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { chatTheme } from '@/constants/chatTheme';
import { createOptimisticImageMessage, createOptimisticTextMessage, createOptimisticVoiceMessage, isTempMessageId } from '@/lib/chatOptimisticMessage';
import * as ImagePicker from 'expo-image-picker';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import {
  useMessagingBubbleStore,
  BUBBLE_COLOR_OPTIONS,
  getBubbleColorForSender,
  BUBBLE_OTHER_DIRECT,
} from '@/stores/messagingBubbleStore';
import { BubbleColorPickerModal } from '@/components/chat/BubbleColorPickerModal';
import { useTranslation } from 'react-i18next';
import { prefetchTranslations } from '@/lib/translateText';
import { ChatFullscreenImageModal } from '@/components/ChatFullscreenImageModal';
import { ChatVideoAlbum } from '@/components/ChatVideoAlbum';
import { buildChatListDisplayItems } from '@/lib/chatImageAlbum';
import { ChatVideoBatchBar } from '@/components/ChatVideoBatchBar';
import {
  createSessionChatVideoHandlers,
  expireStaleChatVideoUploadsForConversation,
  getChatVideoBatchSummary,
  pruneDoneChatVideoUploads,
  cancelChatVideoUpload,
  registerChatVideoScreen,
  retryChatVideoUploadWithSession,
  sendChatVideoFromPickerWithSession,
  useChatVideoUploadStates,
  type ChatVideoUploadState,
} from '@/lib/chatVideoUploadSession';
import {
  pickChatImageFromCamera,
  pickChatImagesFromLibrary,
} from '@/lib/chatMediaSend';
import { useChatScreenshotContext } from '@/lib/chatScreenshot';
import { ChatScreenshotNotice } from '@/components/ChatScreenshotNotice';
import { ChatMentionComposer } from '@/components/ChatMentionComposer';
import {
  notifyChatMessageWithMentions,
  syncMentionsWithText,
  parseMessageMentions,
  type ChatMention,
  type ChatMentionParticipant,
} from '@/lib/chatMentions';
import { usePendingMuxVideoPoll } from '@/lib/usePendingMuxVideoPoll';
import { ChatGroupExportHeaderButtons } from '@/components/chat/ChatGroupExportHeaderButtons';
import { ChatVoiceInputPreview } from '@/components/chat/ChatVoiceInputPreview';
import { ChatInputTrailingActions } from '@/components/chat/ChatInputTrailingActions';
import { useChatVoiceRecording } from '@/hooks/chat/useChatVoiceRecording';
import { useChatVoiceQueueSync } from '@/hooks/chat/useChatVoiceQueueSync';
import { sendStaffVoiceMessage } from '@/lib/chatVoiceSend';

const ALL_STAFF_GROUP_NAME = 'Tüm Çalışanlar';
const STAFF_CHAT_CACHE_PREFIX = 'staff_chat_cache_v1:';
type StaffChatCacheEntry = {
  messages: Message[];
  headerName: string;
  headerAvatar: string | null;
  updatedAt: number;
};
const staffChatMemoryCache: Record<string, StaffChatCacheEntry> = {};

function readStaffChatMemory(conversationId: string): Message[] {
  const mem = staffChatMemoryCache[conversationId];
  return mem?.messages?.length ? filterVisibleChatMessages(mem.messages) : [];
}

function migrateStaffChatCache(fromId: string, toId: string) {
  if (fromId === toId) return;
  const src = staffChatMemoryCache[fromId];
  if (!src?.messages?.length) return;
  const dst = staffChatMemoryCache[toId];
  if (!dst || src.updatedAt >= dst.updatedAt) {
    staffChatMemoryCache[toId] = { ...src };
  }
  void AsyncStorage.getItem(`${STAFF_CHAT_CACHE_PREFIX}${fromId}`).then((raw) => {
    if (!raw) return;
    return AsyncStorage.setItem(`${STAFF_CHAT_CACHE_PREFIX}${toId}`, raw);
  }).catch(() => {});
}

function pruneStaffChatCache(conversationId: string, removedIds: string[]) {
  const removed = new Set(removedIds);
  const mem = staffChatMemoryCache[conversationId];
  if (mem?.messages?.length) {
    mem.messages = filterVisibleChatMessages(mem.messages.filter((m) => !removed.has(m.id)));
    mem.updatedAt = Date.now();
  }
  void AsyncStorage.getItem(`${STAFF_CHAT_CACHE_PREFIX}${conversationId}`)
    .then((raw) => {
      if (!raw) return;
      const parsed = JSON.parse(raw) as StaffChatCacheEntry;
      if (!Array.isArray(parsed?.messages)) return;
      parsed.messages = filterVisibleChatMessages(
        parsed.messages.filter((m) => !removed.has(m.id))
      );
      parsed.updatedAt = Date.now();
      return AsyncStorage.setItem(`${STAFF_CHAT_CACHE_PREFIX}${conversationId}`, JSON.stringify(parsed));
    })
    .catch(() => {});
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
  /** Birebir sohbette kanonik conversation_id; realtime ve fetch bununla eşleşmeli. */
  const [conversationResolved, setConversationResolved] = useState(false);
  const imageSendInFlightRef = useRef(0);
  const [mediaListVersion, setMediaListVersion] = useState(0);
  const videoUploads = useChatVideoUploadStates(conversationId);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [showBubbleColorModal, setShowBubbleColorModal] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [allStaffMuted, setAllStaffMuted] = useState(false);
  const listRef = useRef<ChatListRef>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  /** Birebir sohbette her metin gönderiminde tekrar RPC çözümlemesini önler. */
  const resolvedConversationIdRef = useRef<string | null>(null);
  const resolveRedirectFromRef = useRef<string | null>(null);
  /** inverted listede kullanıcı alttaysa (offset≈0) yeni mesajda kaydır. */
  const stickToBottomRef = useRef(true);
  /** Benden sil — sunucu/önbellek birleşiminde tekrar gösterme. */
  const hiddenForMeIdsRef = useRef<Set<string>>(new Set());
  const cacheWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialFetchDoneRef = useRef<string | null>(null);

  const scrollToLatestIfNeeded = useCallback((force = false) => {
    if (!force && !stickToBottomRef.current) return;
    scrollChatListToLatest(listRef, true);
  }, []);

  const { isOffline, queueIfOffline } = useChatOutbox((result) => {
    if (!staff?.id) return;
    setMessages((prev) => {
      let next = prev;
      for (const m of result.sent) {
        next = upsertIncomingChatMessage(next, m, { ownSenderId: staff.id });
      }
      return next;
    });
    for (const id of result.failedIds) {
      setFailedMessageIds((prev) => new Set(prev).add(id));
    }
  });
  const subscriptionRef = useRef<ReturnType<typeof subscribeToMessages> | null>(null);
  const typingPresenceRef = useRef<ReturnType<typeof subscribeToTypingPresence> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [failedMessageIds, setFailedMessageIds] = useState<Set<string>>(() => new Set());
  const [imageUploadProgress, setImageUploadProgress] = useState<Record<string, number>>({});
  const [failedImageIds, setFailedImageIds] = useState<Set<string>>(() => new Set());
  const imageRetryRef = useRef<Record<string, { uri: string; albumContent: string }>>({});
  const cancelledImageUploadsRef = useRef<Set<string>>(new Set());
  const [hasMoreOlder, setHasMoreOlder] = useState(true);
  const loadingOlderRef = useRef(false);
  const [actionMessage, setActionMessage] = useState<Message | null>(null);
  const [readInfoMessageId, setReadInfoMessageId] = useState<string | null>(null);
  const [readInfoRows, setReadInfoRows] = useState<ChatMessageReaderRow[]>([]);
  const [loadingReadInfo, setLoadingReadInfo] = useState(false);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const pendingSendByTempIdRef = useRef<
    Map<string, { text: string; mentions: ChatMention[]; replyId: string | null }>
  >(new Map());
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const chatHasVideosEarly = useMemo(
    () => messages.some((m) => m.message_type === 'video'),
    [messages]
  );
  const heavyMediaReady = useChatHeavyMediaReady(conversationId, loading && messages.length === 0, {
    hasVideos: chatHasVideosEarly,
  });

  useEffect(() => {
    initialFetchDoneRef.current = null;
    setReplyTarget(null);
    setHasMoreOlder(true);
    setFailedMessageIds(new Set());
    setFailedImageIds(new Set());
    setImageUploadProgress({});
    resolvedConversationIdRef.current = null;
    resolveRedirectFromRef.current = null;
    stickToBottomRef.current = true;
    hiddenForMeIdsRef.current = new Set();
    setConversationResolved(false);

    const cached = conversationId ? readStaffChatMemory(conversationId) : [];
    if (cached.length > 0) {
      setMessages(cached);
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!staff?.id || !conversationId) {
      setConversationResolved(false);
      resolvedConversationIdRef.current = null;
      return;
    }
    let cancelled = false;
    resolvedConversationIdRef.current = null;
    (async () => {
      try {
        const resolved = await resolveStaffConversationIdForSend(conversationId, staff.id);
        if (cancelled) return;
        resolvedConversationIdRef.current = resolved;
        if (resolved !== conversationId) {
          if (resolveRedirectFromRef.current === conversationId) {
            setConversationResolved(true);
            return;
          }
          resolveRedirectFromRef.current = conversationId;
          migrateStaffChatCache(conversationId, resolved);
          router.replace({ pathname: '/staff/chat/[id]', params: { id: resolved } });
          return;
        }
        resolveRedirectFromRef.current = null;
        setConversationResolved(true);
      } catch {
        if (!cancelled) {
          resolvedConversationIdRef.current = conversationId;
          setConversationResolved(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, staff?.id, router]);

  const messageById = useMemo(() => {
    const map = new Map<string, Message>();
    for (const m of messages) map.set(m.id, m);
    return map;
  }, [messages]);

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
    if (readStaffChatMemory(conversationId).length > 0) return;
    let cancelled = false;
    void AsyncStorage.getItem(`${STAFF_CHAT_CACHE_PREFIX}${conversationId}`)
      .then((raw) => {
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as StaffChatCacheEntry;
        if (!Array.isArray(parsed?.messages) || parsed.messages.length === 0) return;
        const visible = filterVisibleChatMessages(parsed.messages);
        staffChatMemoryCache[conversationId] = {
          messages: visible,
          headerName: parsed.headerName,
          headerAvatar: parsed.headerAvatar ?? null,
          updatedAt: parsed.updatedAt ?? Date.now(),
        };
        setMessages(visible);
        if (parsed.headerName) setConversationName(parsed.headerName);
        setHeaderAvatar(parsed.headerAvatar ?? null);
        setLoading(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || messages.length === 0) return;
    const entry: StaffChatCacheEntry = {
      messages: capChatMessageList(filterVisibleChatMessages(messages)),
      headerName: conversationName,
      headerAvatar: headerAvatar ?? null,
      updatedAt: Date.now(),
    };
    staffChatMemoryCache[conversationId] = entry;
    if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current);
    cacheWriteTimerRef.current = setTimeout(() => {
      void AsyncStorage.setItem(`${STAFF_CHAT_CACHE_PREFIX}${conversationId}`, JSON.stringify(entry)).catch(
        () => {}
      );
    }, 1200);
    return () => {
      if (cacheWriteTimerRef.current) clearTimeout(cacheWriteTimerRef.current);
    };
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
  useChatVoiceQueueSync(messages, invertedChatListItems, listRef);
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

  const screenshotChatContext = useMemo(() => {
    if (!staff?.id || !conversationId) return null;
    return {
      conversationId,
      conversationName,
      isGroup,
      chatUrl: `/staff/chat/${conversationId}`,
      actor: { kind: 'staff' as const, staffId: staff.id, senderName: screenshotSenderName },
      pushBody: screenshotPushBody,
      ownSenderId: staff.id,
      onLocalMessage: (msg: Message) => {
        setMessages((prev) => upsertIncomingChatMessage(prev, msg, { ownSenderId: staff.id }));
        setTimeout(() => scrollChatListToLatest(listRef, true), 100);
      },
      reloadStaffMessages: () => staffGetMessages(conversationId, 50, undefined, staff.id),
    };
  }, [
    staff?.id,
    conversationId,
    conversationName,
    isGroup,
    screenshotSenderName,
    screenshotPushBody,
  ]);

  useChatScreenshotContext(Boolean(staff?.id && conversationId && !loading), screenshotChatContext);

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

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedMessageIds([]);
  }, []);

  const selectAllOwnMessages = useCallback(() => {
    const ownIds = messages
      .filter(
        (m) =>
          m.sender_id === staff?.id &&
          !m.is_deleted &&
          isPersistedChatMessageId(m.id)
      )
      .map((m) => m.id);
    setSelectedMessageIds((prev) => (prev.length === ownIds.length ? [] : ownIds));
  }, [messages, staff?.id]);

  const deleteSelectedMessages = useCallback(
    async (ids: string[]) => {
      if (!conversationId || !staff?.id || ids.length === 0) return;
      const persistedIds = ids.filter(isPersistedChatMessageId);
      const pendingIds = ids.filter((id) => !isPersistedChatMessageId(id));

      if (pendingIds.length) {
        setMessages((prev) => prev.filter((m) => !pendingIds.includes(m.id)));
        pendingIds.forEach((id) => {
          pendingSendByTempIdRef.current.delete(id);
          cancelledImageUploadsRef.current.add(id);
        });
      }
      if (!persistedIds.length) return;

      let resolvedConv = conversationId;
      try {
        resolvedConv = await resolveStaffConversationIdForSend(conversationId, staff.id);
      } catch {
        /* mevcut id ile dene */
      }

      const byId = new Map(messagesRef.current.map((m) => [m.id, m]));
      const results = await Promise.all(
        persistedIds.map(async (id) => {
          const msg = byId.get(id);
          const convId = msg?.conversation_id ?? resolvedConv;
          let result = await staffDeleteMessage(convId, id);
          if (result.error && convId !== resolvedConv) {
            result = await staffDeleteMessage(resolvedConv, id);
          }
          return result;
        })
      );
      const successIds = persistedIds.filter((_, idx) => !results[idx].error);
      const failed = results.filter((r) => r.error).length;
      if (successIds.length) {
        pruneStaffChatCache(conversationId, successIds);
        setMessages((prev) => prev.filter((m) => !successIds.includes(m.id)));
        stickToBottomRef.current = true;
      }
      if (failed > 0) Alert.alert(t('error'), t('staffChatDeleteFailedCount', { count: failed }));
    },
    [conversationId, staff?.id, t]
  );

  const confirmDeleteSelected = useCallback(() => {
    if (selectedMessageIds.length === 0) return;
    Alert.alert(
      t('staffChatDeleteForEveryone'),
      selectedMessageIds.length === 1
        ? t('staffChatDeleteForEveryoneMsg')
        : t('staffChatDeleteForEveryoneMsgPlural'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('staffChatDeleteBtn'),
          style: 'destructive',
          onPress: async () => {
            await deleteSelectedMessages(selectedMessageIds);
            exitSelectionMode();
          },
        },
      ]
    );
  }, [selectedMessageIds, deleteSelectedMessages, exitSelectionMode, t]);

  useEffect(() => {
    if (selectionMode) {
      navigation.setOptions({
        headerTitle: () => (
          <Text style={styles.selectionHeaderTitle} numberOfLines={1}>
            {selectedMessageIds.length} mesaj seçildi
          </Text>
        ),
        headerTitleAlign: 'center',
        headerStyle: {
          backgroundColor: theme.colors.surface,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.borderLight,
        },
        headerTintColor: theme.colors.text,
        headerBackTitle: ' ',
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable onPress={exitSelectionMode} hitSlop={12} style={styles.headerIconTouch}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
        ),
        headerRight: () => (
          <View style={styles.headerActions}>
            <Pressable
              onPress={selectAllOwnMessages}
              hitSlop={12}
              style={styles.headerIconTouch}
            >
              <Ionicons
                name={selectedMessageIds.length > 0 ? 'checkbox' : 'square-outline'}
                size={22}
                color={theme.colors.primary}
              />
            </Pressable>
            <Pressable
              onPress={confirmDeleteSelected}
              disabled={selectedMessageIds.length === 0}
              hitSlop={12}
              style={[styles.headerIconTouch, selectedMessageIds.length === 0 && styles.headerIconDisabled]}
            >
              <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
            </Pressable>
          </View>
        ),
      });
      return;
    }

    const isAllStaff = isAllStaffGroup;
    const headerTitleMaxWidth = Math.max(120, Math.min(280, winWidth - 160));
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
      headerTitleAlign: 'left',
      headerStyle: {
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
      },
      headerTintColor: theme.colors.text,
      headerBackTitle: t('back'),
      headerBackVisible: undefined,
      headerLeft: undefined,
      headerRight: () => (
        <View style={styles.headerActions}>
          {canEditGroup && staff?.id && conversationId ? (
            <ChatGroupExportHeaderButtons
              conversationId={conversationId}
              staffId={staff.id}
              conversationName={conversationName || t('screenChat')}
              iconColor={groupThemeColor}
              compact
            />
          ) : null}
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
    exitSelectionMode,
    selectAllOwnMessages,
    confirmDeleteSelected,
  ]);

  useEffect(() => {
    if (!staff || !conversationId || !conversationResolved) {
      if (!conversationId) setLoading(false);
      return;
    }
    const fetchKey = `${conversationId}:${staff.id}`;
    if (initialFetchDoneRef.current === fetchKey) return;
    initialFetchDoneRef.current = fetchKey;

    let cancelled = false;
    (async () => {
      const localSeed = filterVisibleChatMessages(messagesRef.current);
      const memSeed = readStaffChatMemory(conversationId);
      const seed = localSeed.length > 0 ? localSeed : memSeed;
      const hasLocalCache = seed.length > 0;

      if (hasLocalCache) {
        setLoading(false);
      }

      const afterIso = hasLocalCache ? latestMessageCreatedAtIso(seed) : undefined;
      const [hiddenIds, list] = await Promise.all([
        staffListHiddenMessageIdsForConversation(conversationId, staff.id),
        staffGetMessages(
          conversationId,
          hasLocalCache ? 50 : CHAT_MESSAGES_PAGE_SIZE,
          undefined,
          staff.id,
          hasLocalCache && afterIso ? { afterCreatedAt: afterIso } : undefined
        ),
      ]);
      if (cancelled) return;
      hiddenForMeIdsRef.current = new Set(hiddenIds);

      const rows = list.filter((m) => !hiddenForMeIdsRef.current.has(m.id));

      if (hasLocalCache) {
        setMessages((prev) => {
          const base = filterVisibleChatMessages(prev.length > 0 ? prev : seed).filter(
            (m) => !hiddenForMeIdsRef.current.has(m.id)
          );
          return rows.length > 0
            ? applySilentChatSync(base, rows, hiddenForMeIdsRef.current)
            : base;
        });
        setHasMoreOlder(true);
      } else {
        setMessages(rows);
        setHasMoreOlder(rows.length >= CHAT_MESSAGES_PAGE_SIZE);
      }

      void staffMarkConversationRead(conversationId, staff.id);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [staff?.id, conversationId, conversationResolved]);

  /** Arka plan: liste titremez; yalnızca yeni/güncel satırlar eklenir. */
  const syncNewMessagesFromServer = useCallback(
    (opts?: { allowScroll?: boolean }) => {
      if (!staff?.id || !conversationId || !conversationResolved) return;
      const visible = messagesRef.current.filter((m) => !hiddenForMeIdsRef.current.has(m.id));
      const afterIso =
        visible.length > 0 ? latestMessageCreatedAtIso(visible) : undefined;
      void staffGetMessages(conversationId, 80, undefined, staff.id, {
        afterCreatedAt: afterIso,
      }).then((list) => {
        const rows = list.filter((m) => !hiddenForMeIdsRef.current.has(m.id));
        if (!rows.length) return;
        let addedIncoming = false;
        setMessages((prev) => {
          const next = applySilentChatSync(prev, rows, hiddenForMeIdsRef.current);
          if (next !== prev) {
            addedIncoming = rows.some(
              (m) => m.sender_id !== staff.id && !prev.some((p) => p.id === m.id)
            );
          }
          return next;
        });
        if (addedIncoming) {
          stickToBottomRef.current = true;
          scrollToLatestIfNeeded(true);
        }
      });
    },
    [staff?.id, conversationId, conversationResolved, scrollToLatestIfNeeded]
  );

  useEffect(() => {
    if (!staff?.id || !conversationId || !conversationResolved) return;
    const timer = setInterval(() => syncNewMessagesFromServer(), 60_000);
    return () => clearInterval(timer);
  }, [staff?.id, conversationId, conversationResolved, syncNewMessagesFromServer]);

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
    if (!conversationId || !conversationResolved) return;
    subscriptionRef.current = subscribeToMessages(
      conversationId,
      (newMsg) => {
        let replaceTempId: string | undefined;
        if (staff?.id && newMsg.sender_id === staff.id && newMsg.message_type === 'text') {
          const text = (newMsg.content ?? '').trim();
          if (text) {
            replaceTempId = messagesRef.current.find(
              (m) => isTempMessageId(m.id) && (m.content ?? '').trim() === text
            )?.id;
          }
        }
        setMessages((prev) =>
          upsertIncomingChatMessage(prev, newMsg, {
            ownSenderId: staff?.id,
            replaceTempId,
          })
        );
        if (
          newMsg.message_type === 'text' &&
          newMsg.sender_id !== staff?.id &&
          (newMsg.content ?? '').trim()
        ) {
          prefetchTranslations([(newMsg.content ?? '').trim()]);
        }
        if (newMsg.sender_id !== staff?.id) {
          stickToBottomRef.current = true;
          scrollToLatestIfNeeded(true);
        } else if (stickToBottomRef.current) {
          scrollToLatestIfNeeded(true);
        }
      },
      {
        onMessageDeleted: (messageId) => {
          pruneStaffChatCache(conversationId, [messageId]);
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        },
        onMessageUpdated: (updated) => {
          if (updated.is_deleted) {
            pruneStaffChatCache(conversationId, [updated.id]);
            setMessages((prev) => prev.filter((m) => m.id !== updated.id));
            return;
          }
          setMessages((prev) => replaceChatMessage(prev, updated));
        },
      }
    );
    return () => subscriptionRef.current?.unsubscribe?.();
  }, [conversationId, conversationResolved, staff?.id, scrollToLatestIfNeeded]);

  useEffect(() => {
    if (!selectionMode) return;
    const ownIds = new Set(
      messages
        .filter(
          (m) =>
            m.sender_id === staff?.id &&
            !m.is_deleted &&
            isPersistedChatMessageId(m.id)
        )
        .map((m) => m.id)
    );
    setSelectedMessageIds((prev) => prev.filter((id) => ownIds.has(id)));
  }, [messages, selectionMode, staff?.id]);

  useEffect(() => {
    if (!conversationId || !staff || !conversationResolved) return;
    typingPresenceRef.current = subscribeToTypingPresence(
      conversationId,
      { displayName: staff.full_name || staff.email || t('visitorTypeStaff'), userId: staff.id },
      setTypingNames
    );
    return () => {
      typingPresenceRef.current?.unsubscribe?.();
      typingPresenceRef.current = null;
    };
  }, [conversationId, conversationResolved, staff?.id, staff?.full_name, staff?.email, t]);

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

  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || !staff?.id || loadingOlderRef.current || !hasMoreOlder) return;
    const oldest = messages.find((m) => !isTempMessageId(m.id));
    if (!oldest) return;
    loadingOlderRef.current = true;
    try {
      const older = await staffGetMessages(
        conversationId,
        CHAT_MESSAGES_PAGE_SIZE,
        oldest.id,
        staff.id
      );
      if (older.length === 0) {
        setHasMoreOlder(false);
        return;
      }
      const rows = older.filter((m) => !hiddenForMeIdsRef.current.has(m.id));
      if (rows.length) {
        setMessages((prev) => mergeChatMessagesCapped(rows, prev));
      }
      setHasMoreOlder(older.length >= CHAT_MESSAGES_PAGE_SIZE);
    } finally {
      loadingOlderRef.current = false;
    }
  }, [conversationId, staff?.id, hasMoreOlder, messages]);

  const deliverTextMessage = async (
    text: string,
    mentions: ChatMention[],
    replyId: string | null,
    tempId: string
  ) => {
    if (!staff || !conversationId) return;
    const targetConv = resolvedConversationIdRef.current ?? conversationId;
    if (isOffline) {
      await queueIfOffline({
        id: tempId,
        conversationId: targetConv,
        staffId: staff.id,
        staffName: staff.full_name || staff.email,
        staffAvatar: staff.profile_image ?? null,
        text,
        replyToId: replyId,
        mentions,
        createdAt: new Date().toISOString(),
      });
      return;
    }
    try {
      const { data: sent, error, conversationId: nextConversationId } = await staffSendMessage(
        targetConv,
        staff.id,
        staff.full_name || staff.email,
        staff.profile_image ?? null,
        text,
        'text',
        undefined,
        undefined,
        targetConv,
        mentions.length ? mentions : undefined,
        replyId
      );
      if (error || !sent) {
        setFailedMessageIds((prev) => new Set(prev).add(tempId));
        if (error) {
          Alert.alert(t('messageSendFailedTitle'), typeof error === 'string' ? error : String(error));
        }
        return;
      }
      setFailedMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(tempId);
        return next;
      });
      await dequeueTextMessage(tempId).catch(() => {});
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        return upsertIncomingChatMessage(withoutTemp, sent, {
          ownSenderId: staff.id,
          replaceTempId: tempId,
        });
      });
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
      if (nextConversationId && nextConversationId !== targetConv) {
        resolvedConversationIdRef.current = nextConversationId;
        router.replace({ pathname: '/staff/chat/[id]', params: { id: nextConversationId } });
        return;
      }
      scrollToLatestIfNeeded(true);
    } catch (e) {
      setFailedMessageIds((prev) => new Set(prev).add(tempId));
      Alert.alert(t('messageSendFailedTitle'), formatChatMessageSendError(e, t('unknownError')));
    } finally {
      pendingSendByTempIdRef.current.delete(tempId);
    }
  };

  const send = () => {
    const text = input.trim();
    if (!text || !staff || !conversationId) return;
    const mentions = syncMentionsWithText(text, pendingMentions);
    setInput('');
    setPendingMentions([]);
    const replyId = replyTarget?.id ?? null;
    setReplyTarget(null);
    typingPresenceRef.current?.updateTyping(false);
    const targetConv = resolvedConversationIdRef.current ?? conversationId;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    stickToBottomRef.current = true;
    const optimistic = createOptimisticTextMessage({
      tempId,
      conversationId: targetConv,
      senderId: staff.id,
      senderName: staff.full_name || staff.email,
      senderAvatar: staff.profile_image ?? null,
      text,
      replyToId: replyId,
      mentions,
    });
    pendingSendByTempIdRef.current.set(tempId, { text, mentions, replyId });
    setMessages((prev) => [...prev, optimistic]);
    scrollToLatestIfNeeded(true);
    void deliverTextMessage(text, mentions, replyId, tempId);
  };

  const retryFailedMessage = (msg: Message) => {
    if (!isTempMessageId(msg.id) || !staff) return;
    const payload = pendingSendByTempIdRef.current.get(msg.id);
    const text = payload?.text ?? msg.content ?? '';
    const mentions = payload?.mentions ?? parseMessageMentions(msg.mentions);
    const replyId = msg.reply_to_id;
    if (!text.trim()) return;
    setFailedMessageIds((prev) => {
      const next = new Set(prev);
      next.delete(msg.id);
      return next;
    });
    pendingSendByTempIdRef.current.set(msg.id, { text, mentions, replyId });
    void deliverTextMessage(text, mentions, replyId, msg.id);
  };

  const uploadStaffImages = async (uris: string[]) => {
    if (!staff || !conversationId || !uris.length) return;
    if (isOffline) {
      Alert.alert(t('error'), t('staffChatOfflineMedia'));
      return;
    }
    let convId = conversationId;
    try {
      convId = await resolveStaffConversationIdForSend(conversationId, staff.id);
      if (convId !== conversationId) {
        router.replace({ pathname: '/staff/chat/[id]', params: { id: convId } });
      }
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('unknownError'));
      return;
    }
    const batchId = uris.length > 1 ? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` : null;
    const optimisticRows = uris.map((uri, i) =>
      createOptimisticImageMessage({
        tempId: `temp-img-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        conversationId: convId,
        senderId: staff.id,
        senderName: staff.full_name || staff.email,
        senderAvatar: staff.profile_image ?? null,
        localUri: uri,
        albumContent: batchId ? makeChatAlbumContent(batchId) : '',
      })
    );
    optimisticRows.forEach((row, i) => {
      imageRetryRef.current[row.id] = {
        uri: uris[i],
        albumContent: row.content ?? '',
      };
    });
    imageSendInFlightRef.current += 1;
    setMediaListVersion((v) => v + 1);
    setMessages((prev) => [...prev, ...optimisticRows]);
    requestAnimationFrame(() => scrollChatListToLatest(listRef, true));
    const actor = {
      kind: 'staff' as const,
      staffId: staff.id,
      staffName: staff.full_name || staff.email,
      staffAvatar: staff.profile_image ?? null,
      conversationId: convId,
    };
    let failed = 0;
    try {
      for (let i = 0; i < uris.length; i++) {
        const tempId = optimisticRows[i].id;
        if (cancelledImageUploadsRef.current.has(tempId)) {
          setImageUploadProgress((p) => {
            const next = { ...p };
            delete next[tempId];
            return next;
          });
          continue;
        }
        setImageUploadProgress((p) => ({ ...p, [tempId]: 0.05 }));
        setFailedImageIds((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          return next;
        });
        const { message, conversationId: cid, error } = await sendOneStaffImage(
          { ...actor, conversationId: convId },
          uris[i],
          optimisticRows[i].content ?? '',
          (fraction) => setImageUploadProgress((p) => ({ ...p, [tempId]: fraction })),
          convId
        );
        if (cid && cid !== convId) {
          convId = cid;
          router.replace({ pathname: '/staff/chat/[id]', params: { id: convId } });
        }
        if (error || !message) {
          failed += 1;
          setFailedImageIds((prev) => new Set(prev).add(tempId));
          continue;
        }
        setMessages((prev) => {
          const without = prev.filter((m) => m.id !== tempId);
          return upsertIncomingChatMessage(without, message, {
            ownSenderId: staff.id,
            replaceTempId: tempId,
          });
        });
        setMediaListVersion((v) => v + 1);
        setImageUploadProgress((p) => {
          const next = { ...p };
          delete next[tempId];
          return next;
        });
        delete imageRetryRef.current[tempId];
      }
      if (failed === 0 && uris.length > 0) {
        const { notifyConversationRecipients } = await import('@/lib/notificationService');
        notifyConversationRecipients({
          conversationId: convId,
          excludeStaffId: staff.id,
          title: conversationName || t('notifNewMessage'),
          body: t('staffChatPhotoSentBody'),
          data: { conversationId: convId, url: `/staff/chat/${convId}` },
        }).catch(() => {});
        scrollChatListToLatest(listRef, true);
      }
      if (failed > 0) Alert.alert(t('error'), t('chatMediaPartialFail', { count: failed }));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      imageSendInFlightRef.current = Math.max(0, imageSendInFlightRef.current - 1);
      setMediaListVersion((v) => v + 1);
    }
  };

  const sendImagesFromLibrary = async () => {
    if (!staff || !conversationId) return;
    const uris = await pickChatImagesFromLibrary();
    if (!uris.length) return;
    await uploadStaffImages(uris);
  };

  const retryImageUpload = (msg: Message) => {
    const payload = imageRetryRef.current[msg.id];
    if (!payload) return;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    void uploadStaffImages([payload.uri]);
  };

  const sendImageFromCamera = async () => {
    if (!staff || !conversationId) return;
    const granted = await ensureCameraPermission({
      title: t('chatCameraPermissionTitle'),
      message: t('chatCameraPermissionMessage'),
      settingsMessage: t('chatCameraPermissionSettings'),
    });
    if (!granted) return;
    const uri = await pickChatImageFromCamera();
    if (!uri) return;
    await uploadStaffImages([uri]);
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
    if (isOffline) {
      Alert.alert(t('error'), t('staffChatOfflineMedia'));
      return;
    }
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

  const sendVoiceMessage = useCallback(
    async ({
      localUri,
      preUploadedUrl,
      durationSec,
    }: {
      localUri: string;
      preUploadedUrl: string | null;
      durationSec: number;
    }) => {
      if (!staff || !conversationId) return;
      if (isOffline) {
        throw new Error(t('staffChatOfflineMedia'));
      }
      const tempId = `temp-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      stickToBottomRef.current = true;
      setMessages((prev) => [
        ...prev,
        createOptimisticVoiceMessage({
          tempId,
          conversationId,
          senderId: staff.id,
          senderType: 'staff',
          senderName: staff.full_name || staff.email,
          senderAvatar: staff.profile_image ?? null,
          localUri,
          durationSec,
        }),
      ]);
      scrollChatListToLatest(listRef, true);

      let convId = conversationId;
      try {
        convId = await resolveStaffConversationIdForSend(conversationId, staff.id);
        if (convId !== conversationId) {
          router.replace({ pathname: '/staff/chat/[id]', params: { id: convId } });
        }
      } catch (e) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw e;
      }

      const actor = {
        kind: 'staff' as const,
        staffId: staff.id,
        staffName: staff.full_name || staff.email,
        staffAvatar: staff.profile_image ?? null,
        conversationId: convId,
      };
      const { message, error, conversationId: cid } = await sendStaffVoiceMessage(
        actor,
        localUri,
        convId,
        { preUploadedMediaUrl: preUploadedUrl, durationSec }
      );
      if (error || !message) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw new Error(typeof error === 'string' ? error : t('chatVoiceSendFailed'));
      }
      setMessages((prev) =>
        upsertIncomingChatMessage(
          prev.filter((m) => m.id !== tempId),
          message,
          { ownSenderId: staff.id, replaceTempId: tempId }
        )
      );
      const finalConvId = cid ?? convId;
      void import('@/lib/notificationService').then(({ notifyConversationRecipients }) =>
        notifyConversationRecipients({
          conversationId: finalConvId,
          excludeStaffId: staff.id,
          title: conversationName || t('notifNewMessage'),
          body: t('staffChatVoiceSentBody'),
          data: { conversationId: finalConvId, url: `/staff/chat/${finalConvId}` },
        })
      );
      scrollChatListToLatest(listRef, true);
    },
    [staff, conversationId, isOffline, t, conversationName, router]
  );

  const preUploadVoice = useCallback(
    (uri: string) => uploadVoiceMessageForStaff(uri),
    []
  );

  const voiceRecorder = useChatVoiceRecording({
    onSend: sendVoiceMessage,
    preUpload: preUploadVoice,
    preUploadKey: conversationId,
    disabled: isOffline || selectionMode,
  });

  const handleAttachmentPick = (action: AttachmentAction) => {
    switch (action) {
      case 'camera':
        void sendImageFromCamera();
        break;
      case 'gallery':
        void sendImagesFromLibrary();
        break;
      case 'video_library':
        void sendVideoFromSource('library');
        break;
      case 'video_camera':
        void sendVideoFromSource('camera');
        break;
      case 'voice':
        void voiceRecorder.start();
        break;
    }
  };

  const toggleAttachTray = useCallback(() => {
    setAttachSheetVisible((open) => {
      if (!open) Keyboard.dismiss();
      return !open;
    });
  }, []);

  const removeMessageLocal = async (msg: Message, forEveryone: boolean) => {
    if (!conversationId || !staff) return;
    if (isTempMessageId(msg.id)) {
      if (msg.message_type === 'image') removePendingImageMessage(msg);
      else if (msg.message_type === 'video') cancelPendingUpload(msg);
      else setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      return;
    }
    if (forEveryone && msg.sender_id === staff?.id) {
      if (!isPersistedChatMessageId(msg.id)) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        pendingSendByTempIdRef.current.delete(msg.id);
        return;
      }
      let convId = msg.conversation_id ?? conversationId;
      try {
        convId = await resolveStaffConversationIdForSend(convId, staff.id);
      } catch {
        /* mevcut id */
      }
      let { error } = await staffDeleteMessage(convId, msg.id);
      if (error && convId !== conversationId) {
        const retry = await staffDeleteMessage(conversationId, msg.id);
        error = retry.error;
        if (!error) convId = conversationId;
      }
      if (error) {
        try {
          const canonical = await resolveStaffConversationIdForSend(conversationId, staff.id);
          if (canonical !== convId) {
            const retry = await staffDeleteMessage(canonical, msg.id);
            error = retry.error;
          }
        } catch {
          /* ignore */
        }
      }
      if (error) {
        Alert.alert(t('error'), typeof error === 'string' ? error : String(error));
        return;
      }
      pruneStaffChatCache(conversationId, [msg.id]);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      return;
    }
    if (!isPersistedChatMessageId(msg.id)) {
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      return;
    }
    let convId = msg.conversation_id ?? resolvedConversationIdRef.current ?? conversationId;
    try {
      convId = await resolveStaffConversationIdForSend(convId, staff.id);
    } catch {
      /* mevcut id */
    }
    let { error } = await staffHideMessageForMe(convId, msg.id);
    if (error && convId !== conversationId) {
      const retry = await staffHideMessageForMe(conversationId, msg.id);
      error = retry.error;
    }
    if (error) {
      Alert.alert(t('error'), error);
      return;
    }
    hiddenForMeIdsRef.current.add(msg.id);
    pruneStaffChatCache(conversationId, [msg.id]);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
  };

  const openMessageReadInfo = useCallback(
    async (msg: Message) => {
      if (!staff?.id || msg.sender_id !== staff.id || isTempMessageId(msg.id)) return;
      setReadInfoMessageId(msg.id);
      setLoadingReadInfo(true);
      setReadInfoRows([]);
      const { rows, error } = await loadChatMessageReaders(msg.id);
      setReadInfoRows(rows);
      setLoadingReadInfo(false);
      if (error) {
        Alert.alert(t('error'), t('staffChatMessageInfoFailed'));
      }
    },
    [staff?.id, t]
  );

  const handleMessageAction = (action: MessageAction) => {
    const msg = actionMessage;
    if (!msg) return;
    switch (action) {
      case 'reply':
        setReplyTarget(msg);
        break;
      case 'copy':
        void Clipboard.setStringAsync(msg.content ?? msg.media_url ?? '');
        break;
      case 'info':
        void openMessageReadInfo(msg);
        break;
      case 'select':
        setSelectionMode(true);
        setSelectedMessageIds(msg.sender_id === staff?.id ? [msg.id] : []);
        break;
      case 'delete_me':
        void removeMessageLocal(msg, false);
        break;
      case 'delete_all':
        void removeMessageLocal(msg, true);
        break;
    }
    setActionMessage(null);
  };

  const openMessageActions = (msg: Message) => {
    if (selectionMode) return;
    setActionMessage(msg);
  };

  const toggleSelectedMessage = (msg: Message) => {
    if (msg.sender_id !== staff?.id || !isPersistedChatMessageId(msg.id)) return;
    setSelectedMessageIds((prev) =>
      prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
    );
  };

  const handleDeleteMessage = (msg: Message) => {
    if (selectionMode && msg.sender_id === staff?.id) {
      toggleSelectedMessage(msg);
      return;
    }
    openMessageActions(msg);
  };

  const removePendingImageMessage = useCallback((msg: Message) => {
    cancelledImageUploadsRef.current.add(msg.id);
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    setImageUploadProgress((p) => {
      const next = { ...p };
      delete next[msg.id];
      return next;
    });
    setFailedImageIds((prev) => {
      const next = new Set(prev);
      next.delete(msg.id);
      return next;
    });
    delete imageRetryRef.current[msg.id];
  }, []);

  const cancelPendingUpload = useCallback(
    (msg: Message) => {
      Alert.alert(t('staffChatCancelUploadTitle'), t('staffChatCancelUploadMsg'), [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('staffChatRemove'),
          style: 'destructive',
          onPress: () => {
            if (msg.message_type === 'video' && conversationId) {
              const upload =
                videoUploads[msg.id] ??
                Object.values(videoUploads).find((s) => s.messageId === msg.id);
              if (upload) {
                const removedIds = cancelChatVideoUpload(conversationId, upload);
                setMessages((prev) => prev.filter((m) => !removedIds.includes(m.id)));
                const realId = upload.messageId;
                if (realId && !isTempMessageId(realId)) {
                  void staffDeleteMessage(conversationId, realId);
                }
              } else {
                setMessages((prev) => prev.filter((m) => m.id !== msg.id));
              }
              return;
            }
            if (msg.message_type === 'image') {
              removePendingImageMessage(msg);
            }
          },
        },
      ]);
    },
    [conversationId, t, videoUploads, removePendingImageMessage]
  );

  if (!staff) return null;

  return (
    <>
      <KeyboardAvoidingView
        style={[styles.container, androidKbPadding > 0 && { paddingBottom: androidKbPadding }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <ConnectionBanner visible={isOffline} />
        <View style={styles.messageListHost}>
        <FlashList
          ref={listRef}
          style={styles.messageList}
          data={invertedChatListItems}
          extraData={{
            messageCount: messages.length,
            lastMessageId: messages[messages.length - 1]?.id ?? '',
            mediaListVersion,
            imageUploadProgress,
            failedImageIds,
            videoUploads,
            myBubbleColor,
          }}
          keyExtractor={(item) => (item.kind === 'message' ? item.message.id : item.key)}
          contentContainerStyle={[
            invertedChatListItems.length > 0 ? CHAT_LIST_INVERTED_CONTENT_STYLE : undefined,
            styles.listContent,
          ]}
          showsVerticalScrollIndicator={false}
          {...CHAT_FLASH_LIST_PROPS}
          onScroll={(e) => {
            stickToBottomRef.current = e.nativeEvent.contentOffset.y < 120;
          }}
          scrollEventThrottle={100}
          onEndReached={() => void loadOlderMessages()}
          onEndReachedThreshold={0.2}
          renderItem={({ item }) => {
            const msg =
              item.kind === 'message'
                ? item.message
                : item.messages.find(
                    (m) =>
                      isTempMessageId(m.id) ||
                      imageUploadProgress[m.id] != null ||
                      failedImageIds.has(m.id)
                  ) ?? item.messages[item.messages.length - 1];
            if (msg.message_type === 'screenshot_notice') {
              return <ChatScreenshotNotice message={msg} />;
            }
            const isOwn = msg.sender_id === staff?.id;
            const bubbleColor = isOwn
              ? myBubbleColor
              : isGroup
                ? getBubbleColorForSender(msg.sender_id)
                : BUBBLE_OTHER_DIRECT;
            const resolveVideoUpload = (m: Message) =>
              videoUploads[m.id] ?? Object.values(videoUploads).find((s) => s.messageId === m.id);
            return (
              <MessageBubble
                msg={msg}
                isOwn={isOwn}
                isGroup={isGroup}
                bubbleColor={bubbleColor}
                imageAlbum={item.kind === 'image_album' ? item.messages : undefined}
                imageUploadProgress={
                  imageUploadProgress[msg.id] ??
                  (item.kind === 'image_album'
                    ? item.messages.map((m) => imageUploadProgress[m.id]).find((p) => p != null)
                    : undefined)
                }
                videoAlbum={item.kind === 'video_album' ? item.messages : undefined}
                videoUploads={videoUploads}
                onImagePress={setFullscreenImageUri}
                onDelete={handleDeleteMessage}
                onOpenActions={openMessageActions}
                onToggleSelect={toggleSelectedMessage}
                selected={selectedMessageIds.includes(msg.id)}
                selectionMode={selectionMode}
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
                replyToMessage={msg.reply_to_id ? messageById.get(msg.reply_to_id) ?? null : null}
                onReply={() => setReplyTarget(msg)}
                sendFailed={failedMessageIds.has(msg.id)}
                onRetrySend={() => retryFailedMessage(msg)}
                imageUploadFailed={
                  failedImageIds.has(msg.id) ||
                  (item.kind === 'image_album' ? item.messages.some((m) => failedImageIds.has(m.id)) : false)
                }
                onRetryImageUpload={() => retryImageUpload(msg)}
                onCancelPendingUpload={
                  isOwn &&
                  (isTempMessageId(msg.id) ||
                    imageUploadProgress[msg.id] != null ||
                    failedImageIds.has(msg.id) ||
                    Boolean(resolveVideoUpload(msg)?.phase && resolveVideoUpload(msg)?.phase !== 'done'))
                    ? () => cancelPendingUpload(msg)
                    : undefined
                }
                onOpenReadInfo={
                  isOwn && !isTempMessageId(msg.id) ? () => void openMessageReadInfo(msg) : undefined
                }
              />
            );
          }}
        />
        {invertedChatListItems.length === 0 ? (
          <View style={styles.emptyStateOverlay} pointerEvents="none">
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubble-outline" size={40} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>{t('staffChatNoMessages')}</Text>
              <Text style={styles.emptyText}>
                {isGroup ? t('staffChatEmptyGroupFirst') : t('staffChatEmptyDirectFirst')}
              </Text>
            </View>
          </View>
        ) : null}
        </View>
        {typingNames.length > 0 ? (
          <TypingBubble
            names={typingNames}
            singleLabel={
              typingNames.length === 1 ? t('staffChatTypingOne', { name: typingNames[0] }) : undefined
            }
          />
        ) : null}
        <ChatVideoBatchBar states={videoUploads} />
        {replyTarget && !selectionMode ? (
          <ReplyPreviewBar message={replyTarget} onClear={() => setReplyTarget(null)} />
        ) : null}
        {!selectionMode ? (
          <AttachmentSheet
            visible={attachSheetVisible}
            onPick={(action) => {
              setAttachSheetVisible(false);
              handleAttachmentPick(action);
            }}
          />
        ) : null}
        {!selectionMode && mentionEnabled ? (
          <View style={[styles.inputRow, { paddingBottom: chatInputBottomPad }]}>
            <TouchableOpacity
              style={styles.mediaBtn}
              onPress={toggleAttachTray}
              activeOpacity={0.7}
              disabled={voiceRecorder.phase !== 'idle'}
            >
              <AttachmentToggleIcon open={attachSheetVisible} />
            </TouchableOpacity>
            <View style={[styles.input, voiceRecorder.phase !== 'idle' && styles.inputVoice]}>
              {voiceRecorder.phase !== 'idle' ? (
                <ChatVoiceInputPreview
                  phase={voiceRecorder.phase}
                  durationSec={voiceRecorder.durationSec}
                  onCancel={() => void voiceRecorder.cancel()}
                />
              ) : (
                <ChatMentionComposer
                  style={styles.mentionInput}
                  placeholder={t('chatMentionInputPlaceholder')}
                  placeholderTextColor={chatTheme.textMuted}
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
                  enabled
                  multiline
                  maxLength={2000}
                  onSubmitEditing={send}
                />
              )}
            </View>
            <ChatInputTrailingActions
              hasText={Boolean(input.trim())}
              voicePhase={voiceRecorder.phase}
              onSendText={send}
              onSendVoice={() => void voiceRecorder.send()}
              onMicPress={() => void voiceRecorder.toggleMic()}
            />
          </View>
        ) : !selectionMode ? (
          <ChatInputBar
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
            onSend={send}
            onAttach={toggleAttachTray}
            attachOpen={attachSheetVisible}
            voice={{
              phase: voiceRecorder.phase,
              durationSec: voiceRecorder.durationSec,
              onMicPress: () => void voiceRecorder.toggleMic(),
              onSendVoice: () => void voiceRecorder.send(),
              onCancelVoice: () => void voiceRecorder.cancel(),
            }}
            bottomPadding={chatInputBottomPad}
          />
        ) : null}
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

      <BubbleColorPickerModal
        visible={showBubbleColorModal}
        onClose={() => setShowBubbleColorModal(false)}
        selectedColor={myBubbleColor}
        onSelectColor={(c) => void setMyBubbleColor(c)}
        title={t('chatYourBubbleColorTitle')}
        accentColor={theme.colors.primary}
        surfaceColor={theme.colors.surface}
        textColor={theme.colors.text}
      />

      <MessageActionSheet
        visible={Boolean(actionMessage)}
        onClose={() => setActionMessage(null)}
        canDeleteForEveryone={Boolean(
          actionMessage && actionMessage.sender_id === staff?.id && !isTempMessageId(actionMessage.id)
        )}
        showMessageInfo={Boolean(
          actionMessage &&
            actionMessage.sender_id === staff?.id &&
            !isTempMessageId(actionMessage.id)
        )}
        onAction={handleMessageAction}
      />
      <MessageReadersModal
        visible={Boolean(readInfoMessageId)}
        onClose={() => setReadInfoMessageId(null)}
        loading={loadingReadInfo}
        readers={readInfoRows}
        isGroup={isGroup}
      />
      <ChatFullscreenImageModal uri={fullscreenImageUri} onClose={() => setFullscreenImageUri(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: chatTheme.background,
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
  selectionHeaderTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    maxWidth: 220,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
    gap: 4,
  },
  headerIconTouch: {
    padding: 8,
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconDisabled: {
    opacity: 0.35,
  },
  messageList: {
    flex: 1,
  },
  listContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  loadOlder: {
    paddingVertical: 12,
    alignItems: 'center',
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
  readIconSeen: {
    textShadowColor: '#60a5fa',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 0 },
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
  messageListHost: {
    flex: 1,
    position: 'relative',
  },
  emptyStateOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingBottom: 72,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 24,
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: chatTheme.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: chatTheme.border,
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: chatTheme.background,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 96,
    color: chatTheme.text,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chatTheme.border,
    justifyContent: 'center',
  },
  inputVoice: {
    maxHeight: 56,
    paddingVertical: 4,
  },
  mentionInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 96,
    color: chatTheme.text,
    padding: 0,
    margin: 0,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: chatTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
