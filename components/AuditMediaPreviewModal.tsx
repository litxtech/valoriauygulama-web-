import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, View, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import { CachedImage } from '@/components/CachedImage';

type AuditPreviewMedia = {
  type: 'image' | 'video';
  url: string;
};

type Props = {
  visible: boolean;
  media: AuditPreviewMedia | null;
  onClose: () => void;
};

export function AuditMediaPreviewModal({ visible, media, onClose }: Props) {
  const videoRef = useRef<Video>(null);

  useEffect(() => {
    if (!visible) {
      void videoRef.current?.pauseAsync();
    }
  }, [visible]);

  if (!media) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.content} onPress={(e) => e.stopPropagation()}>
          {media.type === 'image' ? (
            <CachedImage uri={media.url} style={styles.media} contentFit="contain" priority="high" />
          ) : (
            <Video
              ref={videoRef}
              source={{ uri: media.url }}
              style={styles.media}
              shouldPlay
              useNativeControls
              resizeMode={ResizeMode.CONTAIN}
            />
          )}

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  media: {
    width: '100%',
    height: '100%',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
