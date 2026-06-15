import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
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
  Modal,
  useWindowDimensions,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getChatInputBottomPadding, getEffectiveBottomInset } from '@/lib/effectiveSafeArea';
import { useAuthStore } from '@/stores/authStore';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  staffGetMessages,
  staffSendMessage,
  formatChatMessageSendError,
  staffMarkConversationRead,
  staffGetConversationHeader,
  staffDeleteMessage,
  staffListMentionParticipants,
  subscribeToMessages,
  subscribeToTypingPresence,
  uploadVoiceMessageForStaff,
} from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import {
  MESSAGING_COLORS,
  replaceChatMessage,
  upsertIncomingChatMessage,
  capChatMessageList,
  type Message,
} from '@/lib/messaging';
import {
  CHAT_LIST_INVERTED_CONTENT_STYLE,
  scrollChatListToLatest,
  useInvertedChatListItems,
} from '@/lib/chatListScroll';
import { CHAT_FLAT_LIST_PROPS, useChatHeavyMediaReady } from '@/lib/chatListPerf';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { parseVoiceDuration, resolveVoiceMediaUrl } from '@/lib/voiceMessageMeta';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import {
  useMessagingBubbleStore,
  getBubbleColorForSender,
  getContrastTextColor,
  BUBBLE_OTHER_DIRECT,
} from '@/stores/messagingBubbleStore';
import { BubbleColorPickerModal } from '@/components/chat/BubbleColorPickerModal';
import { useTranslation } from 'react-i18next';
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
import { useChatScreenshotContext } from '@/lib/chatScreenshot';
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
import { ChatVoiceInputPreview } from '@/components/chat/ChatVoiceInputPreview';
import { ChatInputTrailingActions } from '@/components/chat/ChatInputTrailingActions';
import { useChatVoiceRecording } from '@/hooks/chat/useChatVoiceRecording';
import { useChatVoiceQueueSync } from '@/hooks/chat/useChatVoiceQueueSync';
import { sendStaffVoiceMessage } from '@/lib/chatVoiceSend';
import { createOptimisticVoiceMessage } from '@/lib/chatOptimisticMessage';
import { ChatGroupExportHeaderButtons } from '@/components/chat/ChatGroupExportHeaderButtons';

