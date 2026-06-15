import { memo } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { parseVoiceDuration, resolveVoiceMediaUrl } from '@/lib/voiceMessageMeta';
import { MessageTranslation } from '@/components/MessageTranslation';
import { ChatVideoMessage } from '@/components/ChatVideoMessage';
import { ChatImageMessage } from '@/components/ChatImageMessage';
import { ChatImageAlbum } from '@/components/ChatImageAlbum';
import { ChatVideoAlbum } from '@/components/ChatVideoAlbum';
import { SwipeReplyRow } from '@/components/premium/SwipeReplyRow';
import { QuotedReplyStrip } from '@/components/premium/QuotedReplyStrip';
import { ChatMentionText } from '@/components/ChatMentionText';
import { chatTheme, chatLayout } from '@/constants/chatTheme';
import { UploadProgressOverlay } from '@/components/chat/UploadProgressOverlay';
import { formatChatMessageDateTime, formatChatMessageTime } from '@/lib/formatChatTime';
import { parseMessageMentions } from '@/lib/chatMentions';
import { isTempMessageId } from '@/lib/chatOptimisticMessage';
import { getContrastTextColor } from '@/stores/messagingBubbleStore';
import type { Message } from '@/lib/messaging';
import type { ChatVideoUploadState } from '@/lib/chatVideoUploadSession';

export type MessageBubbleProps = {
  msg: Message;
  isOwn: boolean;
  isGroup: boolean;
  onImagePress?: (uri: string) => void;
  onDelete?: (msg: Message) => void;
  onOpenActions?: (msg: Message) => void;
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
  replyToMessage?: Message | null;
  onReply?: () => void;
  sendFailed?: boolean;
  onRetrySend?: () => void;
  imageUploadProgress?: number;
  imageUploadFailed?: boolean;
  onRetryImageUpload?: () => void;
  onCancelPendingUpload?: () => void;
  /** Grup: kendi mesajında tiklere basınca görenler listesi */
  onOpenReadInfo?: () => void;
};

