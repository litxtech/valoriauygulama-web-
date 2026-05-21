import { View, StyleSheet } from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { CachedImage } from '@/components/CachedImage';

type Props = {
  posterUri?: string | null;
  videoUri?: string | null;
  style?: object;
};

/** Yerel poster (JPEG) veya ilk kare — anında önizleme. */
export function ChatVideoPoster({ posterUri, videoUri, style }: Props) {
  const frameStyle = [StyleSheet.absoluteFillObject, style];

  if (posterUri) {
    return <CachedImage uri={posterUri} style={frameStyle} contentFit="cover" priority="high" />;
  }

  if (videoUri) {
    return (
      <Video
        source={{ uri: videoUri }}
        style={frameStyle}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isMuted
        useNativeControls={false}
      />
    );
  }

  return <View style={[frameStyle, styles.placeholder]} />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#1a1a22',
  },
});
