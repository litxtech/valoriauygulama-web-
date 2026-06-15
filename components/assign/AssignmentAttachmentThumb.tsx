import { View, Image, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { PressableScale } from '@/components/premium/PressableScale';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  uri: string;
  type: 'image' | 'video';
  onRemove: () => void;
};

/** Loaded only when attachments exist — keeps assign screen bundle lighter on first paint. */
export function AssignmentAttachmentThumb({ uri, type, onRemove }: Props) {
  const safeUri = (uri || '').trim();
  if (!safeUri) return null;

  return (
    <View style={styles.wrap}>
      {type === 'video' ? (
        <Video
          source={{ uri: safeUri }}
          style={styles.thumb}
          resizeMode={ResizeMode.COVER}
          shouldPlay={false}
          isMuted
          useNativeControls={false}
        />
      ) : (
        <Image source={{ uri: safeUri }} style={styles.thumb} resizeMode="cover" />
      )}
      <PressableScale style={styles.remove} onPress={onRemove} scaleTo={0.9}>
        <Ionicons name="close-circle" size={24} color="#fff" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginRight: 10, position: 'relative' },
  thumb: { width: 88, height: 88, borderRadius: 12, backgroundColor: '#e2e8f0' },
  remove: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 14,
  },
});