function MessageBubble({
  msg,
  isOwn,
  isGroup,
  onImagePress,
  onDelete,
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
  const voiceUri = msg.message_type === 'voice' ? resolveVoiceMediaUrl(msg.media_url, msg.content) : null;
  const isVoice = msg.message_type === 'voice' && !!voiceUri;
  const isVideo = msg.message_type === 'video';
  const isImage = msg.message_type === 'image' && (msg.media_url || msg.media_thumbnail);
  const isMediaCard = isVideo || !!imageAlbum?.length || !!videoAlbum?.length || isImage;
  const imageUri = msg.media_url || msg.media_thumbnail || '';
  const upload =
    videoUpload ?? videoUploads?.[msg.id] ?? Object.values(videoUploads ?? {}).find((s) => s.messageId === msg.id);
  const displayName = msg.sender_name?.trim() || (msg.sender_type === 'guest' ? t('guestDefaultName') : null) || '?';
  const initial = displayName.charAt(0).toUpperCase();
  const timeStr = isGroup ? formatChatMessageDateTime(msg.created_at) : formatChatMessageTime(msg.created_at);
  const textColor = getContrastTextColor(bubbleColor);
  return (
    <Pressable
      style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}
      onLongPress={isOwn && onDelete ? () => onDelete(msg) : undefined}
      delayLongPress={400}
    >
      {!isOwn && (
        <View style={styles.otherMeta}>
          <View style={styles.avatarWrap}>
            {msg.sender_avatar ? (
              <CachedImage uri={msg.sender_avatar} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}><Text style={styles.avatarInitial}>{initial}</Text></View>
            )}
          </View>
          <View style={styles.otherContent}>
            {displayName ? <Text style={styles.senderName}>{displayName}</Text> : null}
            <View
              style={[
                styles.bubble,
                styles.bubbleOther,
                isMediaCard && styles.bubbleVideo,
                isVoice && styles.bubbleVoice,
                !isMediaCard && !isVoice && { backgroundColor: bubbleColor },
              ]}
            >
              {msg.message_type === 'text' ? (
                <ChatMentionText
                  content={msg.content || ''}
                  mentions={parseMessageMentions(msg.mentions)}
                  style={[styles.bubbleText, { color: textColor }]}
                  mentionStyle={{ color: MESSAGING_COLORS.primary, fontWeight: '700' }}
                />
              ) : msg.message_type === 'voice' && voiceUri ? (
                <VoiceMessagePlayer
                  messageId={msg.id}
                  uri={voiceUri}
                  isOwn={false}
                  durationSec={parseVoiceDuration(msg.content)}
                />
              ) : videoAlbum && videoAlbum.length > 1 ? (
                <ChatVideoAlbum
                  messages={videoAlbum}
                  videoUploads={videoUploads}
                  onRetryVideo={(m) => onVideoRetryForMessage?.(m)}
                  deferLocalVideo={!mediaPreloadReady}
                />
              ) : isVideo ? (
                <View style={styles.chatVideoWrap}>
                  <ChatVideoMessage
                    mediaUrl={msg.media_url}
                    mediaThumbnail={msg.media_thumbnail}
                    isOwn={false}
                    uploadProgress={upload?.progress}
                    uploadPhase={upload?.phase}
                    uploadFailed={upload?.phase === 'failed'}
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
              <Text
                style={[
                  styles.bubbleTime,
                  isMediaCard && styles.bubbleTimeVideo,
                  !isMediaCard && { color: textColor, opacity: 0.9 },
                ]}
              >
                {timeStr}
              </Text>
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
            isVoice && styles.bubbleVoice,
            !isMediaCard && !isVoice && { backgroundColor: bubbleColor },
          ]}
        >
          {msg.message_type === 'text' ? (
            <ChatMentionText
              content={msg.content || ''}
              mentions={parseMessageMentions(msg.mentions)}
              style={[styles.bubbleText, { color: textColor }]}
              mentionStyle={{ color: '#fff', fontWeight: '700' }}
            />
          ) : msg.message_type === 'voice' && voiceUri ? (
            <VoiceMessagePlayer
              messageId={msg.id}
              uri={voiceUri}
              isOwn={true}
              durationSec={parseVoiceDuration(msg.content)}
              uploading={String(msg.id).startsWith('temp-')}
            />
          ) : videoAlbum && videoAlbum.length > 1 ? (
            <ChatVideoAlbum
              messages={videoAlbum}
              isOwn
              videoUploads={videoUploads}
              onRetryVideo={(m) => onVideoRetryForMessage?.(m)}
              deferLocalVideo={!mediaPreloadReady}
            />
          ) : isVideo ? (
            <View style={styles.chatVideoWrap}>
              <ChatVideoMessage
                mediaUrl={msg.media_url}
                mediaThumbnail={msg.media_thumbnail}
                isOwn
                uploadProgress={upload?.progress}
                uploadPhase={upload?.phase}
                uploadFailed={upload?.phase === 'failed'}
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
          <Text
            style={[
              styles.bubbleTime,
              isMediaCard && styles.bubbleTimeVideo,
              !isMediaCard && { color: textColor, opacity: 0.9 },
            ]}
          >
            {timeStr}
            {msg.is_read ? ' ✓✓' : ' ✓'}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

export default function AdminChatScreen() {
  const { t } = useTranslation();
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { staff } = useAuthStore();
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationType, setConversationType] = useState<string>('direct');
  const [conversationName, setConversationName] = useState<string>('');
  const [conversationAvatar, setConversationAvatar] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const videoUploads = useChatVideoUploadStates(conversationId);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupAvatar, setEditGroupAvatar] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [showBubbleColorModal, setShowBubbleColorModal] = useState(false);
  const listRef = useRef<FlatList>(null);
  const subscriptionRef = useRef<ReturnType<typeof subscribeToMessages> | null>(null);
  const typingPresenceRef = useRef<ReturnType<typeof subscribeToTypingPresence> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const [pendingMentions, setPendingMentions] = useState<ChatMention[]>([]);
  const [mentionParticipants, setMentionParticipants] = useState<ChatMentionParticipant[]>([]);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { myBubbleColor, setMyBubbleColor, loadStored: loadBubbleStore } = useMessagingBubbleStore();
  const chatHasVideosEarly = useMemo(
    () => messages.some((m) => m.message_type === 'video'),
    [messages]
  );
  const heavyMediaReady = useChatHeavyMediaReady(conversationId, loading, {
    hasVideos: chatHasVideosEarly,
  });
  const inputRowExtra = Platform.OS === 'android' ? -20 : 56;
  const bottomInset = getEffectiveBottomInset(insets);
  const chatInputBottomPad = getChatInputBottomPadding(insets);
  const androidKbPadding =
    Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + inputRowExtra + bottomInset : 0;

  useEffect(() => {
    setMessages([]);
    setLoading(true);
  }, [conversationId]);

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
      chatUrl: `/admin/messages/chat/${conversationId}`,
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

  const navigation = useNavigation();
  useEffect(() => {
    loadBubbleStore();
  }, [loadBubbleStore]);
  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('conversations')
      .select('type, name, avatar')
      .eq('id', conversationId)
      .single()
      .then(async ({ data }) => {
        const row = data as { type: string; name: string | null; avatar: string | null } | null;
        setConversationType(row?.type ?? 'direct');
        if (staff?.id) {
          const header = await staffGetConversationHeader(conversationId, staff.id);
          setConversationName(header.name);
          setConversationAvatar(header.avatar);
        } else {
          setConversationName(row?.name ?? t('screenChat'));
          setConversationAvatar(row?.avatar ?? null);
        }
      });
  }, [conversationId, staff?.id]);

  useEffect(() => {
    const headerTitleMaxWidth = Math.max(120, Math.min(280, winWidth - 120));
    navigation.setOptions({
      headerTitle: () => (
        <View style={[styles.headerTitleRow, { maxWidth: headerTitleMaxWidth }]}>
          {conversationAvatar ? (
            <CachedImage uri={conversationAvatar} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarInitial}>{(conversationName || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.headerTitleText} numberOfLines={1}>{conversationName || t('screenChat')}</Text>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {canEditGroup && staff?.id && conversationId ? (
            <ChatGroupExportHeaderButtons
              conversationId={conversationId}
              staffId={staff.id}
              conversationName={conversationName || t('screenChat')}
              iconColor={MESSAGING_COLORS.primary}
            />
          ) : null}
          <TouchableOpacity onPress={() => setShowBubbleColorModal(true)} style={{ padding: 8, marginRight: 8 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="color-palette-outline" size={24} color={MESSAGING_COLORS.primary} />
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, conversationName, conversationAvatar, t, winWidth, canEditGroup, staff?.id, conversationId]);

  const openGroupSettings = () => {
    setEditGroupName(conversationName);
    setEditGroupAvatar(conversationAvatar);
    setShowGroupSettings(true);
  };

  useEffect(() => {
    if (!staff || !conversationId) {
      setLoading(false);
      return;
    }
    (async () => {
      const list = await staffGetMessages(conversationId, 50, undefined, staff.id);
      setMessages(capChatMessageList(list));
      staffMarkConversationRead(conversationId, staff.id);
      setLoading(false);
    })();
  }, [staff, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    subscriptionRef.current = subscribeToMessages(
      conversationId,
      (newMsg) => {
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => !String(m.id).startsWith('temp-'));
          if (withoutTemp.some((m) => m.id === newMsg.id)) return prev;
          return [...withoutTemp, newMsg];
        });
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
    return () => {
      subscriptionRef.current?.unsubscribe?.();
    };
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !staff) return;
    typingPresenceRef.current = subscribeToTypingPresence(
      conversationId,
      { displayName: staff.full_name || staff.email || t('adminTab'), userId: staff.id },
      setTypingNames
    );
    return () => {
      typingPresenceRef.current?.unsubscribe?.();
      typingPresenceRef.current = null;
    };
  }, [conversationId, staff]);

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
    if (!text || !staff || !conversationId || sending) return;
    const mentions = syncMentionsWithText(text, pendingMentions);
    setSending(true);
    setInput('');
    setPendingMentions([]);
    typingPresenceRef.current?.updateTyping(false);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: staff.id,
      sender_type: 'admin',
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
          chatUrl: `/admin/messages/chat/${convId}`,
          mentionPushBody: t('chatMentionPushBody', { name: staff.full_name || staff.email, preview }),
          defaultPushBody: preview,
        });
        if (nextConversationId !== conversationId) {
          router.replace({ pathname: '/admin/messages/chat/[id]', params: { id: nextConversationId } });
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
      setSending(false);
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
          data: { conversationId: convId, url: `/admin/messages/chat/${convId}` },
        }).catch(() => {});
        const list = await staffGetMessages(convId, 50, undefined, staff.id);
        setMessages(list);
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
      if (sentMessages.length) {
        const { notifyConversationRecipients } = await import('@/lib/notificationService');
        notifyConversationRecipients({
          conversationId: convId,
          excludeStaffId: staff.id,
          title: conversationName || t('notifNewMessage'),
          body: t('staffChatPhotoSentBody'),
          data: { conversationId: convId, url: `/admin/messages/chat/${convId}` },
        }).catch(() => {});
        const list = await staffGetMessages(convId, 50, undefined, staff.id);
        setMessages(list);
        scrollChatListToLatest(listRef, true);
      } else if (failed) Alert.alert(t('error'), t('imageSendFailed'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
    }
  };

  const videoBatchActive = getChatVideoBatchSummary(videoUploads).active;

  useEffect(() => {
    if (!conversationId) return;
    return registerChatVideoScreen(conversationId, { patchMessages: setMessages });
  }, [conversationId]);

  usePendingMuxVideoPoll(messages, setMessages, {
    enabled: Boolean(conversationId && staff?.id && !loading),
  });

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
      onBatchReady: ({ conversationId: convId }) => {
        void import('@/lib/notificationService').then(({ notifyConversationRecipients }) =>
          notifyConversationRecipients({
            conversationId: convId,
            excludeStaffId: staff.id,
            title: conversationName || t('notifNewMessage'),
            body: t('staffChatVideoSentBody'),
            data: { conversationId: convId, url: `/admin/messages/chat/${convId}` },
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
      if (!staff || !conversationId || sending) return;
      const tempId = `temp-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setMessages((prev) => [
        ...prev,
        createOptimisticVoiceMessage({
          tempId,
          conversationId,
          senderId: staff.id,
          senderType: 'admin',
          senderName: staff.full_name || staff.email,
          senderAvatar: staff.profile_image ?? null,
          localUri,
          durationSec,
        }),
      ]);
      setTimeout(() => scrollChatListToLatest(listRef, true), 50);
      const actor = {
        kind: 'staff' as const,
        staffId: staff.id,
        staffName: staff.full_name || staff.email,
        staffAvatar: staff.profile_image ?? null,
        conversationId,
      };
      const { message, error, conversationId: cid } = await sendStaffVoiceMessage(
        actor,
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
          { ownSenderId: staff.id, replaceTempId: tempId }
        )
      );
      const convId = cid ?? conversationId;
      void import('@/lib/notificationService').then(({ notifyConversationRecipients }) =>
        notifyConversationRecipients({
          conversationId: convId,
          excludeStaffId: staff.id,
          title: conversationName || t('notifNewMessage'),
          body: t('staffChatVoiceSentBody'),
          data: { conversationId: convId, url: `/admin/messages/chat/${convId}` },
        })
      );
      scrollChatListToLatest(listRef, true);
    },
    [staff, conversationId, sending, t, conversationName]
  );

  const preUploadVoice = useCallback((uri: string) => uploadVoiceMessageForStaff(uri), []);

  const voiceRecorder = useChatVoiceRecording({
    onSend: sendVoiceMessage,
    preUpload: preUploadVoice,
    preUploadKey: conversationId,
    disabled: sending,
  });

  const showAttachOptions = () => {
    Alert.alert(
      t('chatAttachTitle'),
      undefined,
      [
        { text: t('takePhoto'), onPress: () => void sendImageFromCamera() },
        { text: t('chatPickMultiplePhotos'), onPress: () => void sendImagesFromLibrary() },
        { text: t('chatPickMultipleVideos'), onPress: () => void sendVideoFromSource('library') },
        { text: t('chatRecordVideo'), onPress: () => sendVideoFromSource('camera') },
        { text: t('staffChatAttachVoice'), onPress: () => void voiceRecorder.start() },
        { text: t('cancel'), style: 'cancel' },
      ]
    );
  };

  const handleDeleteMessage = (msg: Message) => {
    if (!conversationId) return;
    Alert.alert(t('deleteMessageTitle'), t('deleteMessageConfirm'), [
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
    if (!granted) {
      return;
    }
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
        .update({ name, avatar: editGroupAvatar ?? null, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      if (error) {
        Alert.alert(t('error'), error.message);
        return;
      }
      setConversationName(name);
      setConversationAvatar(editGroupAvatar);
      navigation.setOptions({ title: name });
      setShowGroupSettings(false);
    } finally {
      setSavingGroup(false);
    }
  };

  if (!staff) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, androidKbPadding > 0 && { paddingBottom: androidKbPadding }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        keyboardShouldPersistTaps="handled"
        ref={listRef}
        data={invertedChatListItems}
        keyExtractor={(item) => (item.kind === 'message' ? item.message.id : item.key)}
        contentContainerStyle={[CHAT_LIST_INVERTED_CONTENT_STYLE, styles.listContent]}
        {...CHAT_FLAT_LIST_PROPS}
        ListHeaderComponent={
          canEditGroup ? (
            <TouchableOpacity
              style={styles.groupSettingsBar}
              onPress={openGroupSettings}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={20} color={MESSAGING_COLORS.primary} />
              <Text style={styles.groupSettingsBarText}>{t('staffChatEditGroupBar')}</Text>
              <Ionicons name="chevron-forward" size={18} color={MESSAGING_COLORS.textSecondary} />
            </TouchableOpacity>
          ) : null
        }
        renderItem={({ item }) => {
          const msg = item.kind === 'message' ? item.message : item.messages[item.messages.length - 1];
          if (msg.message_type === 'screenshot_notice') {
            return <ChatScreenshotNotice message={msg} />;
          }
          const isOwn = msg.sender_id === staff?.id;
          const bubbleColor = isOwn
            ? myBubbleColor
            : (conversationType === 'group' ? getBubbleColorForSender(msg.sender_id) : BUBBLE_OTHER_DIRECT);
          const resolveVideoUpload = (m: Message) =>
            videoUploads[m.id] ?? Object.values(videoUploads).find((s) => s.messageId === m.id);
          return (
            <MessageBubble
              msg={msg}
              isOwn={isOwn}
              isGroup={conversationType === 'group'}
              imageAlbum={item.kind === 'image_album' ? item.messages : undefined}
              videoAlbum={item.kind === 'video_album' ? item.messages : undefined}
              videoUploads={videoUploads}
              onImagePress={setFullscreenImageUri}
              onDelete={handleDeleteMessage}
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
          <View style={styles.emptyInverted}>
            <Text style={styles.empty}>{t('chatNoMessagesYet')}</Text>
          </View>
        }
      />
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
      <View style={[styles.inputRow, { paddingBottom: chatInputBottomPad }]}>
        <TouchableOpacity
          style={styles.mediaBtn}
          onPress={showAttachOptions}
          disabled={sending || voiceRecorder.phase !== 'idle'}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={20} color={MESSAGING_COLORS.textSecondary} />
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
              placeholder={mentionEnabled ? t('chatMentionInputPlaceholder') : t('messageInputPlaceholder')}
              placeholderTextColor={MESSAGING_COLORS.textSecondary}
              value={input}
              onChangeText={(text) => {
                setInput(text);
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

      <Modal visible={showGroupSettings} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          style={styles.modalOverlay}
          onPress={() => setShowGroupSettings(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalBox}>
            <Text style={styles.modalTitle}>{t('chatGroupSettingsTitle')}</Text>
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
                    <Text style={styles.modalAvatarPlaceholderText}>{t('photo')}</Text>
                  </View>
                )}
                {uploadingAvatar && (
                  <View style={styles.modalAvatarLoading}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                )}
              </TouchableOpacity>
              <Text style={styles.modalAvatarHint}>{t('chatGroupAvatarHint')}</Text>
            </View>
            <Text style={styles.modalLabel}>{t('chatGroupNameLabel')}</Text>
            <TextInput
              style={styles.modalInput}
              value={editGroupName}
              onChangeText={setEditGroupName}
              placeholder={t('groupNameExamplePlaceholder')}
              placeholderTextColor={MESSAGING_COLORS.textSecondary}
            />
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
                  <Text style={styles.modalSaveText}>{t('save')}</Text>
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
        accentColor="#1a365d"
      />

      <ChatFullscreenImageModal uri={fullscreenImageUri} onClose={() => setFullscreenImageUri(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 12, paddingBottom: 16 },
  groupSettingsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  groupSettingsBarText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: MESSAGING_COLORS.primary,
  },
  bubbleWrap: { marginBottom: 12 },
  bubbleWrapOwn: { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },
  otherMeta: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  otherContent: { flex: 1, minWidth: 0 },
  avatarWrap: { width: 36, height: 36, borderRadius: 18 },
  avatarImg: { width: 36, height: 36, borderRadius: 18 },
  avatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: { color: '#fff', fontWeight: '700', fontSize: 16 },
  senderName: { fontSize: 12, color: MESSAGING_COLORS.primary, marginBottom: 2, marginLeft: 4 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
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
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 220,
  },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarInitial: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerTitleText: { fontSize: 17, fontWeight: '700', color: MESSAGING_COLORS.text, flex: 1, minWidth: 0 },
  empty: { textAlign: 'center', color: MESSAGING_COLORS.textSecondary, marginTop: 24 },
  emptyInverted: { transform: [{ scaleY: -1 }] },
  typingRow: { paddingHorizontal: 12, paddingVertical: 4, paddingBottom: 2, minHeight: 22, backgroundColor: '#fff' },
  typingText: { fontSize: 12, color: MESSAGING_COLORS.textSecondary },
  typingMultiRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  typingChip: { width: 20, height: 20, borderRadius: 10, backgroundColor: MESSAGING_COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  typingChipLetter: { fontSize: 11, fontWeight: '700', color: '#fff' },
  typingTextSmall: { fontSize: 11, color: MESSAGING_COLORS.textSecondary },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 8,
    paddingBottom: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    marginRight: 8,
    color: '#1F2937',
    justifyContent: 'center',
  },
  inputVoice: {
    maxHeight: 56,
    paddingVertical: 4,
  },
  mentionInput: {
    flex: 1,
    fontSize: 15,
    maxHeight: 100,
    color: '#1F2937',
    padding: 0,
    margin: 0,
  },
  sendBtn: {
    backgroundColor: MESSAGING_COLORS.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    justifyContent: 'center',
    minHeight: 40,
  },
  sendBtnDisabled: { opacity: 0.5 },
  sendBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  mediaBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: MESSAGING_COLORS.text, marginBottom: 20 },
  bubbleColorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  bubbleColorChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  bubbleColorChipSelected: { borderColor: '#1a365d' },
  modalAvatarRow: { alignItems: 'center', marginBottom: 20 },
  modalAvatarTouch: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', alignSelf: 'center' },
  modalAvatarImg: { width: 80, height: 80 },
  modalAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAvatarPlaceholderText: { color: '#fff', fontSize: 12 },
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
  modalAvatarHint: { fontSize: 12, color: MESSAGING_COLORS.textSecondary, marginTop: 8 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: MESSAGING_COLORS.text, marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: MESSAGING_COLORS.textSecondary, fontWeight: '600' },
  modalSaveBtn: {
    backgroundColor: MESSAGING_COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: { opacity: 0.7 },
  modalSaveText: { color: '#fff', fontWeight: '600' },
});
