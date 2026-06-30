import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { ChatInputBar } from '@/components/chat/ChatInputBar';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { AttachmentSheet, type AttachmentAction } from '@/components/chat/AttachmentSheet';
import { ChatVideoBatchBar } from '@/components/ChatVideoBatchBar';
import { ChatFullscreenImageModal } from '@/components/ChatFullscreenImageModal';
import {
  partnerGetConversationHeader,
  partnerGetMessages,
  partnerListConversations,
  partnerMarkConversationRead,
  partnerSendMessage,
  subscribeToMessages,
  uploadVoiceMessageForPartner,
} from '@/lib/messagingApi';
import {
  capChatMessageList,
  mergeChatMessagesCapped,
  upsertIncomingChatMessage,
  type Message,
} from '@/lib/messaging';
import { CHAT_LIST_INVERTED_CONTENT_STYLE, scrollChatListToLatest, useInvertedChatListItems } from '@/lib/chatListScroll';
import { CHAT_FLAT_LIST_PROPS } from '@/lib/chatListPerf';
import {
  pickChatImageFromCamera,
  pickChatImagesFromLibrary,
  sendChatImageUris,
} from '@/lib/chatMediaSend';
import { sendPartnerVoiceMessage } from '@/lib/chatVoiceSend';
import { createOptimisticVoiceMessage } from '@/lib/chatOptimisticMessage';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import {
  createSessionChatVideoHandlers,
  expireStaleChatVideoUploadsForConversation,
  getChatVideoBatchSummary,
  pruneDoneChatVideoUploads,
  registerChatVideoScreen,
  retryChatVideoUploadWithSession,
  sendChatVideoFromPickerWithSession,
  useChatVideoUploadStates,
} from '@/lib/chatVideoUploadSession';
import { usePendingMuxVideoPoll } from '@/lib/usePendingMuxVideoPoll';
import { useChatVoiceRecording } from '@/hooks/chat/useChatVoiceRecording';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { usePartnerMessagingStore } from '@/stores/partnerMessagingStore';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

function routeParamFirst(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim().length > 0 ? s.trim() : undefined;
}

