import { Modal, StyleSheet, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { FeedZoomableMedia } from '@/components/FeedZoomableMedia';

type Props = {
  uri: string | null;
  onClose: () => void;
};

/** Sohbet resmi tam ekran — pinch zoom + ✕ / tek dokunuş ile kapanır. */
export function ChatFullscreenImageModal({ uri, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={!!uri}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {uri ? (
          <FeedZoomableMedia onDismiss={onClose} style={styles.zoom}>
            <CachedImage
              key={uri}
              uri={uri}
              style={{ width, height }}
              contentFit="contain"
            />
          </FeedZoomableMedia>
        ) : null}
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 8, right: Math.max(insets.right, 16) }]}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoom: { ...StyleSheet.absoluteFillObject },
  closeBtn: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
});
