/**
 * Sohbet Mux videosu — Telegram tarzı kart, tam ekran (poster + ön yükleme).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  TouchableOpacity,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ChatVideoPoster } from '@/components/ChatVideoPoster';
import { resolveChatVideoPreviewSources } from '@/lib/chatVideoPreview';
import {
  getMuxHlsPlaybackUrl,
  getMuxThumbnailFromMessage,
  getMuxVideoMessageState,
  isLocalVideoPreviewUrl,
} from '@/lib/muxChat';
import type { ChatVideoUploadPhase } from '@/lib/chatVideoBatchSend';

const CARD_MAX_W = 300;
const CARD_MIN_W = 268;
const CARD_WIDTH_RATIO = 0.76;
const CARD_ASPECT = 16 / 10;
const PREVIEW_LOOP_MS = 3000;

type Props = {
  mediaUrl: string | null;
  mediaThumbnail?: string | null;
  isOwn?: boolean;
  durationSec?: number | null;
  uploadProgress?: number;
  uploadPhase?: ChatVideoUploadPhase;
  uploadFailed?: boolean;
  onRetry?: () => void;
  onCancelUpload?: () => void;
  /** false = yalnızca poster (Android oda açılışı); true = HLS preload */
  preloadEnabled?: boolean;
};

function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function PendingShimmer({ isOwn }: { isOwn: boolean }) {
  const pulse = useSharedValue(0.35);
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(0.85, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.35, { duration: 900, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [pulse]);
  const ringStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.92 + pulse.value * 0.08 }],
  }));
  return (
    <Animated.View style={[styles.pendingRing, ringStyle, isOwn && styles.pendingRingOwn]}>
      <ActivityIndicator size="small" color={isOwn ? '#fff' : theme.colors.primary} />
    </Animated.View>
  );
}

function uploadPhaseLabel(phase: ChatVideoUploadPhase | undefined, t: (k: string) => string): string {
  switch (phase) {
    case 'compressing':
      return t('chatVideoCompressing');
    case 'uploading':
      return t('chatVideoUploading');
    case 'processing':
      return t('chatVideoProcessing');
    case 'creating':
    case 'queued':
      return t('chatVideoSendingWait');
    default:
      return t('chatVideoSendingWait');
  }
}

