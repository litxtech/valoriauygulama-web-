import { useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Pressable, Text } from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

type Props = {
  uri: string;
  onFirstPlay?: () => void;
};

export function PartnerCameraRequestVideoPlayer({ uri, onFirstPlay }: Props) {
  const ref = useRef<Video>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const playedRef = useRef(false);

  const handleStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (status.isPlaying && !playedRef.current) {
      playedRef.current = true;
      onFirstPlay?.();
    }
  };

  return (
    <View style={styles.wrap}>
      {loading ? (
        <View style={styles.overlay}>
          <ActivityIndicator color={partnerTheme.accent} />
        </View>
      ) : null}
      {error ? (
        <View style={styles.overlay}>
          <Ionicons name="alert-circle-outline" size={28} color={partnerTheme.danger} />
          <Text style={styles.errorText}>Video oynatılamadı</Text>
        </View>
      ) : (
        <Video
          ref={ref}
          style={styles.video}
          source={{ uri }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          onLoad={() => setLoading(false)}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
          onPlaybackStatusUpdate={handleStatus}
        />
      )}
      {!error ? (
        <Pressable
          style={styles.replayHint}
          onPress={() => void ref.current?.replayAsync()}
          accessibilityLabel="Videoyu baştan oynat"
        >
          <Ionicons name="refresh-outline" size={14} color={partnerTheme.muted} />
          <Text style={styles.replayText}>Baştan oynat</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: partnerRadii.lg,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    gap: 8,
    zIndex: 2,
  },
  errorText: { color: partnerTheme.muted, fontSize: 13 },
  replayHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    backgroundColor: partnerTheme.cardElevated,
  },
  replayText: { color: partnerTheme.muted, fontSize: 12, fontWeight: '600' },
});
