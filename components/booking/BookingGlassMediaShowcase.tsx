import { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BookingMediaLightbox } from '@/components/booking/BookingMediaLightbox';

type Props = {
  images: string[];
  videoUrl?: string | null;
  title: string;
};

/** Apple tarzı şeffaf çerçeveli oda tanıtımı (video + görseller) */
export function BookingGlassMediaShowcase({ images, videoUrl, title }: Props) {
  const { width } = useWindowDimensions();
  const wide = width >= 768;
  const pad = wide ? 48 : 44;
  const mediaW = Math.min(width - pad, wide ? 1100 : 560);
  const mediaH = Math.round(mediaW * (wide ? 0.52 : 0.62));
  const thumbW = wide ? Math.min(320, Math.round(mediaW * 0.28)) : 168;
  const thumbH = Math.round(thumbW * 0.72);
  const videoRef = useRef<Video>(null);
  const [playing, setPlaying] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const onStatus = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setPlaying(status.isPlaying);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>Tanıtım</Text>
      <Text style={[styles.title, wide && styles.titleWide]}>{title}</Text>

      {videoUrl ? (
        <View style={[styles.glassFrame, { width: mediaW, height: mediaH }]}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={28} tint="light" style={StyleSheet.absoluteFillObject} />
          ) : (
            <View style={[StyleSheet.absoluteFillObject, styles.androidGlass]} />
          )}
          <LinearGradient
            colors={['rgba(255,255,255,0.55)', 'rgba(255,255,255,0.12)']}
            style={styles.glassSheen}
            pointerEvents="none"
          />
          <View style={styles.mediaInner}>
            <Video
              ref={videoRef}
              source={{ uri: videoUrl }}
              style={styles.mediaFill}
              resizeMode={ResizeMode.COVER}
              isLooping
              isMuted={!playing}
              shouldPlay={playing}
              onPlaybackStatusUpdate={onStatus}
              useNativeControls={false}
            />
            <TouchableOpacity
              style={styles.playBtn}
              activeOpacity={0.9}
              onPress={async () => {
                if (playing) {
                  await videoRef.current?.pauseAsync();
                  setPlaying(false);
                } else {
                  await videoRef.current?.playAsync();
                  setPlaying(true);
                }
              }}
            >
              <Ionicons name={playing ? 'pause' : 'play'} size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {images.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.thumbs}
          decelerationRate="fast"
        >
          {images.map((uri, i) => (
            <TouchableOpacity
              key={`${uri}-${i}`}
              style={[styles.thumbGlass, { width: thumbW, height: thumbH }]}
              activeOpacity={0.92}
              onPress={() => {
                setLightboxIndex(i);
                setLightbox(true);
              }}
            >
              {Platform.OS === 'ios' ? (
                <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFillObject} />
              ) : (
                <View style={[StyleSheet.absoluteFillObject, styles.androidGlass]} />
              )}
              <View style={styles.thumbInner}>
                <Image source={{ uri }} style={styles.thumbImg} resizeMode="cover" />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      <BookingMediaLightbox
        visible={lightbox}
        uris={images}
        initialIndex={lightboxIndex}
        onClose={() => setLightbox(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 22, gap: 12, alignItems: 'stretch' },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#0f766e',
  },
  title: { fontSize: 22, fontWeight: '900', color: '#0b1220', marginBottom: 4 },
  titleWide: { fontSize: 32, letterSpacing: Platform.OS === 'web' ? -0.6 : 0 },
  glassFrame: {
    borderRadius: 28,
    padding: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: 'rgba(255,255,255,0.28)',
    alignSelf: 'center',
    maxWidth: '100%',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  androidGlass: { backgroundColor: 'rgba(255,255,255,0.35)' },
  glassSheen: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
  },
  mediaInner: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#0f172a',
  },
  mediaFill: { width: '100%', height: '100%' },
  playBtn: {
    position: 'absolute',
    alignSelf: 'center',
    top: '42%',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  thumbs: { gap: 14, paddingVertical: 4, paddingRight: 8 },
  thumbGlass: {
    borderRadius: 22,
    padding: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  thumbInner: { flex: 1, borderRadius: 16, overflow: 'hidden', backgroundColor: '#e2e8f0' },
  thumbImg: {
    width: '100%',
    height: '100%',
    ...(Platform.OS === 'web' ? ({ objectFit: 'cover' } as object) : null),
  },
});