function MessageBubbleInner({
  msg,
  isOwn,
  isGroup,
  onImagePress,
  onToggleSelect,
  selected,
  selectionMode,
  videoUpload,
  videoUploads,
  onVideoRetry,
  onVideoRetryForMessage,
  imageAlbum,
  videoAlbum,
  mediaPreloadReady = true,
  replyToMessage,
  onReply,
  sendFailed,
  onRetrySend,
  imageUploadProgress,
  imageUploadFailed,
  onRetryImageUpload,
  onCancelPendingUpload,
  onOpenActions,
  onOpenReadInfo,
  bubbleColor,
}: MessageBubbleProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const maxBubbleWidth = width * chatLayout.bubbleMaxWidthRatio;

  const voiceUri = msg.message_type === 'voice' ? resolveVoiceMediaUrl(msg.media_url, msg.content) : null;
  const isVoice = msg.message_type === 'voice' && !!voiceUri;
  const isVideo = msg.message_type === 'video';
  const isImage = msg.message_type === 'image' && (msg.media_url || msg.media_thumbnail);
  const isMediaCard = isVideo || !!imageAlbum?.length || !!videoAlbum?.length || isImage;
  const imageUri = msg.media_url || msg.media_thumbnail || '';
  const displayName = msg.sender_name?.trim() || (msg.sender_type === 'guest' ? t('guestDefaultName') : null) || '?';
  const initial = displayName.charAt(0).toUpperCase();
  const timeStr = isGroup ? formatChatMessageDateTime(msg.created_at) : formatChatMessageTime(msg.created_at);
  const isPending = isOwn && isTempMessageId(msg.id) && !sendFailed;
  const useCustomBubbleFill = Boolean(bubbleColor && !isMediaCard && !isVoice);
  const ownTextColor =
    isOwn && useCustomBubbleFill && bubbleColor ? getContrastTextColor(bubbleColor) : '#111827';
  const otherTextColor =
    !isOwn && useCustomBubbleFill && bubbleColor ? getContrastTextColor(bubbleColor) : chatTheme.text;

  const renderContent = (own: boolean) => {
    const quote = replyToMessage ? (
      <QuotedReplyStrip
        message={replyToMessage}
        isOwn={own}
        textColor={own ? 'rgba(17,24,39,0.75)' : undefined}
      />
    ) : null;
    if (msg.is_deleted) {
      return (
        <Text style={[styles.deletedText, own ? styles.deletedOwn : styles.deletedOther]}>
          Bu mesaj silindi
        </Text>
      );
    }
    if (msg.message_type === 'text') {
      const mentionList = parseMessageMentions(msg.mentions);
      return (
        <>
          {quote}
          <ChatMentionText
            content={msg.content || ''}
            mentions={mentionList}
            style={[styles.bubbleText, { color: own ? ownTextColor : otherTextColor }]}
            mentionStyle={{ color: own ? chatTheme.accentPurple : chatTheme.accent, fontWeight: '700' }}
          />
          <MessageTranslation content={msg.content || ''} enabled={!own} textColor={own ? ownTextColor : otherTextColor} />
        </>
      );
    }
    if (msg.message_type === 'voice' && voiceUri) {
      return (
        <VoiceMessagePlayer
          messageId={msg.id}
          uri={voiceUri}
          isOwn={own}
          durationSec={parseVoiceDuration(msg.content)}
          uploading={isPending}
        />
      );
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
      const videoUploadActive =
        Boolean(upload?.phase) && upload?.phase !== 'done' && upload?.phase !== 'failed';
      return (
        <ChatVideoMessage
          mediaUrl={msg.media_url}
          mediaThumbnail={msg.media_thumbnail}
          isOwn={own}
          uploadProgress={upload?.progress}
          uploadPhase={upload?.phase}
          uploadFailed={upload?.phase === 'failed'}
          onRetry={onVideoRetry}
          onCancelUpload={videoUploadActive || upload?.phase === 'failed' ? onCancelPendingUpload : undefined}
          preloadEnabled={mediaPreloadReady}
        />
      );
    }
    if (imageAlbum && imageAlbum.length > 1) {
      const albumUploading =
        imageUploadProgress != null && imageUploadProgress < 1 && !imageUploadFailed;
      const albumPending =
        albumUploading ||
        imageUploadFailed ||
        (isOwn && imageAlbum.some((m) => isTempMessageId(m.id)));
      return (
        <View style={styles.albumUploadWrap}>
          <ChatImageAlbum
            messages={imageAlbum}
            onPressImage={albumPending ? undefined : (uri) => onImagePress?.(uri)}
          />
          {albumPending ? (
            <UploadProgressOverlay
              progress={imageUploadProgress}
              failed={imageUploadFailed}
              onRetry={onRetryImageUpload}
              onCancel={onCancelPendingUpload}
            />
          ) : null}
        </View>
      );
    }
    if (isImage && imageUri) {
      const uploading = imageUploadProgress != null && imageUploadProgress < 1 && !imageUploadFailed;
      const pendingImage = uploading || imageUploadFailed || (isOwn && isTempMessageId(msg.id));
      return (
        <ChatImageMessage
          uri={imageUri}
          onPress={uploading ? undefined : onImagePress}
          overlay={
            pendingImage ? (
              <UploadProgressOverlay
                progress={imageUploadProgress}
                failed={imageUploadFailed}
                onRetry={onRetryImageUpload}
                onCancel={onCancelPendingUpload}
              />
            ) : null
          }
        />
      );
    }
    return (
      <Text style={[styles.bubbleText, { color: own ? ownTextColor : otherTextColor }]}>
        [{msg.message_type}] {msg.content || msg.media_url || '—'}
      </Text>
    );
  };

  const statusIcon = () => {
    if (!isOwn || msg.is_deleted) return null;
    if (sendFailed) {
      return (
        <Pressable onPress={onRetrySend} hitSlop={8}>
          <Ionicons name="alert-circle" size={14} color={chatTheme.danger} />
        </Pressable>
      );
    }
    if (isPending) {
      return <Ionicons name="time-outline" size={13} color={chatTheme.textMuted} />;
    }
    const icon = msg.is_read ? (
      <Ionicons name="checkmark-done" size={14} color={chatTheme.readCheck} />
    ) : msg.is_delivered ? (
      <Ionicons name="checkmark-done" size={14} color={chatTheme.deliveredCheck} />
    ) : (
      <Ionicons name="checkmark" size={14} color={chatTheme.deliveredCheck} />
    );
    if (onOpenReadInfo) {
      return (
        <Pressable onPress={onOpenReadInfo} hitSlop={10} accessibilityLabel="Mesaj bilgisi">
          {icon}
        </Pressable>
      );
    }
    return icon;
  };

  const bubble = (
    <Pressable
      style={[
        styles.bubbleWrap,
        isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther,
        selected ? styles.bubbleWrapSelected : null,
      ]}
      onLongPress={() => {
        if (selectionMode && isOwn && onToggleSelect) {
          onToggleSelect(msg);
          return;
        }
        if (onCancelPendingUpload) {
          onCancelPendingUpload();
          return;
        }
        onOpenActions?.(msg);
      }}
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
          <View style={[styles.otherContent, { maxWidth: maxBubbleWidth }]}>
            {isGroup && displayName ? <Text style={styles.senderName}>{displayName}</Text> : null}
            <View
              style={[
                styles.bubble,
                styles.bubbleOther,
                useCustomBubbleFill && !isOwn && bubbleColor ? { backgroundColor: bubbleColor, borderWidth: 0 } : null,
                isMediaCard && styles.bubbleMedia,
                isVoice && styles.bubbleVoice,
              ]}
            >
              {renderContent(false)}
              <View style={styles.bubbleFooter}>
                <Text style={[styles.bubbleTime, isMediaCard && styles.bubbleTimeMedia]}>{timeStr}</Text>
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
                useCustomBubbleFill && isOwn && bubbleColor ? { backgroundColor: bubbleColor } : null,
                isMediaCard && styles.bubbleMedia,
                isVoice && styles.bubbleVoice,
                { maxWidth: maxBubbleWidth },
              ]}
            >
          {renderContent(true)}
          <View style={styles.bubbleFooter}>
            <Text style={[styles.bubbleTime, styles.bubbleTimeOwn, isMediaCard && styles.bubbleTimeMedia]}>
              {timeStr}
            </Text>
            {statusIcon()}
          </View>
        </View>
      )}
    </Pressable>
  );

  return (
    <SwipeReplyRow enabled={!selectionMode && !!onReply && !msg.is_deleted} onReply={() => onReply?.()}>
      {bubble}
    </SwipeReplyRow>
  );
}

