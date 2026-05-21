import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { theme } from '@/constants/theme';

type Props = {
  thumbUri: string | null;
  isVideo: boolean;
};

/** Bugün şeridi: yalnızca poster JPEG (video decode yok — hızlı). */
export function FeedTodayHighlightThumb({ thumbUri, isVideo }: Props) {
  const thumb = (thumbUri ?? '').trim();

  if (thumb.length > 4) {
    return (
      <CachedImage uri={thumb} style={styles.img} contentFit="cover" transition={0} priority="high" />
    );
  }

  if (isVideo) {
    return (
      <View style={styles.ph}>
        <Ionicons name="videocam" size={22} color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.ph}>
      <Ionicons name="time-outline" size={20} color={theme.colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  img: { width: '100%', height: '100%' },
  ph: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${theme.colors.primary}14`,
  },
});
