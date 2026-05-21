import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { CachedImage } from '@/components/CachedImage';
import type { Message } from '@/lib/messaging';
import { layoutChatImageAlbum } from '@/lib/chatImageAlbumLayout';
import { messageImageUri } from '@/lib/chatImageAlbum';
import {
  CHAT_MEDIA_CARD_RADIUS,
  getChatMediaCardWidth,
} from '@/constants/chatMediaCardMetrics';

type Props = {
  messages: Message[];
  onPressImage?: (uri: string, message: Message) => void;
};

export function ChatImageAlbum({ messages, onPressImage }: Props) {
  const { width: winWidth } = useWindowDimensions();
  const cardW = getChatMediaCardWidth(winWidth);
  const layout = layoutChatImageAlbum(messages.length, cardW);

  return (
    <View style={[styles.outer, { width: cardW }]}>
      <View style={[styles.grid, { width: layout.width, height: layout.height }]}>
        {layout.cells.map((cell) => {
          const msg = messages[cell.index];
          if (!msg) return null;
          const uri = messageImageUri(msg);
          const isLast = layout.overflowCount > 0 && cell.index === layout.cells.length - 1;
          return (
            <Pressable
              key={msg.id}
              onPress={() => uri && onPressImage?.(uri, msg)}
              style={[
                styles.cell,
                {
                  left: cell.left,
                  top: cell.top,
                  width: cell.width,
                  height: cell.height,
                },
              ]}
            >
              {uri ? (
                <CachedImage uri={uri} style={StyleSheet.absoluteFillObject} contentFit="cover" priority="high" />
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