export const MessageBubble = memo(MessageBubbleInner);

const styles = StyleSheet.create({
  albumUploadWrap: {
    position: 'relative',
    alignSelf: 'flex-start',
  },
  bubbleWrap: {
    marginBottom: 6,
    paddingHorizontal: 10,
  },
  bubbleWrapSelected: {
    opacity: 0.65,
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
    gap: 8,
  },
  otherContent: {
    flex: 1,
    minWidth: 0,
  },
  avatarWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarImg: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  avatarPlaceholder: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: chatTheme.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: chatTheme.accent,
    marginBottom: 2,
    marginLeft: 2,
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
  },
  bubbleOwn: {
    backgroundColor: chatTheme.bubbleOutgoing,
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: chatTheme.bubbleIncoming,
    borderBottomLeftRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: chatTheme.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  bubbleMedia: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  bubbleVoice: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
  deletedText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  deletedOwn: { color: 'rgba(17,24,39,0.6)' },
  deletedOther: { color: chatTheme.textMuted },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 3,
  },
  bubbleTime: {
    fontSize: 11,
    color: chatTheme.textMuted,
  },
  bubbleTimeOwn: {
    color: 'rgba(17,24,39,0.55)',
  },
  bubbleTimeMedia: {
    marginTop: 2,
  },
});
