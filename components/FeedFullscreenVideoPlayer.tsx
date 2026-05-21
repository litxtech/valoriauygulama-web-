import { forwardRef, useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';
import { CachedImage } from '@/components/CachedImage';

function naturalVideoDimensions(ns: {
  width: number;
  height: number;
  orientation?: 'portrait' | 'landscape';
}) {
  let w = Math.max(1, ns.width);
  let h = Math.max(1, ns.height);
  if (ns.orientation === 'portrait' && w > h) [w, h] = [h, w];
  else if (ns.orientation === 'landscape' && h > w) [w, h] = [h, w];
  return { width: w, height: h };
}

function fitMediaInBox(boxW: number, boxH: number, mediaW: number, mediaH: number) {
  const scale = Math.min(boxW / mediaW, boxH / mediaH);
  return {
    width: Math.max(1, Math.round(mediaW * scale)),
    height: Math.max(1, Math.round(mediaH * scale)),
  };
}

type Props = {
  uri: string;
  /** Karttaki JPEG poster — anında gösterilir, video hazır olunca kalkar */
  posterUri?: string | null;
  onReady?: () => void;
  onPlaybackStatusUpdate?: (status: AVPlaybackStatus) => void;
  progressUpdateIntervalMillis?: number;
};

/** Tam ekran: poster anında, video hemen CONTAIN ile başlar; boyut gelince ince ayar. */
export const FeedFullscreenVideoPlayer = forwardRef<Video, Props>(function FeedFullscreenVideoPlayer(
  { uri, posterUri, onReady, onPlaybackStatusUpdate, progressUpdateIntervalMillis },
  ref
) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const boxW = screenW;
  const boxH = Math.max(200, screenH - insets.top - insets.bottom);

  const poster = (posterUri ?? '').trim();
  const [showPoster, setShowPoster] = useState(poster.length > 4);
  const [fitted, setFitted] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setShowPoster(poster.length > 4);
    setFitted(null);
  }, [uri, poster]);

  const onDisplayReady = useCallback(
    (naturalSize: { width: number; height: number; orientation?: 'portrait' | 'landscape' }) => {
      setShowPoster(false);
      const { width: vw, height: vh } = naturalVideoDimensions(naturalSize);
      setFitted(fitMediaInBox(boxW, boxH, vw, vh));
      onReady?.();
    },
    [boxW, boxH, onReady]
  );

  const handleStatus = useCallback(
    (status: AVPlaybackStatus) => {
      onPlaybackStatusUpdate?.(status);
      if (!status.isLoaded) return;
      const ns = status.naturalSize;
      if (ns?.width && ns?.height) onDisplayReady(ns);
      else if (status.isPlaying) {
        setShowPoster(false);
        onReady?.();
      }
    },
    [onDisplayReady, onPlaybackStatusUpdate, onReady]
  );

  const videoSize = fitted ?? { width: boxW, height: boxH };

  return (
    <View
      style={[
        styles.stage,
        { width: screenW, height: screenH, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {showPoster && poster.length > 4 ? (
        <CachedImage
          uri={poster}
          style={StyleSheet.absoluteFillObject}
          contentFit="contain"
          priority="high"
          transition={0}
          pointerEvents="none"
        />
      ) : null}
      <Video
        ref={ref}
        key={uri}
        source={{ uri }}
        style={videoSize}
        resizeMode={fitted ? ResizeMode.STRETCH : ResizeMode.CONTAIN}
        shouldPlay
        isMuted={false}
        isLooping={false}
        useNativeControls={false}
        progressUpdateIntervalMillis={progressUpdateIntervalMillis}
        onPlaybackStatusUpdate={handleStatus}
        onReadyForDisplay={(e) => onDisplayReady(e.naturalSize)}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  stage: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