export function ChatVideoMessage({
  mediaUrl,
  mediaThumbnail,
  isOwn = false,
  durationSec,
  uploadProgress,
  uploadPhase,
  uploadFailed = false,
  onRetry,
  onCancelUpload,
  preloadEnabled = true,
}: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const cardW = Math.min(CARD_MAX_W, Math.max(CARD_MIN_W, Math.round(winWidth * CARD_WIDTH_RATIO)));
  const cardH = Math.round(cardW / CARD_ASPECT);
  const frameStyle = { width: cardW, height: cardH };
  const [fullscreen, setFullscreen] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [preloaded, setPreloaded] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [playbackSec, setPlaybackSec] = useState<number | null>(durationSec ?? null);
  const preloadRef = useRef<Video>(null);
  const previewRef = useRef<Video>(null);
  const playerRef = useRef<Video>(null);
  const previewActiveRef = useRef(false);
  const scale = useSharedValue(1);

  const state = getMuxVideoMessageState(mediaUrl);
  const hls = getMuxHlsPlaybackUrl(mediaUrl);
  const localPreviewUri = (() => {
    if (isLocalVideoPreviewUrl(mediaUrl)) return mediaThumbnail?.trim() || null;
    const thumb = mediaThumbnail?.trim();
    if (thumb && (thumb.startsWith('file://') || thumb.startsWith('content://'))) return thumb;
    return null;
  })();
  const preview = resolveChatVideoPreviewSources(mediaUrl, mediaThumbnail);
  const thumb = localPreviewUri || getMuxThumbnailFromMessage(mediaUrl, mediaThumbnail);
  /** Bekleme kartı yalnızca HLS yokken; poster olsa bile `hasEarlyPreview` kullanılmaz (aksi halde oynatılabilir videoda “Oynatıma hazırlanıyor” takılı kalırdı). */
  const clientUploadActive =
    Boolean(uploadPhase) && uploadPhase !== 'done' && uploadPhase !== 'failed';
  const canPlay = Boolean(hls) && !uploadFailed;
  const statusLabel = uploadPhaseLabel(uploadPhase, t);
  const progressPct = Math.max(0, Math.min(100, uploadProgress ?? 0));
  const showProgressBar =
    clientUploadActive &&
    uploadProgress !== undefined &&
    (progressPct > 0 || uploadPhase === 'uploading' || uploadPhase === 'compressing');

  const playerWidth = winWidth;
  const playerHeight = Math.max(280, winHeight - insets.top - insets.bottom - 8);
  const enablePreload = preloadEnabled;
  const deferLocalVideo = Platform.OS === 'android' && !preloadEnabled;

  useEffect(() => {
    if (!enablePreload || !hls) {
      setPreloaded(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        await preloadRef.current?.loadAsync({ uri: hls }, { shouldPlay: false, isMuted: true }, false);
        if (!cancelled) setPreloaded(true);
      } catch {
        if (!cancelled) setPreloaded(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hls, enablePreload]);

  useEffect(() => {
    if (!fullscreen) {
      setVideoReady(false);
      setBuffering(false);
    }
  }, [fullscreen]);

  const onStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    setBuffering(status.isBuffering);
    if (!status.isBuffering && status.isPlaying !== undefined) {
      setVideoReady(true);
    }
    if (status.durationMillis && status.durationMillis > 0) {
      setPlaybackSec(Math.round(status.durationMillis / 1000));
    }
  }, []);

  const onPreviewStatus = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded || !previewActiveRef.current) return;
    if (status.positionMillis >= PREVIEW_LOOP_MS) {
      void previewRef.current?.setPositionAsync(0);
    }
  }, []);

  const stopPreview = useCallback(() => {
    previewActiveRef.current = false;
    setPreviewing(false);
    void previewRef.current?.pauseAsync();
    void previewRef.current?.setPositionAsync(0);
  }, []);

  const startPreview = useCallback(async () => {
    if (!hls || fullscreen || previewActiveRef.current) return;
    previewActiveRef.current = true;
    setPreviewing(true);
    try {
      await previewRef.current?.loadAsync(
        { uri: hls },
        { shouldPlay: true, isMuted: true, isLooping: false },
        preloaded
      );
    } catch {
      previewActiveRef.current = false;
      setPreviewing(false);
    }
  }, [fullscreen, hls, preloaded]);

  useEffect(() => () => stopPreview(), [stopPreview]);

  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const openFullscreen = useCallback(() => {
    if (!canPlay || !hls) return;
    stopPreview();
    setVideoReady(false);
    setBuffering(true);
    setFullscreen(true);
    requestAnimationFrame(() => {
      void (async () => {
        try {
          await playerRef.current?.loadAsync(
            { uri: hls },
            { shouldPlay: true, isMuted: false },
            preloaded
          );
        } catch {
          await playerRef.current?.loadAsync({ uri: hls }, { shouldPlay: true }, true);
        }
      })();
    });
  }, [canPlay, hls, preloaded, stopPreview]);

  const closeFullscreen = useCallback(() => {
    void playerRef.current?.pauseAsync();
    setFullscreen(false);
  }, []);

  const durationLabel =
    playbackSec != null && playbackSec > 0 ? formatDuration(playbackSec) : null;

  const renderLocalOrThumb = () => {
    if (preview.hasEarlyPreview || thumb) {
      return (
        <ChatVideoPoster
          posterUri={preview.posterUri || thumb}
          videoUri={preview.videoUri}
          deferLocalVideo={deferLocalVideo}
        />
      );
    }
    return null;
  };

  const renderFailedOverlay = () => (
    <Pressable
      style={styles.uploadOverlay}
      onLongPress={onCancelUpload}
      delayLongPress={400}
    >
      <Ionicons name="alert-circle" size={36} color="#fca5a5" />
      <Text style={styles.uploadFailText}>{t('chatVideoFailed')}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.85}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryBtnText}>{t('chatVideoRetry')}</Text>
        </TouchableOpacity>
      ) : null}
    </Pressable>
  );

  const renderActiveUploadOverlay = () => (
    <Pressable style={styles.uploadOverlay} onLongPress={onCancelUpload} delayLongPress={400}>
      <ActivityIndicator size="small" color="#fff" />
      <Text style={styles.uploadStatusText}>{statusLabel}</Text>
      {showProgressBar ? (
        <>
          <View style={styles.uploadTrack}>
            <View style={[styles.uploadFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.uploadPercent}>{progressPct}%</Text>
        </>
      ) : null}
    </Pressable>
  );

  if (!hls) {
    return (
      <View style={[styles.cardOuter, { width: cardW }]}>
      <View style={[styles.mediaFrame, frameStyle]}>
        {renderLocalOrThumb() ?? (
          <LinearGradient
            colors={isOwn ? ['#2a2418', '#1a160e'] : ['#1e2430', '#12151c']}
            style={StyleSheet.absoluteFillObject}
          />
        )}
        <LinearGradient colors={['transparent', 'rgba(0,0,0,0.55)']} style={styles.bottomGrad} />
        {uploadFailed ? (
          renderFailedOverlay()
        ) : clientUploadActive ? (
          renderActiveUploadOverlay()
        ) : (
          <View style={styles.pendingOverlay}>
            {Platform.OS === 'ios' ? (
              <BlurView intensity={28} tint="dark" style={styles.pendingBlur}>
                <PendingShimmer isOwn={isOwn} />
                <Text style={styles.pendingLabel}>
                  {state === 'error' ? t('chatVideoFailed') : t('chatVideoProcessing')}
                </Text>
              </BlurView>
            ) : (
              <View style={styles.pendingBlurAndroid}>
                <PendingShimmer isOwn={isOwn} />
                <Text style={styles.pendingLabel}>
                  {state === 'error' ? t('chatVideoFailed') : t('chatVideoProcessing')}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
      </View>
    );
  }

  return (
    <>
      <Animated.View style={[cardAnimStyle, styles.cardOuter, { width: cardW }]}>
        <Pressable
          onPress={openFullscreen}
          disabled={!canPlay}
          onPressIn={() => {
            scale.value = withTiming(0.97, { duration: 100 });
            if (Platform.OS !== 'web' && canPlay) void startPreview();
          }}
          onPressOut={() => {
            scale.value = withTiming(1, { duration: 150 });
            if (Platform.OS !== 'web') stopPreview();
          }}
          {...(Platform.OS === 'web'
            ? ({
                onHoverIn: () => void startPreview(),
                onHoverOut: stopPreview,
              } as object)
            : {})}
          style={[styles.mediaFrame, frameStyle]}
          accessibilityLabel={t('chatVideoPlay')}
        >
          {previewing && hls ? (
            <Video
              ref={previewRef}
              source={{ uri: hls }}
              style={StyleSheet.absoluteFillObject}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isMuted
              isLooping={false}
              useNativeControls={false}
              onPlaybackStatusUpdate={onPreviewStatus}
            />
          ) : thumb ? (
            <CachedImage
              uri={thumb}
              style={StyleSheet.absoluteFillObject}
              contentFit="cover"
              priority={enablePreload ? 'high' : 'normal'}
            />
          ) : (
            <LinearGradient colors={['#252530', '#121218']} style={StyleSheet.absoluteFillObject} />
          )}
          <LinearGradient colors={['transparent', 'rgba(0,0,0,0.5)']} style={styles.bottomGrad} />
          <View style={[styles.playFab, previewing && styles.playFabHidden]}>
            <View style={styles.playFabInner}>
              <Ionicons name="play" size={26} color="#111" style={styles.playIconOffset} />
            </View>
          </View>
          {durationLabel ? (
            <View style={styles.durationPill}>
              <Text style={styles.durationText}>{durationLabel}</Text>
            </View>
          ) : null}
          {preloaded ? <View style={styles.readyDot} accessibilityLabel="ready" /> : null}
        </Pressable>
      </Animated.View>

      {enablePreload ? (
        <Video
          ref={preloadRef}
          source={{ uri: hls }}
          style={styles.preloadHidden}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={false}
          isMuted
          useNativeControls={false}
        />
      ) : null}

      <Modal
        visible={fullscreen}
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeFullscreen}
      >
        <View style={[styles.modalRoot, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {thumb ? (
            <CachedImage
              uri={thumb}
              style={StyleSheet.absoluteFillObject}
              contentFit="contain"
              priority="high"
            />
          ) : null}

          <Video
            ref={playerRef}
            source={{ uri: hls }}
            style={[
              styles.modalVideo,
              {
                width: playerWidth,
                height: playerHeight,
                opacity: videoReady ? 1 : 0,
              },
            ]}
            resizeMode={ResizeMode.CONTAIN}
            useNativeControls
            shouldPlay={fullscreen}
            posterSource={thumb ? { uri: thumb } : undefined}
            onPlaybackStatusUpdate={onStatus}
            onReadyForDisplay={() => setVideoReady(true)}
          />

          {buffering && !videoReady ? (
            <View style={[styles.modalBuffer, { width: playerWidth, height: playerHeight }]} pointerEvents="none">
              <ActivityIndicator size="large" color="#fff" />
            </View>
          ) : null}

          <Pressable
            style={[styles.modalClose, { top: insets.top + 8 }]}
            onPress={closeFullscreen}
            hitSlop={16}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  cardOuter: {
    backgroundColor: 'transparent',
    marginVertical: 2,
    alignSelf: 'flex-start',
  },
  mediaFrame: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#141418',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.28,
        shadowRadius: 10,
      },
      android: { elevation: 5 },
    }),
  },
  bottomGrad: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 56,
  },
  playFab: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playFabHidden: {
    opacity: 0,
  },
  playFabInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.94)',
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
      },
      android: { elevation: 6 },
    }),
  },
  playIconOffset: {
    marginLeft: 3,
  },
  durationPill: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  durationText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  readyDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34d399',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  pendingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pendingBlur: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 14,
    overflow: 'hidden',
    alignItems: 'center',
    gap: 8,
    minWidth: 140,
  },
  pendingBlurAndroid: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    gap: 8,
    minWidth: 140,
  },
  pendingRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  pendingRingOwn: {
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pendingLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  uploadOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 8,
  },
  uploadStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
  },
  uploadTrack: {
    width: '72%',
    maxWidth: 200,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  uploadFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: 2,
  },
  uploadPercent: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    fontVariant: ['tabular-nums'],
  },
  uploadFailText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fecaca',
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  retryBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  preloadHidden: {
    position: 'absolute',
    width: 2,
    height: 2,
    opacity: 0,
    left: -100,
    top: -100,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#0a0a0a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalVideo: {
    backgroundColor: 'transparent',
  },
  modalBuffer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  modalClose: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
});
