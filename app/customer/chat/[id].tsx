import { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
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
  Modal,
  useWindowDimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { syncGuestMessagingAppToken } from '@/lib/getOrCreateGuestForCaller';
import { markGuestConversationListDirty } from '@/lib/guestConversationListCache';
import {
  guestGetMessages,
  guestSendMessage,
  formatChatMessageSendError,
  guestMarkConversationRead,
  guestListConversations,
  guestGetConversationHeader,
  guestDeleteMessage,
  guestEditMessage,
  guestListMentionParticipants,
  subscribeToMessages,
  subscribeToTypingPresence,
  uploadVoiceMessageForGuest,
} from '@/lib/messagingApi';
import {
  replaceChatMessage,
  upsertIncomingChatMessage,
  mergeChatMessagesCapped,
  latestMessageCreatedAtIso,
  capChatMessageList,
  MESSAGING_COLORS,
  type Message,
} from '@/lib/messaging';
import { scrollChatListToEnd, type ChatListRef } from '@/lib/chatListScroll';
import { CHAT_FLASH_LIST_PROPS, useChatHeavyMediaReady } from '@/lib/chatListPerf';
import * as ImagePicker from 'expo-image-picker';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { supabase } from '@/lib/supabase';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { parseVoiceDuration, resolveVoiceMediaUrl } from '@/lib/voiceMessageMeta';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getChatInputBottomPadding, getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import { useMessagingBubbleStore, getContrastTextColor, BUBBLE_OTHER_DIRECT } from '@/stores/messagingBubbleStore';
import { BubbleColorPickerModal } from '@/components/chat/BubbleColorPickerModal';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
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
import { formatChatMessageTime } from '@/lib/formatChatTime';
import { useChatScreenshotContext } from '@/lib/chatScreenshot';
import { ChatScreenshotNotice } from '@/components/ChatScreenshotNotice';
import { ChatMentionComposer } from '@/components/ChatMentionComposer';
import { ChatMessageEditBar } from '@/components/chat/ChatMessageEditBar';
import { isChatMessageEditable } from '@/lib/chatMessageEdit';
import { ChatMentionText } from '@/components/ChatMentionText';
import {
  notifyChatMessageWithMentions,
  notifyChatMediaPush,
  syncMentionsWithText,
  parseMessageMentions,
  type ChatMention,
  type ChatMentionParticipant,
} from '@/lib/chatMentions';
import { usePendingMuxVideoPoll } from '@/lib/usePendingMuxVideoPoll';
import { ChatVoiceInputPreview } from '@/components/chat/ChatVoiceInputPreview';
import { ChatInputTrailingActions } from '@/components/chat/ChatInputTrailingActions';
import {
  AttachmentSheet,
  AttachmentToggleIcon,
  type AttachmentAction,
} from '@/components/chat/AttachmentSheet';
import { customerChatHeaderBackOptions } from '@/components/chat/CustomerChatHeaderBack';
import { useChatVoiceRecording } from '@/hooks/chat/useChatVoiceRecording';
import { useChatVoiceQueueSync } from '@/hooks/chat/useChatVoiceQueueSync';
import { sendGuestVoiceMessage } from '@/lib/chatVoiceSend';
import { createOptimisticVoiceMessage } from '@/lib/chatOptimisticMessage';

const CUSTOMER_CHAT_CACHE_PREFIX = 'customer_chat_cache_v1:';
type CustomerChatCacheEntry = {
  messages: Message[];
  headerName: string;
  headerAvatar: string | null;
  updatedAt: number;
};
const customerChatMemoryCache: Record<string, CustomerChatCacheEntry> = {};

const MessageBubble = memo(function MessageBubble({
  msg,
  isOwn,
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
  onImagePress?: (uri: string) => void;
  onDelete?: (msg: Message) => void;
  onToggleSelect?: (msg: Message) => void;
  selected?: boolean;
  selectionMode?: boolean;
  bubbleColor: string;
  videoUpload?: ChatVideoUploadState;
  videoUploads?: Record<string, ChatVideoUploadState>;
  onVideoRetry?: () => void;
  onVideoRetryForMessage?: (msg: Message) => void;
  imageAlbum?: Message[];
  videoAlbum?: Message[];
  mediaPreloadReady?: boolean;
}) {
  const { t } = useTranslation();
  const guestLabel = t('chatMessageSenderGuest');
  const voiceUri = msg.message_type === 'voice' ? resolveVoiceMediaUrl(msg.media_url, msg.content) : null;
  const isVoice = msg.message_type === 'voice' && !!voiceUri;
  const isVideo = msg.message_type === 'video';
  const isImage = msg.message_type === 'image' && (msg.media_url || msg.media_thumbnail);
  const isMediaCard = isVideo || !!imageAlbum?.length || !!videoAlbum?.length || isImage;
  const imageUri = msg.media_url || msg.media_thumbnail || '';
  const textColor = getContrastTextColor(bubbleColor);
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
      {!isOwn && (msg.sender_name?.trim() || guestLabel) ? (
        <Text style={styles.senderName}>{msg.sender_name?.trim() || guestLabel}</Text>
      ) : null}
      <View
        style={[
          styles.bubble,
          isOwn ? styles.bubbleOwn : styles.bubbleOther,
          isMediaCard && styles.bubbleVideo,
          isVoice && styles.bubbleVoice,
          !isMediaCard && !isVoice && { backgroundColor: bubbleColor },
        ]}
      >
        {msg.message_type === 'text' ? (
          <>
            <ChatMentionText
              content={msg.content || ''}
              mentions={parseMessageMentions(msg.mentions)}
              style={[styles.bubbleText, { color: textColor }]}
              mentionStyle={{ color: isOwn ? '#fff' : MESSAGING_COLORS.primary, fontWeight: '700' }}
            />
            <MessageTranslation content={msg.content || ''} enabled={!isOwn} textColor={textColor} />
          </>
        ) : msg.message_type === 'voice' && voiceUri ? (
          <VoiceMessagePlayer
            messageId={msg.id}
            uri={voiceUri}
            isOwn={isOwn}
            durationSec={parseVoiceDuration(msg.content)}
            uploading={isOwn && String(msg.id).startsWith('temp-')}
          />
        ) : videoAlbum && videoAlbum.length > 1 ? (
          <ChatVideoAlbum
            messages={videoAlbum}
            isOwn={isOwn}
            videoUploads={videoUploads}
            onRetryVideo={(m) => onVideoRetryForMessage?.(m)}
            deferLocalVideo={!mediaPreloadReady}
          />
        ) : isVideo ? (
          <View style={styles.chatVideoWrap}>
            <ChatVideoMessage
              mediaUrl={msg.media_url}
              mediaThumbnail={msg.media_thumbnail}
              isOwn={isOwn}
              uploadProgress={
                videoUpload?.progress ??
                videoUploads?.[msg.id]?.progress ??
                Object.values(videoUploads ?? {}).find((s) => s.messageId === msg.id)?.progress
              }
              uploadPhase={
                videoUpload?.phase ??
                videoUploads?.[msg.id]?.phase ??
                Object.values(videoUploads ?? {}).find((s) => s.messageId === msg.id)?.phase
              }
              uploadFailed={
                (videoUpload?.phase ?? videoUploads?.[msg.id]?.phase) === 'failed' ||
                Object.values(videoUploads ?? {}).find((s) => s.messageId === msg.id)?.phase === 'failed'
              }
              onRetry={onVideoRetry}
              preloadEnabled={mediaPreloadReady}
            />
          </View>
        ) : imageAlbum && imageAlbum.length > 1 ? (
          <ChatImageAlbum messages={imageAlbum} onPressImage={(uri) => onImagePress?.(uri)} />
        ) : isImage && imageUri ? (
          <ChatImageMessage uri={imageUri} onPress={onImagePress} />
        ) : (
          <Text style={[styles.bubbleText, { color: textColor }]}>
            [{msg.message_type}] {msg.content || msg.media_url || '—'}
          </Text>
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4, gap: 4 }}>
          {msg.is_edited ? (
            <Text style={[styles.bubbleTime, { fontStyle: 'italic', fontSize: 10, opacity: 0.85 }]}>
              {t('chatMessageEdited')}
            </Text>
          ) : null}
          <Text
            style={[
              styles.bubbleTime,
              isMediaCard && styles.bubbleTimeVideo,
              !isMediaCard && { color: textColor, opacity: 0.9 },
            ]}
          >
            {formatChatMessageTime(msg.created_at)}
            {isOwn && (msg.is_read ? ' ✓✓' : ' ✓')}
          </Text>
        </View>
      </View>
    </Pressable>
  );
});

