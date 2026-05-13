import { useEffect, useState, useRef } from 'react';
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
import { useAuthStore } from '@/stores/authStore';
import { uriToArrayBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  staffGetMessages,
  staffSendMessage,
  staffMarkConversationRead,
  staffGetConversationHeader,
  staffDeleteMessage,
  subscribeToMessages,
  subscribeToTypingPresence,
  uploadImageMessageForStaff,
} from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/messaging';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import {
  useMessagingBubbleStore,
  getBubbleColorForSender,
  getContrastTextColor,
  BUBBLE_OTHER_DIRECT,
  BUBBLE_COLOR_OPTIONS,
} from '@/stores/messagingBubbleStore';
import { useTranslation } from 'react-i18next';

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function formatMessageDateAndTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({
  msg,
  isOwn,
  isGroup,
  onImagePress,
  onDelete,
  bubbleColor,
}: {
  msg: Message;
  isOwn: boolean;
  isGroup: boolean;
  onImagePress?: (uri: string) => void;
  onDelete?: (msg: Message) => void;
  bubbleColor: string;
}) {
  const { t } = useTranslation();
  const voiceUri = msg.message_type === 'voice' ? (msg.media_url || msg.content) : null;
  const isImage = msg.message_type === 'image' && (msg.media_url || msg.media_thumbnail);
  const imageUri = msg.media_url || msg.media_thumbnail || '';
  const displayName = msg.sender_name?.trim() || (msg.sender_type === 'guest' ? t('guestDefaultName') : null) || '?';
  const initial = displayName.charAt(0).toUpperCase();
  const timeStr = isGroup ? formatMessageDateAndTime(msg.created_at) : formatMessageTime(msg.created_at);
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
            <View style={[styles.bubble, styles.bubbleOther, { backgroundColor: bubbleColor }]}>
              {msg.message_type === 'text' ? (
                <Text style={[styles.bubbleText, { color: textColor }]}>{msg.content || ''}</Text>
              ) : msg.message_type === 'voice' && voiceUri ? (
                <VoiceMessagePlayer uri={voiceUri} isOwn={false} />
              ) : isImage ? (
                <TouchableOpacity style={[styles.imageWrap, styles.imageWrapPlaceholder]} onPress={() => onImagePress?.(imageUri)} activeOpacity={1}>
                  <CachedImage uri={msg.media_thumbnail || msg.media_url || ''} style={styles.bubbleImage} contentFit="cover" transition={0} />
                </TouchableOpacity>
              ) : (
                <Text style={[styles.bubbleText, { color: textColor }]}>
                  [{msg.message_type}] {msg.content || msg.media_url || '—'}
                </Text>
              )}
              <Text style={[styles.bubbleTime, { color: textColor, opacity: 0.9 }]}>
                {timeStr}
              </Text>
            </View>
          </View>
        </View>
      )}
      {isOwn && (
        <View style={[styles.bubble, styles.bubbleOwn, { backgroundColor: bubbleColor }]}>
          {msg.message_type === 'text' ? (
            <Text style={[styles.bubbleText, { color: textColor }]}>{msg.content || ''}</Text>
          ) : msg.message_type === 'voice' && voiceUri ? (
            <VoiceMessagePlayer uri={voiceUri} isOwn={true} />
          ) : isImage ? (
            <TouchableOpacity style={[styles.imageWrap, styles.imageWrapPlaceholder]} onPress={() => onImagePress?.(imageUri)} activeOpacity={1}>
              <CachedImage uri={msg.media_thumbnail || msg.media_url || ''} style={styles.bubbleImage} contentFit="cover" transition={0} />
            </TouchableOpacity>
          ) : (
            <Text style={[styles.bubbleText, { color: textColor }]}>
              [{msg.message_type}] {msg.content || msg.media_url || '—'}
            </Text>
          )}
          <Text style={[styles.bubbleTime, { color: textColor, opacity: 0.9 }]}>
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
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { myBubbleColor, setMyBubbleColor, loadStored: loadBubbleStore } = useMessagingBubbleStore();
  const inputRowExtra = Platform.OS === 'android' ? -20 : 56;
  const androidKbPadding = Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + inputRowExtra + insets.bottom : 0;

  const isAdmin = staff?.role === 'admin';
  const isGroup = conversationType === 'group';
  const canEditGroup = isAdmin && isGroup;

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
        <TouchableOpacity onPress={() => setShowBubbleColorModal(true)} style={{ padding: 8, marginRight: 8 }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="color-palette-outline" size={24} color={MESSAGING_COLORS.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, conversationName, conversationAvatar, t, winWidth]);

  const openGroupSettings = () => {
    setEditGroupName(conversationName);
    setEditGroupAvatar(conversationAvatar);
    setShowGroupSettings(true);
  };

  const scrollTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!staff || !conversationId) {
      setLoading(false);
      return;
    }
    scrollTimeoutsRef.current = [];
    (async () => {
      const list = await staffGetMessages(conversationId, 50, undefined, staff.id);
      setMessages(list);
      staffMarkConversationRead(conversationId, staff.id);
      setLoading(false);
      const scrollToEnd = () => listRef.current?.scrollToEnd({ animated: true });
      const hasImage = list.some((m: Message) => m.message_type === 'image');
      if (Platform.OS === 'android') {
        scrollToEnd();
        scrollTimeoutsRef.current.push(setTimeout(scrollToEnd, 150), setTimeout(scrollToEnd, 450));
        if (hasImage) scrollTimeoutsRef.current.push(setTimeout(scrollToEnd, 750));
      } else {
        scrollTimeoutsRef.current.push(setTimeout(scrollToEnd, 100));
      }
    })();
    return () => scrollTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
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
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      },
      {
        onMessageDeleted: (messageId) => {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
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
    setSending(true);
    setInput('');
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
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    const { data: sent, error, conversationId: nextConversationId } = await staffSendMessage(
      conversationId,
      staff.id,
      staff.full_name || staff.email,
      staff.profile_image ?? null,
      text
    );
    setSending(false);
    if (error) {
      setInput(text);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert(t('messageSendFailedTitle'), typeof error === 'string' ? error : String(error));
      return;
    }
    if (sent) {
      const convId = nextConversationId ?? conversationId;
      const { notifyConversationRecipients } = await import('@/lib/notificationService');
      notifyConversationRecipients({
        conversationId: convId,
        excludeStaffId: staff.id,
        title: conversationName || t('notifNewMessage'),
        body: text.slice(0, 80) + (text.length > 80 ? '…' : ''),
        data: { conversationId: convId, url: `/admin/messages/chat/${convId}` },
      }).catch(() => {});
      if (nextConversationId !== conversationId) {
        router.replace({ pathname: '/admin/messages/chat/[id]', params: { id: nextConversationId } });
        return;
      }
      listRef.current?.scrollToEnd({ animated: true });
    }
  };

  const sendImageFromSource = async (source: 'camera' | 'library') => {
    if (!staff || !conversationId || sending) return;
    if (source === 'camera') {
      const granted = await ensureCameraPermission({
        title: t('chatCameraPermissionTitle'),
        message: t('chatCameraPermissionMessage'),
        settingsMessage: t('chatCameraPermissionSettings'),
      });
      if (!granted) return;
    } else {
      const granted = await ensureMediaLibraryPermission({
        title: t('chatGalleryPermissionTitle'),
        message: t('chatGalleryPermissionMessage'),
        settingsMessage: t('chatGalleryPermissionSettings'),
      });
      if (!granted) {
        return;
      }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets[0]?.uri) return;
    const uri = result.assets[0].uri;
    setSending(true);
    try {
      console.log('[AdminChat] Resim seçildi, uri:', uri?.slice?.(0, 80));
      const arrayBuffer = await uriToArrayBuffer(uri);
      console.log('[AdminChat] uriToArrayBuffer OK, byteLength:', arrayBuffer?.byteLength);
      const { mime } = getMimeAndExt(uri, 'image');
      console.log('[AdminChat] mime:', mime);
      const mediaUrl = await uploadImageMessageForStaff(arrayBuffer, mime);
      console.log('[AdminChat] mediaUrl alındı:', mediaUrl?.slice?.(0, 60));
      const { data: sent, error, conversationId: nextConversationId } = await staffSendMessage(
        conversationId,
        staff.id,
        staff.full_name || staff.email,
        staff.profile_image ?? null,
        t('photo'),
        'image',
        mediaUrl
      );
      if (error) {
        Alert.alert(t('messageSendFailedTitle'), typeof error === 'string' ? error : String(error));
        return;
      }
      if (sent) {
        const convId = nextConversationId ?? conversationId;
        const { notifyConversationRecipients } = await import('@/lib/notificationService');
        notifyConversationRecipients({
          conversationId: convId,
          excludeStaffId: staff.id,
          title: conversationName || t('notifNewMessage'),
          body: t('staffChatPhotoSentBody'),
          data: { conversationId: convId, url: `/admin/messages/chat/${convId}` },
        }).catch(() => {});
        if (nextConversationId !== conversationId) {
          router.replace({ pathname: '/admin/messages/chat/[id]', params: { id: nextConversationId } });
          return;
        }
        const list = await staffGetMessages(nextConversationId, 50, undefined, staff.id);
        setMessages(list);
        listRef.current?.scrollToEnd({ animated: true });
      }
    } catch (e) {
      const err = e as Error;
      console.error('[AdminChat] Resim yükleme hatası:', err?.message, err?.stack);
      Alert.alert(t('error'), err?.message ?? t('imageSendFailed'));
    } finally {
      setSending(false);
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      t('sendPhotoTitle'),
      undefined,
      [
        { text: t('takePhoto'), onPress: () => sendImageFromSource('camera') },
        { text: t('chooseFromGallery'), onPress: () => sendImageFromSource('library') },
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
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
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
          const isOwn = item.sender_id === staff?.id;
          const bubbleColor = isOwn
            ? myBubbleColor
            : (conversationType === 'group' ? getBubbleColorForSender(item.sender_id) : BUBBLE_OTHER_DIRECT);
          return (
            <MessageBubble
              msg={item}
              isOwn={isOwn}
              isGroup={conversationType === 'group'}
              onImagePress={setFullscreenImageUri}
              onDelete={handleDeleteMessage}
              bubbleColor={bubbleColor}
            />
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>{t('chatNoMessagesYet')}</Text>}
        onContentSizeChange={() => { if (messages.length > 0) listRef.current?.scrollToEnd({ animated: false }); }}
        onLayout={Platform.OS === 'android' ? () => { if (messages.length > 0) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false })); } : undefined}
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
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder={t('messageInputPlaceholder')}
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
          multiline
          maxLength={2000}
          onSubmitEditing={send}
        />
        <TouchableOpacity style={styles.mediaBtn} onPress={showImageOptions} disabled={sending} activeOpacity={0.7}>
          <Ionicons name="camera-outline" size={18} color={MESSAGING_COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.mediaBtn} onPress={() => sendImageFromSource('library')} disabled={sending} activeOpacity={0.7}>
          <Ionicons name="images-outline" size={18} color={MESSAGING_COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || sending}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={20} color="#fff" />
          )}
        </TouchableOpacity>
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

      <Modal visible={showBubbleColorModal} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.modalOverlay} onPress={() => setShowBubbleColorModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.modalBox}>
            <Text style={styles.modalTitle}>Mesaj balon renginiz</Text>
            <View style={styles.bubbleColorRow}>
              {BUBBLE_COLOR_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.bubbleColorChip,
                    { backgroundColor: c },
                    myBubbleColor === c && styles.bubbleColorChipSelected,
                  ]}
                  onPress={() => {
                    setMyBubbleColor(c);
                    setShowBubbleColorModal(false);
                  }}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowBubbleColorModal(false)}>
              <Text style={styles.modalCancelText}>{t('close')}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={!!fullscreenImageUri} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.imageModalOverlay} onPress={() => setFullscreenImageUri(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.imageModalContent, { maxWidth: winWidth, maxHeight: winHeight }]} onPress={() => {}}>
            {fullscreenImageUri ? (
              <CachedImage uri={fullscreenImageUri} style={[styles.imageModalImage, { width: winWidth, height: winHeight }]} contentFit="contain" />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageModalCloseBtn} onPress={() => setFullscreenImageUri(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
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
  imageWrap: { marginTop: 2, width: 200, height: 200, borderRadius: 12, overflow: 'hidden' },
  imageWrapPlaceholder: { backgroundColor: '#e5e7eb' },
  bubbleImage: { width: 200, height: 200, borderRadius: 12 },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: { justifyContent: 'center', alignItems: 'center' },
  imageModalImage: { maxWidth: '100%', maxHeight: '100%' },
  imageModalCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
    paddingBottom: Platform.OS === 'ios' ? 24 : 48,
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
