import { View, Text, Pressable, StyleSheet, ActivityIndicator, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Message } from '@/lib/messaging';
import { messageVideoThumbUri } from '@/lib/chatImageAlbum';
import { layoutChatImageAlbum } from '@/lib/chatImageAlbumLayout';
import { resolveChatVideoPreviewSources } from '@/lib/chatVideoPreview';
import { ChatVideoPoster } from '@/components/ChatVideoPoster';
import type { ChatVideoUploadState } from '@/lib/chatVideoBatchSend';
import {
  CHAT_MEDIA_CARD_RADIUS,
  getChatMediaCardWidth,
} from '@/constants/chatMediaCardMetrics';

type Props = {
  messages: Message[];
  isOwn?: boolean;
  videoUploads?: Record<string, ChatVideoUploadState>;
  onPressVideo?: (msg: Message) => void;
  onRetryVideo?: (msg: Message) => void;
  deferLocalVideo?: boolean;
};

function uploadForMessage(msg: Message, map?: Record<string, ChatVideoUploadState>) {
  if (!map) return undefined;
  return map[msg.id] ?? Object.values(map).find((s) => s.messageId === msg.id);
}

export function ChatVideoAlbum({
  messages,
  isOwn,
  videoUploads,
  onPressVideo,
  onRetryVideo,
  deferLocalVideo = false,
}: Props) {
  const { width: winWidth } = useWindowDimensions();
  const cardW = getChatMediaCardWidth(winWidth);
  const layout = layoutChatImageAlbum(messages.length, cardW);

  return (
    <View style={[styles.outer, { width: cardW }]}>
      <View style={[styles.grid, { width: layout.width, height: layout.height }]}>
        {layout.cells.map((cell) => {
          const msg = messages[cell.index];
          if (!msg) return null;
          const preview = resolveChatVideoPreviewSources(msg.media_url, msg.media_thumbnail);
          const thumb = messageVideoThumbUri(msg);
          const upload = uploadForMessage(msg, videoUploads);
          const failed = upload?.phase === 'failed';
          const busy = upload && upload.phase !== 'done' && upload.phase !== 'failed';
          const isLast = layout.overflowCount > 0 && cell.index === layout.cells.length - 1;

          return (
            <Pressable
              key={`${msg.id}-${cell.index}`}
              onPress={() => {
                if (failed && onRetryVideo) onRetryVideo(msg);
                else onPressVideo?.(msg);
              }}
              style={[
                styles.cell,
                { left: cell.left, top: cell.top, width: cell.width, height: cell.height },
              ]}
            >
              {preview.hasEarlyPreview || thumb ? (
                <ChatVideoPoster
                  posterUri={preview.posterUri || thumb || null}
                  videoUri={preview.videoUri}
                  deferLocalVideo={deferLocalVideo}
                />
              ) : (
                <View style={[StyleSheet.absoluteFillObject, styles.placeholder]} />
              )}
              <View style={styles.playBadge}>
                <Ionicons name="play" size={18} color="#fff" style={{ marginLeft: 2 }} />
              </View>
              {busy ? (
                <View style={styles.progressOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                  {upload.progress > 0 ? (
                    <Text style={styles.progressText}>{Math.round(upload.progress)}%</Text>
                  ) : null}
                </View>
              ) : null}
              {failed ? (
                <View style={styles.progressOverlay}>
                  <Ionicons name="refresh" size={22} color="#fff" />
                </View>
              ) : null}
              {isLast ? (
                <View style={styles.moreOverlay}>
                  <Text style={styles.moreText}>+{layout.overflowCount}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: 'transparent',
    marginVertical: 2,
    alignSelf: 'flex-start',
  },
  grid: {
    borderRadius: CHAT_MEDIA_CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#141418',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
  cell: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#1a1a20',
  },
  placeholder: {
    backgroundColor: '#252530',
  },
  playBadge: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
  },
  progressText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  moreOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
});