function routeParamFirst(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim().length > 0 ? s.trim() : undefined;
}

export default function CustomerChatScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[] }>();
  const conversationId = routeParamFirst(params.id);
  const conversationName = routeParamFirst(params.name);
  const navigation = useNavigation();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { appToken, setUnreadCount } = useGuestMessagingStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [pendingMentions, setPendingMentions] = useState<ChatMention[]>([]);
  const [mentionParticipants, setMentionParticipants] = useState<ChatMentionParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const videoUploads = useChatVideoUploadStates(conversationId);
  const [tokenTried, setTokenTried] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [showBubbleColorModal, setShowBubbleColorModal] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const insets = useSafeAreaInsets();
  const [headerName, setHeaderName] = useState<string>(conversationName || t('chatConversationFallback'));
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(null);
  const [conversationType, setConversationType] = useState<string>('direct');
  const [guestDisplayName, setGuestDisplayName] = useState(() => t('guestDefaultName'));
  const listRef = useRef<ChatListRef>(null);
  const sendInFlightRef = useRef(false);
  const subscriptionRef = useRef<ReturnType<typeof subscribeToMessages> | null>(null);
  const typingPresenceRef = useRef<ReturnType<typeof subscribeToTypingPresence> | null>(null);
  const lastRealtimeAtRef = useRef<number>(0);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  useEffect(() => () => markGuestConversationListDirty(), []);

  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { myBubbleColor, setMyBubbleColor, loadStored: loadBubbleStore } = useMessagingBubbleStore();
  const chatHasVideosEarly = useMemo(
    () => messages.some((m) => m.message_type === 'video'),
    [messages]
  );
  const heavyMediaReady = useChatHeavyMediaReady(conversationId, loading && messages.length === 0, {
    hasVideos: chatHasVideosEarly,
  });

  useEffect(() => {
    setEditTarget(null);
    // Sohbet değişince listeyi koşulsuz boşaltma; bellek cache'i varsa anında göster
    // (boş ekran flaşını ve "veri kayboldu sonra geldi" hissini önler).
    const memory = conversationId ? customerChatMemoryCache[conversationId] : undefined;
    if (memory?.messages?.length) {
      setMessages(memory.messages);
      setLoading(false);
    } else {
      setMessages([]);
      setLoading(true);
    }
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    let cancelled = false;
    const memory = customerChatMemoryCache[conversationId];
    if (memory?.messages?.length) {
      setMessages(memory.messages);
      if (memory.headerName) setHeaderName(memory.headerName);
      setHeaderAvatar(memory.headerAvatar ?? null);
      setLoading(false);
    }
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${CUSTOMER_CHAT_CACHE_PREFIX}${conversationId}`);
        if (!raw || cancelled) return;
        const parsed = JSON.parse(raw) as CustomerChatCacheEntry;
        if (Array.isArray(parsed?.messages) && parsed.messages.length > 0) {
          setMessages(parsed.messages);
          if (parsed.headerName) setHeaderName(parsed.headerName);
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
    if (messages.length === 0 && !headerAvatar && !headerName) return;
    const entry: CustomerChatCacheEntry = {
      messages: capChatMessageList(messages),
      headerName,
      headerAvatar: headerAvatar ?? null,
      updatedAt: Date.now(),
    };
    customerChatMemoryCache[conversationId] = entry;
    void AsyncStorage.setItem(`${CUSTOMER_CHAT_CACHE_PREFIX}${conversationId}`, JSON.stringify(entry)).catch(() => {});
  }, [conversationId, messages, headerName, headerAvatar]);

  useEffect(() => {
    loadBubbleStore();
  }, []);

  useEffect(() => {
    setHeaderName(conversationName || t('chatConversationFallback'));
    setHeaderAvatar(null);
  }, [conversationId, conversationName, t]);

  useEffect(() => {
    if (!conversationId) return;
    return registerChatVideoScreen(conversationId, { patchMessages: setMessages });
  }, [conversationId]);

  usePendingMuxVideoPoll(messages, setMessages, {
    enabled: Boolean(conversationId && appToken && !loading),
    guestAppToken: appToken,
  });

  useEffect(() => {
    const headerTitleMaxWidth = Math.max(120, Math.min(280, winWidth - 120));
    navigation.setOptions({
      ...customerChatHeaderBackOptions,
      headerTitleAlign: 'left',
      headerTitle: () => (
        <View style={[styles.headerTitleRow, { maxWidth: headerTitleMaxWidth }]}>
          {headerAvatar ? (
            <CachedImage uri={headerAvatar} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarInitial}>{(headerName || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.headerTitleText} numberOfLines={1}>{headerName}</Text>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
          {selectionMode ? (
            <>
              <TouchableOpacity
                onPress={() => {
                  const ownIds = messages
                    .filter((m) => m.sender_type === 'guest' && !m.is_deleted)
                    .map((m) => m.id);
                  setSelectedMessageIds((prev) => (prev.length === ownIds.length ? [] : ownIds));
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ marginRight: 10 }}
              >
                <Ionicons
                  name={selectedMessageIds.length > 0 ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={MESSAGING_COLORS.primary}
                />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setSelectionMode(false);
                  setSelectedMessageIds([]);
                }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={24} color={MESSAGING_COLORS.textSecondary} />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => setShowBubbleColorModal(true)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ marginRight: 10 }}
              >
                <Ionicons name="color-palette-outline" size={24} color={MESSAGING_COLORS.primary} />
              </TouchableOpacity>
              <Text style={styles.headerOnline} numberOfLines={1}>
                {t('chatHeaderOnline')}
              </Text>
            </>
          )}
        </View>
      ),
    });
  }, [navigation, headerName, headerAvatar, t, i18n.language, winWidth, selectionMode, selectedMessageIds.length, messages]);

  useEffect(() => {
    if (!conversationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const token = await syncGuestMessagingAppToken();
      if (cancelled) return;
      setTokenTried(true);
      if (!token) {
        setLoading(false);
        return;
      }
      await guestMarkConversationRead(token, conversationId);
      const seedFromMemory = customerChatMemoryCache[conversationId]?.messages ?? [];
      const afterIso = latestMessageCreatedAtIso(seedFromMemory);
      const useIncremental = Boolean(afterIso && seedFromMemory.length > 0);

      const listPromise =
        useIncremental && afterIso
          ? guestGetMessages(token, conversationId, 120, undefined, afterIso)
          : guestGetMessages(token, conversationId, 50);

      const [list, header, convos, identityRes] = await Promise.all([
        listPromise,
        guestGetConversationHeader(token, conversationId),
        guestListConversations(token),
        supabase.rpc('get_guest_messaging_identity', { p_app_token: token }),
      ]);
      setMessages((prev) => {
        const base = prev.length > 0 ? prev : customerChatMemoryCache[conversationId]?.messages ?? [];
        return mergeChatMessagesCapped(list, base);
      });
      setHeaderName(header.name);
      setHeaderAvatar(header.avatar);
      const convMeta = convos.find((c) => c.id === conversationId);
      setConversationType(convMeta?.type ?? 'direct');
      const identityRow = Array.isArray(identityRes.data) ? identityRes.data[0] : identityRes.data;
      const identityName = (identityRow as { full_name?: string | null } | null)?.full_name?.trim();
      if (identityName) setGuestDisplayName(identityName);
      setLoading(false);
      const total = convos.reduce((s, c) => s + (c.unread_count ?? 0), 0);
      setUnreadCount(total);
    })();
    return () => {
      cancelled = true;
    };
  }, [conversationId, setUnreadCount]);


  const prefetchKeyRef = useRef('');
  useEffect(() => {
    if (messages.length === 0) return;
    const incoming = messages
      .filter((m) => m.message_type === 'text' && m.sender_type !== 'guest' && (m.content ?? '').trim())
      .map((m) => (m.content ?? '').trim())
      .slice(-8);
    const key = incoming.join('\u0001');
    if (key === prefetchKeyRef.current) return;
    prefetchKeyRef.current = key;
    prefetchTranslations(incoming);
  }, [messages]);

  // Realtime: yeni mesaj geldiğinde anında listeyi güncelle; optimistik temp mesajları gerçekle değiştir
  useEffect(() => {
    if (!conversationId) return;
    subscriptionRef.current = subscribeToMessages(
      conversationId,
      (newMsg) => {
        lastRealtimeAtRef.current = Date.now();
        setMessages((prev) => upsertIncomingChatMessage(prev, newMsg, { ownSenderType: 'guest' }));
        if (newMsg.message_type === 'text' && newMsg.sender_type !== 'guest' && (newMsg.content ?? '').trim()) {
          prefetchTranslations([(newMsg.content ?? '').trim()]);
        }
        setTimeout(() => scrollChatListToEnd(listRef, true), 150);
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
    return () => {
      subscriptionRef.current?.unsubscribe?.();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!selectionMode) return;
    const ownIds = new Set(messages.filter((m) => m.sender_type === 'guest' && !m.is_deleted).map((m) => m.id));
    setSelectedMessageIds((prev) => prev.filter((id) => ownIds.has(id)));
  }, [messages, selectionMode]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Yazıyor göstergesi: presence ile karşı tarafın yazıp yazmadığını dinle; kendi yazarken track et
  useEffect(() => {
    if (!appToken || !conversationId) return;
    // Misafir: presence track limiti (ClientPresenceRateLimitReached) — sadece dinle, yazarken track yok
    typingPresenceRef.current = subscribeToTypingPresence(
      conversationId,
      { displayName: t('guestDefaultName'), userId: appToken },
      setTypingNames,
      { enabled: false }
    );
    return () => {
      typingPresenceRef.current?.unsubscribe?.();
      typingPresenceRef.current = null;
    };
  }, [appToken, conversationId, t]);

  // Realtime kaçırsa diye seyrek, hafif artımlı yedek (tüm listeyi çekmez)
  useEffect(() => {
    if (!appToken || !conversationId || loading) return;
    const id = setInterval(async () => {
      const after = latestMessageCreatedAtIso(messagesRef.current);
      if (!after) return;
      const list = await guestGetMessages(appToken, conversationId, 80, undefined, after);
      if (list.length === 0) return;
      setMessages((prev) => mergeChatMessagesCapped(list, prev));
    }, 60_000);
    return () => clearInterval(id);
  }, [appToken, conversationId, loading]);

  // Tüm hook'lar erken return'lerden önce çağrılmalı (Rules of Hooks)
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );
  const chatListItems = useMemo(() => buildChatListDisplayItems(sortedMessages), [sortedMessages]);
  useChatVoiceQueueSync(sortedMessages, chatListItems, listRef);
  const isGroup = conversationType === 'group';
  const screenshotPushBody = useMemo(
    () => t('chatScreenshotNotice', { name: guestDisplayName }),
    [t, guestDisplayName]
  );

  useEffect(() => {
    if (!conversationId || !appToken) {
      setMentionParticipants([]);
      return;
    }
    let cancelled = false;
    void guestListMentionParticipants(appToken, conversationId).then((list) => {
      if (!cancelled) setMentionParticipants(list);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId, appToken]);

  const mentionEnabled = mentionParticipants.length > 0;

  const screenshotChatContext = useMemo(() => {
    if (!appToken || !conversationId) return null;
    return {
      conversationId,
      conversationName: headerName,
      isGroup,
      chatUrl: `/customer/chat/${conversationId}`,
      actor: { kind: 'guest' as const, appToken, senderName: guestDisplayName },
      pushBody: screenshotPushBody,
      onLocalMessage: (msg: Message) => {
        setMessages((prev) => upsertIncomingChatMessage(prev, msg, { ownSenderType: 'guest' }));
        setTimeout(() => scrollChatListToEnd(listRef, true), 100);
      },
      reloadStaffMessages: () => guestGetMessages(appToken, conversationId, 50),
    };
  }, [appToken, conversationId, headerName, isGroup, guestDisplayName, screenshotPushBody]);

  useChatScreenshotContext(Boolean(appToken && conversationId && !loading), screenshotChatContext);

  const beginMessageEdit = (msg: Message) => {
    if (!isChatMessageEditable(msg, { ownSenderType: 'guest' })) return;
    setEditTarget(msg);
    setInput(msg.content ?? '');
    setPendingMentions(parseMessageMentions(msg.mentions));
  };

  const cancelMessageEdit = () => {
    setEditTarget(null);
    setInput('');
    setPendingMentions([]);
  };

  const saveMessageEdit = async (text: string) => {
    const msg = editTarget;
    if (!msg) return;
    const token =
      (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
    if (!token) return;
    const mentions = syncMentionsWithText(text, pendingMentions);
    const trimmed = text.trim();
    if (!trimmed) {
      Alert.alert(t('error'), t('chatMessageEditEmpty'));
      return;
    }
    const previous = msg;
    setEditTarget(null);
    setInput('');
    setPendingMentions([]);
    const optimistic: Message = {
      ...msg,
      content: trimmed,
      mentions: mentions.length ? mentions : [],
      is_edited: true,
      edited_at: new Date().toISOString(),
    };
    setMessages((prev) => replaceChatMessage(prev, optimistic));
    const { ok, error } = await guestEditMessage(token, msg.id, trimmed, mentions);
    if (!ok) {
      setMessages((prev) => replaceChatMessage(prev, previous));
      Alert.alert(t('error'), error ?? t('chatMessageEditFailed'));
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || !conversationId || sendInFlightRef.current) return;
    if (editTarget) {
      await saveMessageEdit(text);
      return;
    }
    const token =
      (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
    if (!token) {
      Alert.alert(t('chatMessageBlockedTitle'), t('authRegisterRequiredMessage'));
      return;
    }
    const mentions = syncMentionsWithText(text, pendingMentions);
    sendInFlightRef.current = true;
    setInput('');
    setPendingMentions([]);
    typingPresenceRef.current?.updateTyping(false);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: '',
      sender_type: 'guest',
      sender_name: null,
      sender_avatar: null,
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
    setTimeout(() => scrollChatListToEnd(listRef, true), 50);
    try {
    const { messageId, conversationId: nextConversationId, error: sendError } = await guestSendMessage(
      token,
      conversationId,
      text,
      'text',
      null,
      null,
      undefined,
      mentions.length ? mentions : undefined
    );
    if (messageId) {
      const convId = nextConversationId ?? conversationId;
      const confirmed: Message = {
        ...optimistic,
        id: messageId,
        conversation_id: convId,
        is_delivered: true,
        mentions: mentions.length ? mentions : [],
      };
      setMessages((prev) => upsertIncomingChatMessage(prev, confirmed, { ownSenderType: 'guest' }));
      const { notifyAdmins } = await import('@/lib/notificationService');
      notifyAdmins({
        title: t('chatNotifyAdminNewGuest'),
        body: text.slice(0, 60) + (text.length > 60 ? '…' : ''),
        data: { url: '/admin/messages' },
        conversationId: convId,
      }).catch(() => {});
      void notifyChatMessageWithMentions({
        conversationId: convId,
        conversationTitle: headerName || t('notifNewMessage'),
        messageText: text,
        mentions,
        senderDisplayName: guestDisplayName,
        isGroup,
        excludeAppToken: token,
        chatUrl: `/customer/chat/${convId}`,
      });
      if (nextConversationId && nextConversationId !== conversationId) {
        router.replace({ pathname: '/customer/chat/[id]', params: { id: nextConversationId, name: headerName } });
        return;
      }
      setTimeout(() => scrollChatListToEnd(listRef, true), 100);
    } else {
      setInput(text);
      setPendingMentions(mentions);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert(
        t('messageSendFailedTitle'),
        formatChatMessageSendError(sendError ?? t('unknownError'), t('unknownError'))
      );
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

  const notifyGuestPhotos = async (token: string, convId: string) => {
    const { notifyAdmins } = await import('@/lib/notificationService');
    notifyAdmins({
      title: t('chatNotifyAdminNewGuest'),
      body: t('staffChatPhotoSentBody'),
      data: { url: '/admin/messages' },
      conversationId: convId,
    }).catch(() => {});
    void notifyChatMediaPush({
      conversationId: convId,
      conversationTitle: headerName,
      senderDisplayName: guestDisplayName,
      isGroup,
      kind: 'photo',
      excludeAppToken: token,
      chatUrl: `/customer/chat/${convId}`,
    });
  };

  const sendImagesFromLibrary = async () => {
    if (!conversationId || sending) return;
    const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
    if (!token) return;
    const uris = await pickChatImagesFromLibrary();
    if (!uris.length) return;
    setSending(true);
    try {
      const { conversationId: convId, failed } = await sendChatImageUris(
        { kind: 'guest', appToken: token, conversationId },
        uris,
        t('photo')
      );
      await notifyGuestPhotos(token, convId);
      const list = await guestGetMessages(token, convId, 50);
      setMessages(list);
      setTimeout(() => scrollChatListToEnd(listRef, true), 100);
      if (failed > 0) Alert.alert(t('error'), t('chatMediaPartialFail', { count: failed }));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
    }
  };

  const sendImageFromCamera = async () => {
    if (!conversationId || sending) return;
    const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
    if (!token) return;
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
      const { conversationId: convId, failed } = await sendChatImageUris(
        { kind: 'guest', appToken: token, conversationId },
        [uri],
        t('photo')
      );
      if (!failed) await notifyGuestPhotos(token, convId);
      const list = await guestGetMessages(token, convId, 50);
      setMessages(list);
      setTimeout(() => scrollChatListToEnd(listRef, true), 100);
      if (failed) Alert.alert(t('error'), t('imageSendFailed'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
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
    if (!conversationId || videoBatchActive) return;
    const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
    if (!token) return;
    const actor = { kind: 'guest' as const, appToken: token, conversationId };
    const handlers = createSessionChatVideoHandlers(conversationId, actor, {
      setMessages,
      onBatchComplete: ({ failed, lastError }) => {
        if (failed > 0) {
          Alert.alert(t('error'), lastError?.trim() || t('chatMediaPartialFail', { count: failed }));
        }
      },
    });
    try {
      await sendChatVideoFromPickerWithSession(actor, source, handlers);
      setTimeout(() => scrollChatListToEnd(listRef, true), 80);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('chatVideoSendFailed'));
    }
  };

  const retryVideoUpload = (upload: ChatVideoUploadState) => {
    if (!conversationId) return;
    void (async () => {
      const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
      if (!token) return;
      void retryChatVideoUploadWithSession({ kind: 'guest', appToken: token, conversationId }, upload, {
        setMessages,
      });
    })();
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
      if (!conversationId) return;
      const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
      if (!token) throw new Error(t('loginRequiredChatMessage'));

      const tempId = `temp-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setMessages((prev) => [
        ...prev,
        createOptimisticVoiceMessage({
          tempId,
          conversationId,
          senderId: '',
          senderType: 'guest',
          senderName: guestDisplayName,
          senderAvatar: null,
          localUri,
          durationSec,
        }),
      ]);
      setTimeout(() => scrollChatListToEnd(listRef, true), 50);

      const { message, error, conversationId: convId } = await sendGuestVoiceMessage(
        { kind: 'guest', appToken: token, conversationId },
        localUri,
        conversationId,
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
          { ownSenderType: 'guest', replaceTempId: tempId }
        )
      );
      void import('@/lib/notificationService').then(({ notifyAdmins }) => {
        notifyAdmins({
          title: t('chatNotifyAdminNewGuest'),
          body: t('staffChatVoiceSentBody'),
          data: { url: '/admin/messages' },
          conversationId: convId,
        }).catch(() => {});
        void notifyChatMediaPush({
          conversationId: convId,
          conversationTitle: headerName,
          senderDisplayName: guestDisplayName,
          isGroup,
          kind: 'voice',
          excludeAppToken: token,
          chatUrl: `/customer/chat/${convId}`,
        });
      });
      if (convId !== conversationId) {
        router.replace({ pathname: '/customer/chat/[id]', params: { id: convId, name: headerName } });
        return;
      }
      setTimeout(() => scrollChatListToEnd(listRef, true), 100);
    },
    [conversationId, guestDisplayName, headerName, router, t]
  );

  const preUploadVoice = useCallback(
    async (uri: string) => {
      const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
      if (!token || !conversationId) throw new Error(t('loginRequiredChatMessage'));
      return uploadVoiceMessageForGuest(token, conversationId, uri);
    },
    [conversationId, t]
  );

  const voiceRecorder = useChatVoiceRecording({
    onSend: sendVoiceMessage,
    preUpload: preUploadVoice,
    preUploadKey: conversationId,
    disabled: sending || selectionMode,
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

  const deleteSelectedMessages = async (ids: string[]) => {
    const token = (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
    if (!token || ids.length === 0) return;
    const results = await Promise.all(ids.map((id) => guestDeleteMessage(token, id)));
    const successIds = ids.filter((_, idx) => results[idx] === true);
    const failed = ids.length - successIds.length;
    if (successIds.length) {
      setMessages((prev) => prev.filter((m) => !successIds.includes(m.id)));
    }
    if (failed > 0) Alert.alert(t('error'), t('chatBulkDeleteFailed', { count: failed }));
  };

  const confirmDeleteSelected = () => {
    if (selectedMessageIds.length === 0) return;
    Alert.alert(
      t('chatBulkDeleteTitle'),
      t('chatBulkDeleteMessage', { count: selectedMessageIds.length }),
      [
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

  const toggleSelectedMessage = useCallback((msg: Message) => {
    if (msg.sender_type !== 'guest') return;
    setSelectedMessageIds((prev) =>
      prev.includes(msg.id) ? prev.filter((id) => id !== msg.id) : [...prev, msg.id]
    );
  }, []);

  const handleDeleteMessage = useCallback(
    (msg: Message) => {
      if (msg.sender_type !== 'guest') return;
      if (selectionMode) {
        toggleSelectedMessage(msg);
        return;
      }
      const editable = isChatMessageEditable(msg, { ownSenderType: 'guest' });
      Alert.alert(t('chatMessageActionTitle'), undefined, [
        ...(editable
          ? [{ text: t('chatMessageActionEdit'), onPress: () => beginMessageEdit(msg) }]
          : []),
        {
          text: t('chatMultiSelect'),
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
            const token =
              (await syncGuestMessagingAppToken()) ?? useGuestMessagingStore.getState().appToken;
            if (!token) return;
            const ok = await guestDeleteMessage(token, msg.id);
            if (!ok) {
              Alert.alert(t('error'), t('messageDeleteFailed'));
              return;
            }
            setMessages((prev) => prev.filter((m) => m.id !== msg.id));
          },
        },
      ]);
    },
    [selectionMode, t, toggleSelectedMessage]
  );

  const renderChatItem = useCallback(
    ({ item }: { item: (typeof chatListItems)[number] }) => {
      const msg = item.kind === 'message' ? item.message : item.messages[item.messages.length - 1];
      if (msg.message_type === 'screenshot_notice') {
        return <ChatScreenshotNotice message={msg} />;
      }
      const isOwn = msg.sender_type === 'guest';
      const bubbleColor = isOwn ? myBubbleColor : BUBBLE_OTHER_DIRECT;
      const resolveVideoUpload = (m: Message) =>
        videoUploads[m.id] ?? Object.values(videoUploads).find((s) => s.messageId === m.id);
      const upload = resolveVideoUpload(msg);
      return (
        <MessageBubble
          msg={msg}
          isOwn={isOwn}
          imageAlbum={item.kind === 'image_album' ? item.messages : undefined}
          videoAlbum={item.kind === 'video_album' ? item.messages : undefined}
          videoUploads={videoUploads}
          onImagePress={setFullscreenImageUri}
          onDelete={handleDeleteMessage}
          onToggleSelect={toggleSelectedMessage}
          selected={selectedMessageIds.includes(msg.id)}
          selectionMode={selectionMode}
          bubbleColor={bubbleColor}
          videoUpload={upload}
          onVideoRetry={
            upload?.phase === 'failed' ? () => void retryVideoUpload(upload) : undefined
          }
          onVideoRetryForMessage={(m) => {
            const st = resolveVideoUpload(m);
            if (st?.phase === 'failed') void retryVideoUpload(st);
          }}
          mediaPreloadReady={heavyMediaReady}
        />
      );
    },
    [
      myBubbleColor,
      videoUploads,
      selectedMessageIds,
      selectionMode,
      heavyMediaReady,
      handleDeleteMessage,
      toggleSelectedMessage,
    ]
  );

  if (!appToken) {
    return (
      <View style={styles.centered}>
        <Text style={styles.placeholder}>
          {tokenTried ? t('loginRequiredChatMessage') : t('loading')}
        </Text>
      </View>
    );
  }

  if (loading && messages.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  const kbHeight = typeof keyboardHeight === 'number' ? keyboardHeight : 0;
  const inputRowExtra = Platform.OS === 'android' ? -20 : 56;
  const bottomInset = getEffectiveBottomInset(insets);
  const chatInputBottomPad = getChatInputBottomPadding(insets);
  const androidKbPadding =
    Platform.OS === 'android' && kbHeight > 0 ? kbHeight + inputRowExtra + bottomInset : 0;
  return (
    <KeyboardAvoidingView
      style={[styles.container, androidKbPadding > 0 && { paddingBottom: androidKbPadding }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.messageListHost}>
      <FlashList
        keyboardShouldPersistTaps="handled"
        ref={listRef}
        style={styles.messageList}
        data={chatListItems}
        extraData={{
          messageCount: messages.length,
          lastMessageId: messages[messages.length - 1]?.id ?? '',
          myBubbleColor,
          videoUploads,
          selectionMode,
          selectedMessageIds,
          heavyMediaReady,
        }}
        keyExtractor={(item) => (item.kind === 'message' ? item.message.id : item.key)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        drawDistance={CHAT_FLASH_LIST_PROPS.drawDistance}
        maintainVisibleContentPosition={CHAT_FLASH_LIST_PROPS.maintainVisibleContentPosition}
        renderItem={renderChatItem}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.empty}>{t('chatEmptyGuestInvite')}</Text>
          </View>
        }
      />
      </View>
      {typingNames.length > 0 ? (
        <View style={styles.typingRow}>
          {typingNames.length === 1 ? (
            <Text style={styles.typingText} numberOfLines={1}>
              {t('chatTypingSingle', { name: typingNames[0] })}
            </Text>
          ) : (
            <View style={styles.typingMultiRow}>
              {typingNames.slice(0, 4).map((name) => (
                <View key={name} style={styles.typingChip}>
                  <Text style={styles.typingChipLetter}>{name.charAt(0).toUpperCase()}</Text>
                </View>
              ))}
              <Text style={styles.typingTextSmall}> {t('chatTypingMany')}</Text>
            </View>
          )}
        </View>
      ) : null}
      <ChatVideoBatchBar states={videoUploads} />
      {selectionMode ? (
        <View style={styles.bulkBar}>
          <Text style={styles.bulkBarText}>{t('chatBulkSelected', { count: selectedMessageIds.length })}</Text>
          <TouchableOpacity
            style={[styles.bulkDeleteBtn, selectedMessageIds.length === 0 && styles.bulkDeleteBtnDisabled]}
            disabled={selectedMessageIds.length === 0}
            onPress={confirmDeleteSelected}
            activeOpacity={0.85}
          >
            <Ionicons name="trash-outline" size={16} color="#fff" />
            <Text style={styles.bulkDeleteBtnText}>{t('chatBulkDeleteBtn')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {editTarget && !selectionMode ? (
        <ChatMessageEditBar message={editTarget} onClear={cancelMessageEdit} />
      ) : null}
      <AttachmentSheet
        visible={attachSheetVisible}
        onPick={(action) => {
          setAttachSheetVisible(false);
          handleAttachmentPick(action);
        }}
      />
      <View style={[styles.inputRow, { paddingBottom: chatInputBottomPad }]}>
        <TouchableOpacity
          style={styles.mediaBtn}
          onPress={toggleAttachTray}
          disabled={sending || voiceRecorder.phase !== 'idle'}
          accessibilityLabel={t('a11yChatAttachPhoto')}
          activeOpacity={0.7}
        >
          <AttachmentToggleIcon open={attachSheetVisible} />
        </TouchableOpacity>
        <View style={[styles.input, voiceRecorder.phase !== 'idle' && styles.inputVoice]}>
          {voiceRecorder.phase !== 'idle' ? (
            <ChatVoiceInputPreview
              phase={voiceRecorder.phase}
              durationSec={voiceRecorder.durationSec}
              onCancel={() => void voiceRecorder.cancel()}
              textColor={MESSAGING_COLORS.text}
              mutedColor={MESSAGING_COLORS.textSecondary}
            />
          ) : (
            <ChatMentionComposer
              style={styles.mentionInput}
              placeholder={mentionEnabled ? t('chatMentionInputPlaceholder') : t('chatInputPlaceholder')}
              placeholderTextColor={MESSAGING_COLORS.textSecondary}
              value={input}
              onChangeText={setInput}
              participants={mentionParticipants}
              mentions={pendingMentions}
              onMentionsChange={setPendingMentions}
              enabled={mentionEnabled}
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
          sending={sending}
          iconColor={MESSAGING_COLORS.textSecondary}
          sendBtnStyle={styles.sendBtn}
          sendBtnDisabledStyle={styles.sendBtnDisabled}
        />
      </View>

      <ChatFullscreenImageModal uri={fullscreenImageUri} onClose={() => setFullscreenImageUri(null)} />

      <BubbleColorPickerModal
        visible={showBubbleColorModal}
        onClose={() => setShowBubbleColorModal(false)}
        selectedColor={myBubbleColor}
        onSelectColor={(c) => void setMyBubbleColor(c)}
        title={t('chatYourBubbleColorTitle')}
        accentColor={MESSAGING_COLORS.primary}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  messageListHost: { flex: 1 },
  messageList: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { color: MESSAGING_COLORS.textSecondary },
  emptyWrap: { paddingTop: 48, alignItems: 'center' },
  headerOnline: { fontSize: 13, color: MESSAGING_COLORS.success, fontWeight: '600', marginRight: 12 },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  headerAvatar: { width: 32, height: 32, borderRadius: 16, marginRight: 10 },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  headerAvatarInitial: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerTitleText: { fontSize: 17, fontWeight: '700', color: MESSAGING_COLORS.text, flex: 1, minWidth: 0 },
  listContent: { padding: 16, paddingBottom: 24 },
  typingRow: { paddingHorizontal: 16, paddingVertical: 4, paddingBottom: 2, minHeight: 22 },
  typingText: { fontSize: 12, color: MESSAGING_COLORS.textSecondary },
  typingMultiRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  typingChip: { width: 20, height: 20, borderRadius: 10, backgroundColor: MESSAGING_COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  typingChipLetter: { fontSize: 11, fontWeight: '700', color: '#fff' },
  typingTextSmall: { fontSize: 11, color: MESSAGING_COLORS.textSecondary },
  bubbleWrap: { marginBottom: 10 },
  bubbleWrapSelected: { opacity: 0.72 },
  bubbleWrapOwn: { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },
  senderName: { fontSize: 12, color: MESSAGING_COLORS.primary, marginBottom: 2, marginLeft: 12 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleOwn: { backgroundColor: MESSAGING_COLORS.primary },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  bubbleText: { fontSize: 15 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTextOther: { color: MESSAGING_COLORS.text },
  bubbleTime: { fontSize: 11, marginTop: 4 },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.85)' },
  bubbleTimeOther: { color: MESSAGING_COLORS.textSecondary },
  bubbleVideo: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    maxWidth: '92%',
  },
  bubbleVoice: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
  },
  bubbleTimeVideo: {
    color: MESSAGING_COLORS.textSecondary,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  chatVideoWrap: { marginBottom: 0 },
  imageWrap: { marginTop: 2, width: 200, height: 200, borderRadius: 12, overflow: 'hidden' },
  imageWrapPlaceholder: { backgroundColor: '#e5e7eb' },
  bubbleImage: { width: 200, height: 200, borderRadius: 12 },
  bubbleColorModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  bubbleColorModalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320 },
  bubbleColorModalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 20 },
  bubbleColorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  bubbleColorChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  bubbleColorChipSelected: { borderColor: MESSAGING_COLORS.primary },
  bubbleColorModalClose: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24 },
  bubbleColorModalCloseText: { fontSize: 16, color: MESSAGING_COLORS.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: MESSAGING_COLORS.textSecondary, marginTop: 24 },
  emptyInverted: { transform: [{ scaleY: -1 }] },
  bulkBar: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bulkBarText: { fontSize: 13, color: MESSAGING_COLORS.textSecondary, fontWeight: '600' },
  bulkDeleteBtn: {
    backgroundColor: '#dc2626',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bulkDeleteBtnDisabled: { opacity: 0.5 },
  bulkDeleteBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: 8,
    backgroundColor: '#F0F2F5',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    overflow: 'hidden',
  },
  inputVoice: {
    maxHeight: 56,
    paddingVertical: 4,
  },
  mentionInput: {
    flex: 1,
    fontSize: 16,
    color: MESSAGING_COLORS.text,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'transparent',
    ...Platform.select({
      android: { textAlignVertical: 'top', includeFontPadding: false },
      default: {},
    }),
  },
  mediaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
    shadowColor: MESSAGING_COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
});
