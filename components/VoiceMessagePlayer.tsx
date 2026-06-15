/**
 * Modern sesli mesaj kartı — oynatma + dalga üzerinde ileri/geri sarma
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Platform,
  PanResponder,
  LayoutChangeEvent,
} from 'react-native';
import { Audio, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { chatTheme } from '@/constants/chatTheme';
import { formatVoiceTime } from '@/lib/voiceMessageMeta';
import { prepareChatAudioPlayback } from '@/lib/chatAudioPlayback';
import {
  notifyVoicePlaybackFinished,
  notifyVoicePlaybackStarted,
  registerVoicePlayer,
} from '@/lib/chatVoiceQueue';

const BAR_COUNT = 28;

type Props = {
  messageId?: string;
  uri: string;
  isOwn: boolean;
  durationSec?: number | null;
  uploading?: boolean;
};

function pseudoWaveHeights(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const n = ((h + i * 17) % 100) / 100;
    return 0.28 + n * 0.72;
  });
}

function isAtEnd(status: AVPlaybackStatus): boolean {
  if (!status.isLoaded) return false;
  if (status.didJustFinish) return true;
  const dur = status.durationMillis ?? 0;
  const pos = status.positionMillis ?? 0;
  return dur > 0 && pos >= dur - 80;
}

export function VoiceMessagePlayer({ messageId, uri, isOwn, durationSec: propDuration, uploading }: Props) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState((propDuration ?? 0) * 1000);
  const [scrubPreviewMs, setScrubPreviewMs] = useState<number | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveWidthRef = useRef(1);
  const isScrubbingRef = useRef(false);
  const wasPlayingRef = useRef(false);

  const accent = isOwn ? '#FFFFFF' : chatTheme.accent;
  const muted = isOwn ? 'rgba(255,255,255,0.8)' : '#6B7280';
  const playBg = isOwn ? 'rgba(255,255,255,0.28)' : 'rgba(184,137,0,0.18)';
  const barInactive = isOwn ? 'rgba(255,255,255,0.35)' : 'rgba(184,137,0,0.28)';
  const micBg = isOwn ? 'rgba(255,255,255,0.22)' : 'rgba(184,137,0,0.14)';
  const scrubThumbBg = isOwn ? '#FFFFFF' : chatTheme.accent;

  const bars = useMemo(() => pseudoWaveHeights(uri || 'voice'), [uri]);
  const totalMs = durationMs > 0 ? durationMs : Math.max(positionMs, propDuration ? propDuration * 1000 : 1000);
  const effectivePositionMs = scrubPreviewMs ?? positionMs;
  const progress = totalMs > 0 ? Math.min(1, effectivePositionMs / totalMs) : 0;
  const activeBars = Math.floor(progress * BAR_COUNT);
  const isScrubbing = scrubPreviewMs != null;

  const displayTime =
    playing || isScrubbing || positionMs > 0
      ? `${formatVoiceTime(effectivePositionMs / 1000)} / ${formatVoiceTime(totalMs / 1000)}`
      : formatVoiceTime(totalMs / 1000);

  const stopTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const startTick = useCallback(() => {
    stopTick();
    tickRef.current = setInterval(() => {
      void (async () => {
        const sound = soundRef.current;
        if (!sound || isScrubbingRef.current) return;
        try {
          const s = await sound.getStatusAsync();
          if (s.isLoaded && s.positionMillis != null) setPositionMs(s.positionMillis);
        } catch {
          // ignore
        }
      })();
    }, 120);
  }, [stopTick]);

  const unloadSound = useCallback(async () => {
    stopTick();
    const sound = soundRef.current;
    soundRef.current = null;
    if (!sound) return;
    try {
      await sound.unloadAsync();
    } catch {
      // ignore
    }
  }, [stopTick]);

  const onPlaybackStatusUpdate = useCallback(
    (s: AVPlaybackStatus) => {
      if (!s.isLoaded || isScrubbingRef.current) return;
      if (s.durationMillis != null && s.durationMillis > 0) {
        setDurationMs(s.durationMillis);
      }
      if (s.positionMillis != null) {
        setPositionMs(s.positionMillis);
      }
      if (s.didJustFinish) {
        setPlaying(false);
        setPositionMs(0);
        stopTick();
        if (messageId) notifyVoicePlaybackFinished(messageId);
      }
    },
    [stopTick, messageId]
  );

  const ensureSoundReady = useCallback(async (): Promise<Audio.Sound | null> => {
    if (!uri || uploading) return null;
    await prepareChatAudioPlayback();
    let sound = soundRef.current;
    if (sound) {
      try {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) return sound;
      } catch {
        // fall through
      }
      await unloadSound();
      sound = null;
    }
    setLoading(true);
    try {
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri },
        { shouldPlay: false, progressUpdateIntervalMillis: 120 },
        onPlaybackStatusUpdate
      );
      soundRef.current = newSound;
      const status = await newSound.getStatusAsync();
      if (status.isLoaded && status.durationMillis) {
        setDurationMs(status.durationMillis);
      }
      return newSound;
    } catch {
      soundRef.current = null;
      return null;
    } finally {
      setLoading(false);
    }
  }, [uri, uploading, unloadSound, onPlaybackStatusUpdate]);

  const ratioFromX = useCallback((locationX: number) => {
    const w = waveWidthRef.current;
    if (w <= 0) return 0;
    return Math.max(0, Math.min(1, locationX / w));
  }, []);

  const seekToRatio = useCallback(
    async (ratio: number, resume?: boolean) => {
      const sound = await ensureSoundReady();
      if (!sound) return;
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      const dur = status.durationMillis ?? totalMs;
      const targetMs = Math.round(Math.max(0, Math.min(1, ratio)) * dur);
      await sound.setPositionAsync(targetMs);
      setPositionMs(targetMs);
      setScrubPreviewMs(null);
      if (resume) {
        await sound.playAsync();
        setPlaying(true);
        startTick();
      }
    },
    [ensureSoundReady, totalMs, startTick]
  );

  const seekByDelta = useCallback(
    async (deltaSec: number) => {
      const sound = await ensureSoundReady();
      if (!sound) return;
      const status = await sound.getStatusAsync();
      if (!status.isLoaded) return;
      const dur = status.durationMillis ?? totalMs;
      const current = status.positionMillis ?? positionMs;
      const targetMs = Math.max(0, Math.min(dur, current + deltaSec * 1000));
      await sound.setPositionAsync(targetMs);
      setPositionMs(targetMs);
      if (playing) startTick();
    },
    [ensureSoundReady, totalMs, positionMs, playing, startTick]
  );

  const loadAndPlay = useCallback(async () => {
    const sound = await ensureSoundReady();
    if (!sound) return;
    if (messageId) notifyVoicePlaybackStarted(messageId);
    await sound.playAsync();
    setPlaying(true);
    startTick();
  }, [ensureSoundReady, startTick, messageId]);

  const startPlayback = useCallback(async () => {
    if (!uri || uploading) return;
    try {
      await prepareChatAudioPlayback();
      const existing = soundRef.current;
      if (existing) {
        const status = await existing.getStatusAsync();
        if (!status.isLoaded) {
          await unloadSound();
        } else {
          if (status.isPlaying) return;
          if (isAtEnd(status)) {
            await existing.setPositionAsync(0);
            setPositionMs(0);
          }
          if (messageId) notifyVoicePlaybackStarted(messageId);
          await existing.playAsync();
          setPlaying(true);
          startTick();
          return;
        }
      }
      await loadAndPlay();
    } catch {
      setPlaying(false);
      setLoading(false);
      stopTick();
      soundRef.current = null;
    }
  }, [uri, uploading, unloadSound, loadAndPlay, messageId, startTick, stopTick]);

  const stopPlayback = useCallback(async () => {
    stopTick();
    setPlaying(false);
    const sound = soundRef.current;
    if (!sound) return;
    try {
      const status = await sound.getStatusAsync();
      if (status.isLoaded && status.isPlaying) {
        await sound.pauseAsync();
      }
    } catch {
      // ignore
    }
  }, [stopTick]);

  const togglePlay = async () => {
    if (!uri || uploading) return;
    try {
      await prepareChatAudioPlayback();
      const existing = soundRef.current;
      if (existing) {
        const status = await existing.getStatusAsync();
        if (!status.isLoaded) {
          await unloadSound();
        } else {
          if (status.isPlaying) {
            await existing.pauseAsync();
            setPlaying(false);
            stopTick();
            return;
          }
          if (isAtEnd(status)) {
            await existing.setPositionAsync(0);
            setPositionMs(0);
          }
          if (messageId) notifyVoicePlaybackStarted(messageId);
          await existing.playAsync();
          setPlaying(true);
          startTick();
          return;
        }
      }
      await loadAndPlay();
    } catch {
      setPlaying(false);
      setLoading(false);
      stopTick();
      soundRef.current = null;
    }
  };

  useEffect(() => {
    if (!messageId || uploading) return;
    return registerVoicePlayer({
      messageId,
      play: startPlayback,
      stop: stopPlayback,
    });
  }, [messageId, uploading, startPlayback, stopPlayback]);

  const wavePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !uploading && !loading,
        onMoveShouldSetPanResponder: () => !uploading && !loading,
        onPanResponderGrant: (evt) => {
          isScrubbingRef.current = true;
          wasPlayingRef.current = playing;
          if (playing && soundRef.current) {
            void soundRef.current.pauseAsync().catch(() => {});
            setPlaying(false);
            stopTick();
          }
          const preview = Math.round(ratioFromX(evt.nativeEvent.locationX) * totalMs);
          setScrubPreviewMs(preview);
        },
        onPanResponderMove: (evt) => {
          const preview = Math.round(ratioFromX(evt.nativeEvent.locationX) * totalMs);
          setScrubPreviewMs(preview);
        },
        onPanResponderRelease: (evt) => {
          isScrubbingRef.current = false;
          void seekToRatio(ratioFromX(evt.nativeEvent.locationX), wasPlayingRef.current);
        },
        onPanResponderTerminate: () => {
          isScrubbingRef.current = false;
          setScrubPreviewMs(null);
        },
      }),
    [uploading, loading, playing, ratioFromX, totalMs, seekToRatio, stopTick]
  );

  const onWaveLayout = (e: LayoutChangeEvent) => {
    waveWidthRef.current = e.nativeEvent.layout.width;
  };

  useEffect(() => {
    return () => {
      void unloadSound();
    };
  }, [unloadSound]);

  useEffect(() => {
    void unloadSound();
    setPlaying(false);
    setPositionMs(0);
    setScrubPreviewMs(null);
    setLoading(false);
  }, [uri, unloadSound]);

  useEffect(() => {
    if (propDuration && propDuration > 0) {
      setDurationMs(propDuration * 1000);
    }
  }, [propDuration]);

  return (
    <View style={[styles.wrap, isOwn ? styles.wrapOwn : styles.wrapOther]}>
      <Pressable
        style={[styles.playBtn, { backgroundColor: playBg }]}
        onPress={() => void togglePlay()}
        disabled={loading || uploading}
        hitSlop={6}
      >
        {loading || uploading ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Ionicons
            name={playing ? 'pause' : 'play'}
            size={22}
            color={accent}
            style={playing ? undefined : styles.playOffset}
          />
        )}
      </Pressable>

      <View style={styles.body}>
        <View
          style={styles.waveTouch}
          onLayout={onWaveLayout}
          {...wavePanResponder.panHandlers}
          accessibilityRole="adjustable"
          accessibilityLabel="Ses konumu"
          accessibilityHint="Sürükleyerek veya dokunarak ileri geri sarın"
        >
          <View style={styles.waveRow}>
            {bars.map((h, i) => {
              const lit = i <= activeBars;
              return (
                <View
                  key={i}
                  style={[
                    styles.bar,
                    {
                      height: 8 + h * 18,
                      backgroundColor: lit ? accent : barInactive,
                    },
                  ]}
                />
              );
            })}
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.scrubThumb,
              {
                left: `${Math.max(0, Math.min(100, progress * 100))}%`,
                backgroundColor: scrubThumbBg,
                opacity: isScrubbing || playing || positionMs > 0 ? 1 : 0.55,
              },
            ]}
          />
        </View>
        <View style={styles.timeRow}>
          <Pressable
            onPress={() => void seekByDelta(-10)}
            disabled={loading || uploading}
            hitSlop={8}
            accessibilityLabel="10 saniye geri"
          >
            <Ionicons name="play-back" size={14} color={muted} />
          </Pressable>
          <Text style={[styles.time, { color: muted }]}>{displayTime}</Text>
          <Pressable
            onPress={() => void seekByDelta(10)}
            disabled={loading || uploading}
            hitSlop={8}
            accessibilityLabel="10 saniye ileri"
          >
            <Ionicons name="play-forward" size={14} color={muted} />
          </Pressable>
        </View>
      </View>

      <View style={[styles.micBadge, { backgroundColor: micBg }]}>
        <Ionicons name="mic" size={14} color={accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 210,
    maxWidth: 280,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 18,
  },
  wrapOwn: {
    backgroundColor: chatTheme.bubbleOutgoing,
    ...Platform.select({
      ios: {
        shadowColor: '#8B6914',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  wrapOther: {
    backgroundColor: '#FFFBF3',
    borderWidth: 1,
    borderColor: 'rgba(184,137,0,0.28)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.06,
        shadowRadius: 2,
      },
      android: { elevation: 1 },
    }),
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playOffset: {
    marginLeft: 2,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  waveTouch: {
    height: 32,
    justifyContent: 'center',
    position: 'relative',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 26,
  },
  bar: {
    flex: 1,
    borderRadius: 2,
    minWidth: 2,
    maxWidth: 4,
  },
  scrubThumb: {
    position: 'absolute',
    top: '50%',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: -4,
    marginLeft: -4,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 1,
      },
      android: { elevation: 2 },
    }),
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  time: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  micBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
