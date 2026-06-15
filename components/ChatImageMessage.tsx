import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { CachedImage } from '@/components/CachedImage';
import {
  CHAT_MEDIA_CARD_RADIUS,
  getChatMediaCardWidth,
} from '@/constants/chatMediaCardMetrics';

type Props = {
  uri: string;
  onPress?: (uri: string) => void;
  overlay?: ReactNode;
};

export function ChatImageMessage({ uri, onPress, overlay }: Props) {
  const { width: winWidth } = useWindowDimensions();
  const cardW = getChatMediaCardWidth(winWidth);
  const cardH = Math.round(cardW * 0.78);

  return (
    <View style={[styles.outer, { width: cardW }]}>
      <Pressable
        onPress={() => onPress?.(uri)}
        style={[styles.frame, { width: cardW, height: cardH }]}
        accessibilityRole="image"
      >
        <CachedImage uri={uri} style={StyleSheet.absoluteFillObject} contentFit="cover" priority="high" />
        {overlay}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    backgroundColor: 'transparent',
    marginVertical: 2,
    alignSelf: 'flex-start',
  },
  frame: {
    borderRadius: CHAT_MEDIA_CARD_RADIUS,
    overflow: 'hidden',
    backgroundColor: '#141418',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 6,
  },
});