export default function PartnerChatScreen() {
  const params = useLocalSearchParams<{ id?: string | string[]; name?: string | string[] }>();
  const conversationId = routeParamFirst(params.id);
  const conversationName = routeParamFirst(params.name);
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const partner = usePartnerAuthStore((s) => s.partner);
  const setUnreadCount = usePartnerMessagingStore((s) => s.setUnreadCount);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [headerName, setHeaderName] = useState(conversationName || 'Sohbet');
  const [attachSheetVisible, setAttachSheetVisible] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const sendInFlightRef = useRef(false);
  const videoUploads = useChatVideoUploadStates(conversationId ?? '');

  const partnerUserId = partner?.partnerUserId ?? null;
  const invertedMessages = useInvertedChatListItems(messages);
  const displayName = useMemo(
    () => [partner?.fullName, partner?.hotel.name].filter(Boolean).join(' · ') || 'Partner',
    [partner?.fullName, partner?.hotel.name]
  );

  const mediaActor = useMemo(() => {
    if (!conversationId || !partnerUserId) return null;
    return {
      kind: 'partner' as const,
      partnerUserId,
      partnerDisplayName: displayName,
      conversationId,
    };
  }, [conversationId, partnerUserId, displayName]);

  const videoBatchActive = getChatVideoBatchSummary(videoUploads).active;

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: headerName,
      headerStyle: { backgroundColor: partnerTheme.bg },
      headerTintColor: partnerTheme.text,
      headerBackTitle: 'Geri',
    });
  }, [navigation, headerName]);

  useEffect(() => {
    if (!conversationId) return;
    return registerChatVideoScreen(conversationId, { patchMessages: setMessages });
  }, [conversationId]);

  usePendingMuxVideoPoll(messages, setMessages, {
    enabled: Boolean(conversationId && !loading && partnerUserId),
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

  const refreshUnread = useCallback(async () => {
    try {
      const list = await partnerListConversations();
      setUnreadCount(list.reduce((s, c) => s + (c.unread_count ?? 0), 0));
    } catch {
      /* ignore */
    }
  }, [setUnreadCount]);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const [msgs, header] = await Promise.all([
        partnerGetMessages(conversationId, 80),
        partnerGetConversationHeader(conversationId),
      ]);
      setMessages(mergeChatMessagesCapped([], msgs));
      setHeaderName(header.name || conversationName || 'Sohbet');
      await partnerMarkConversationRead(conversationId);
      void refreshUnread();
      setTimeout(() => scrollChatListToLatest(listRef, false), 50);
    } catch (e) {
      Alert.alert('Hata', (e as Error).message || 'Mesajlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [conversationId, conversationName, refreshUnread]);

  const keepInputFocused = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!conversationId) return;
    const sub = subscribeToMessages(conversationId, (msg) => {
      setMessages((prev) => upsertIncomingChatMessage(prev, msg, { ownSenderType: 'partner' }));
      if (msg.sender_type !== 'partner') {
        void partnerMarkConversationRead(conversationId);
        void refreshUnread();
      }
    });
    return () => sub.unsubscribe();
  }, [conversationId, refreshUnread]);

  const send = async () => {
    const text = input.trim();
    if (!text || !conversationId || sendInFlightRef.current) return;
    sendInFlightRef.current = true;
    setSending(true);
    const optimistic: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: partnerUserId || '',
      sender_type: 'partner',
      sender_name: displayName,
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
    };
    setInput('');
    keepInputFocused();
    setMessages((prev) => capChatMessageList([...prev, optimistic]));
    scrollChatListToLatest(listRef, { animated: true });

    const { messageId, error } = await partnerSendMessage(conversationId, text);
    setSending(false);
    sendInFlightRef.current = false;
    if (!messageId) {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
      keepInputFocused();
      Alert.alert('Mesaj gönderilemedi', error ?? t('unknownError'));
      return;
    }
    setMessages((prev) =>
      upsertIncomingChatMessage(
        prev.filter((m) => m.id !== optimistic.id),
        { ...optimistic, id: messageId, is_delivered: true },
        { ownSenderType: 'partner', replaceTempId: optimistic.id }
      )
    );
    keepInputFocused();
  };

  const sendImagesFromLibrary = async () => {
    if (!mediaActor || sending) return;
    const uris = await pickChatImagesFromLibrary();
    if (!uris.length) return;
    setSending(true);
    try {
      const { sentMessages, failed } = await sendChatImageUris(mediaActor, uris, t('photo'));
      if (sentMessages.length) {
        setMessages((prev) => capChatMessageList([...prev, ...sentMessages]));
        scrollChatListToLatest(listRef, true);
      }
      if (failed > 0) Alert.alert(t('error'), t('chatMediaPartialFail', { count: failed }));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
      keepInputFocused();
    }
  };

  const sendImageFromCamera = async () => {
    if (!mediaActor || sending) return;
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
      const { sentMessages, failed } = await sendChatImageUris(mediaActor, [uri], t('photo'));
      if (sentMessages.length) {
        setMessages((prev) => capChatMessageList([...prev, ...sentMessages]));
        scrollChatListToLatest(listRef, true);
      }
      if (failed) Alert.alert(t('error'), t('imageSendFailed'));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
      keepInputFocused();
    }
  };

  const sendVideoFromSource = async (source: 'camera' | 'library') => {
    if (!mediaActor || videoBatchActive) return;
    const handlers = createSessionChatVideoHandlers(conversationId!, mediaActor, {
      setMessages,
      onBatchComplete: ({ failed, lastError }) => {
        if (failed > 0) {
          Alert.alert(t('error'), lastError?.trim() || t('chatMediaPartialFail', { count: failed }));
        }
      },
    });
    try {
      await sendChatVideoFromPickerWithSession(mediaActor, source, handlers);
      setTimeout(() => scrollChatListToLatest(listRef, true), 80);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('chatVideoSendFailed'));
    }
  };

  const retryVideoUpload = useCallback(
    (upload: (typeof videoUploads)[string]) => {
      if (!mediaActor) return;
      void retryChatVideoUploadWithSession(mediaActor, upload, { setMessages });
    },
    [mediaActor]
  );

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
      if (!mediaActor || !partnerUserId) return;
      const tempId = `temp-voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setMessages((prev) => [
        ...prev,
        createOptimisticVoiceMessage({
          tempId,
          conversationId: mediaActor.conversationId,
          senderId: partnerUserId,
          senderType: 'partner',
          senderName: displayName,
          senderAvatar: null,
          localUri,
          durationSec,
        }),
      ]);
      scrollChatListToLatest(listRef, true);
      const { message, error } = await sendPartnerVoiceMessage(mediaActor, localUri, {
        preUploadedMediaUrl: preUploadedUrl,
        durationSec,
      });
      if (!message || error) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        throw new Error(error ?? t('chatVoiceSendFailed'));
      }
      setMessages((prev) =>
        upsertIncomingChatMessage(prev.filter((m) => m.id !== tempId), message, {
          ownSenderType: 'partner',
          replaceTempId: tempId,
        })
      );
      keepInputFocused();
    },
    [mediaActor, partnerUserId, displayName, t, keepInputFocused]
  );

  const preUploadVoice = useCallback(
    (uri: string) => uploadVoiceMessageForPartner(uri),
    []
  );

  const voiceRecorder = useChatVoiceRecording({
    onSend: sendVoiceMessage,
    preUpload: preUploadVoice,
    preUploadKey: conversationId,
    disabled: sending,
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

  if (!conversationId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Sohbet bulunamadı.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ marginTop: 12 }}>
          <Text style={styles.link}>Geri dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      {loading && messages.length === 0 ? (
        <View style={styles.messageListHost}>
          <ActivityIndicator color={partnerTheme.accent} style={styles.loader} />
        </View>
      ) : (
        <View style={styles.messageListHost}>
          <FlatList
            ref={listRef}
            style={styles.messageList}
            data={invertedMessages}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[CHAT_LIST_INVERTED_CONTENT_STYLE, styles.listContent]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="none"
            showsVerticalScrollIndicator={false}
            {...CHAT_FLAT_LIST_PROPS}
            renderItem={({ item }) => (
              <MessageBubble
                msg={item}
                isOwn={item.sender_type === 'partner'}
                isGroup={false}
                onImagePress={(uri) => setFullscreenImageUri(uri)}
                videoUpload={videoUploads[item.id]}
                videoUploads={videoUploads}
                onVideoRetryForMessage={(msg) => {
                  const upload = videoUploads[msg.id];
                  if (upload) retryVideoUpload(upload);
                }}
                bubbleColor={
                  item.sender_type === 'partner' ? partnerTheme.accentSoft : partnerTheme.cardElevated
                }
              />
            )}
          />
        </View>
      )}
      <ChatVideoBatchBar states={videoUploads} />
      <AttachmentSheet
        visible={attachSheetVisible}
        onPick={(action) => {
          setAttachSheetVisible(false);
          handleAttachmentPick(action);
        }}
      />
      <ChatInputBar
        inputRef={inputRef}
        value={input}
        onChangeText={setInput}
        onSend={() => void send()}
        onAttach={toggleAttachTray}
        attachOpen={attachSheetVisible}
        onCamera={() => void sendImageFromCamera()}
        voice={{
          phase: voiceRecorder.phase,
          durationSec: voiceRecorder.durationSec,
          onMicPress: () => void voiceRecorder.toggleMic(),
          onSendVoice: () => void voiceRecorder.send(),
          onCancelVoice: () => void voiceRecorder.cancel(),
        }}
        sending={sending || voiceRecorder.phase === 'uploading'}
        showQuickChips={false}
        variant="dark"
        bottomPadding={Math.max(insets.bottom, 8)}
        placeholder="Mesaj yazın…"
      />
      <ChatFullscreenImageModal uri={fullscreenImageUri} onClose={() => setFullscreenImageUri(null)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  messageListHost: { flex: 1 },
  messageList: { flex: 1 },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  loader: { marginTop: 24, alignSelf: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: partnerTheme.bg },
  muted: { color: partnerTheme.muted },
  link: { color: partnerTheme.accent, fontWeight: '700' },
});
