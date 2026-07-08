import React, { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  useFrameProcessor,
  runAtTargetFps,
  runAsync,
  type Camera as CameraType,
  type CameraRuntimeError,
  type Frame,
} from 'react-native-vision-camera';
import { useTextRecognition } from 'react-native-vision-camera-mlkit';
import { useRunOnJS } from 'react-native-worklets-core';
import { useTranslation } from 'react-i18next';
import { analyzeOcrLinesForMrzLive } from '@/lib/scanner/mrzLiveEngine';
import {
  assessMrzFrameReadiness,
  createMrzStabilityState,
  mrzBlocksFromMlKitJson,
} from '@/lib/scanner/mrzOcrFromMlKit';
import type { MrzCameraFrameKind } from '@/lib/scanner/mrzFrameTheme';
import type { ParsedDocument } from '@/lib/scanner/types';

import type { MrzLockedPayload, MrzVisionUiState } from '@/components/mrz/mrzVisionTypes';
import {
  clearMrzLockRecord,
  recordMrzLock,
  shouldAcceptMrzLock,
} from '@/lib/scanner/mrzScanCycle';

export type { MrzVisionUiState, MrzLockedPayload } from '@/components/mrz/mrzVisionTypes';

type Props = {
  enabled: boolean;
  torchEnabled: boolean;
  /** Her turda artırın — kilitleme + stabilite sıfırlanır. */
  resetToken?: number;
  /** Onay ekranında kamera önizlemesi açık kalsın (hızlı 2. tarama). */
  keepCameraWarm?: boolean;
  /**
   * NFC sekmesi: MRZ sadece BAC anahtarı için.
   * Daha yüksek OCR frekansı, kısa cooldown, kısa başarı animasyonu.
   */
  unlockOnly?: boolean;
  onUiStateChange: (ui: MrzVisionUiState) => void;
  onLocked: (payload: MrzLockedPayload) => void;
  onOcrPreview?: (preview: string) => void;
};

const TARGET_FPS = 12;
const TARGET_FPS_UNLOCK = 16;
const REFOCUS_INTERVAL_MS = 4500;
const UNLOCK_AFTER_LOCK_MS = 500;
const UNLOCK_AFTER_LOCK_FAST_MS = 180;
/** Kamera init sonrası ilk karelerde OCR atla — önizleme hızlı görünsün */
const OCR_WARMUP_FRAMES = 2;
const OCR_WARMUP_UNLOCK = 1;
/** GuestScannerOverlay mrzFrame ile uyumlu (merkez ~%62 dikey) */
const MRZ_FOCUS_X_RATIO = 0.5;
const MRZ_FOCUS_Y_RATIO = 0.62;

function mapPhaseToFrameKind(
  phase: ReturnType<typeof assessMrzFrameReadiness>['phase']
): MrzCameraFrameKind {
  switch (phase) {
    case 'watch':
      return 'hunting';
    case 'signal':
      return 'signal';
    case 'blur':
      return 'suspect_ocr';
    case 'locking':
      return 'reading';
    default:
      return 'hunting';
  }
}

function resetScanCycle(
  lockedRef: MutableRefObject<boolean>,
  stabilityRef: MutableRefObject<ReturnType<typeof createMrzStabilityState>>
) {
  lockedRef.current = false;
  stabilityRef.current = createMrzStabilityState();
}

export function MrzVisionScanner({
  enabled,
  torchEnabled,
  resetToken = 0,
  keepCameraWarm = false,
  unlockOnly = false,
  onUiStateChange,
  onLocked,
  onOcrPreview,
}: Props) {
  const { t } = useTranslation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back', {
    physicalDevices: ['wide-angle-camera'],
  });
  const cameraRef = useRef<CameraType>(null);
  const viewLayoutRef = useRef({ width: 0, height: 0 });
  const lockedRef = useRef(false);
  const lastLockRef = useRef({ key: null as string | null, at: 0 });
  const ocrWarmupRef = useRef(0);
  const stabilityRef = useRef(createMrzStabilityState());
  const [successGlow, setSuccessGlow] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const targetFps = unlockOnly ? TARGET_FPS_UNLOCK : TARGET_FPS;
  const warmupFrames = unlockOnly ? OCR_WARMUP_UNLOCK : OCR_WARMUP_FRAMES;
  const unlockAfterMs = unlockOnly ? UNLOCK_AFTER_LOCK_FAST_MS : UNLOCK_AFTER_LOCK_MS;
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: 30 },
  ]);

  const { textRecognition } = useTextRecognition({
    language: 'LATIN',
    // NFC BAC: daha hafif OCR → daha hızlı kilit
    scaleFactor: unlockOnly ? 1.25 : 1.5,
    invertColors: torchEnabled,
  });

  const pushUi = useCallback(
    (frameKind: MrzCameraFrameKind, hintKey: string, showSpinner: boolean, glow = false) => {
      onUiStateChange({
        frameKind,
        hint: t(hintKey),
        showSpinner,
        successGlow: glow,
      });
    },
    [onUiStateChange, t]
  );

  useEffect(() => {
    void requestPermission();
  }, [requestPermission]);

  useEffect(() => {
    setPreviewReady(false);
  }, [device?.id]);

  useEffect(() => {
    if (!enabled || previewReady) return;
    pushUi('hunting', 'kbsMrzLiveCameraWarming', false);
  }, [enabled, previewReady, pushUi]);

  const focusAt = useCallback(
    (x: number, y: number) => {
      if (!device?.supportsFocus) return;
      void cameraRef.current?.focus({ x, y }).catch(() => {});
    },
    [device?.supportsFocus]
  );

  const focusMrzRegion = useCallback(() => {
    const { width, height } = viewLayoutRef.current;
    if (width < 2 || height < 2) return;
    focusAt(width * MRZ_FOCUS_X_RATIO, height * MRZ_FOCUS_Y_RATIO);
  }, [focusAt]);

  const onCameraLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      viewLayoutRef.current = { width, height };
      if (previewReady) focusMrzRegion();
    },
    [focusMrzRegion, previewReady]
  );

  const onTapFocus = useCallback(
    (e: GestureResponderEvent) => {
      if (!enabled) return;
      const { locationX, locationY } = e.nativeEvent;
      focusAt(locationX, locationY);
    },
    [enabled, focusAt]
  );

  useEffect(() => {
    if (!enabled || !previewReady) return undefined;
    const id = setInterval(() => focusMrzRegion(), REFOCUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, previewReady, focusMrzRegion]);

  useEffect(() => {
    resetScanCycle(lockedRef, stabilityRef);
    clearMrzLockRecord(lastLockRef.current);
    ocrWarmupRef.current = 0;
    setSuccessGlow(false);
    if (enabled || keepCameraWarm) {
      pushUi('hunting', 'kbsMrzFrameAutoHunting', false);
      if (previewReady) focusMrzRegion();
    }
  }, [enabled, resetToken, keepCameraWarm, pushUi, previewReady, focusMrzRegion]);

  const onCameraInitialized = useCallback(() => {
    ocrWarmupRef.current = 0;
    setPreviewReady(true);
    focusMrzRegion();
    if (enabled) pushUi('hunting', 'kbsMrzFrameAutoHunting', false);
  }, [enabled, focusMrzRegion, pushUi]);

  const onCameraError = useCallback((error: CameraRuntimeError) => {
    if (error.code === 'device/low-light-boost-not-supported') return;
  }, []);

  const handleOcrResult = useRunOnJS(
    useCallback(
      (fullText: string, blocksJson: string, frameHeight: number) => {
        if (!enabled || lockedRef.current) return;
        if (ocrWarmupRef.current < warmupFrames) {
          ocrWarmupRef.current += 1;
          return;
        }

        const blocks = mrzBlocksFromMlKitJson(blocksJson, frameHeight);
        const readiness = assessMrzFrameReadiness(fullText, blocks, stabilityRef.current);
        onOcrPreview?.(`MLKit | ${readiness.lines.slice(0, 6).join(' | ') || '—'}`);

        if (readiness.phase !== 'locking') {
          pushUi(mapPhaseToFrameKind(readiness.phase), readiness.hintKey, false);
          return;
        }

        const locked =
          readiness.locked ??
          (() => {
            const analyzed = analyzeOcrLinesForMrzLive(readiness.lines);
            return analyzed.phase === 'locking' ? analyzed.locked : undefined;
          })();
        if (!locked) {
          pushUi('signal', 'kbsMrzFrameLockActive', false);
          return;
        }

        const mrz = locked.mrz;
        const cooldownMs = unlockOnly ? 700 : undefined;
        if (!shouldAcceptMrzLock(lastLockRef.current.key, lastLockRef.current.at, mrz, Date.now(), cooldownMs)) {
          return;
        }

        lockedRef.current = true;
        recordMrzLock(lastLockRef.current, mrz);
        setSuccessGlow(true);
        pushUi('success', 'kbsMrzFrameSuccess', false, true);
        onLocked(locked);
        setTimeout(() => setSuccessGlow(false), unlockOnly ? 500 : 1400);
        setTimeout(() => {
          resetScanCycle(lockedRef, stabilityRef);
          if (enabled) pushUi('hunting', 'kbsMrzFrameAutoHunting', false);
        }, unlockAfterMs);
      },
      [enabled, onLocked, onOcrPreview, pushUi, unlockAfterMs, unlockOnly, warmupFrames]
    ),
    [enabled, onLocked, onOcrPreview, pushUi, unlockAfterMs, unlockOnly, warmupFrames]
  );

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      if (!enabled) return;

      runAtTargetFps(targetFps, () => {
        'worklet';
        runAsync(frame, () => {
          'worklet';
          const result = textRecognition(frame, {
            outputOrientation: 'portrait',
          });
          const text = result?.text ?? '';
          const blocks = (result as { blocks?: { lines?: { text?: string; bounds?: { centerY?: number; top?: number } }[] }[] })?.blocks ?? [];
          const fh = frame.height > 0 ? frame.height : 1;
          const mrzLines: string[] = [];
          for (let bi = 0; bi < blocks.length; bi += 1) {
            const lines = blocks[bi]?.lines ?? [];
            for (let li = 0; li < lines.length; li += 1) {
              const line = lines[li];
              const t = line?.text?.trim() ?? '';
              if (t.length < 6) continue;
              const cy = line?.bounds?.centerY ?? line?.bounds?.top ?? 0;
              if (cy >= fh * 0.35) mrzLines.push(t);
            }
          }
          handleOcrResult(text, mrzLines.join('\n'), frame.height);
        });
      });
    },
    [enabled, torchEnabled, textRecognition, handleOcrResult, targetFps]
  );

  if (!hasPermission) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{t('kbsMrzCameraPermission')}</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>{t('kbsMrzNoCameraDevice')}</Text>
      </View>
    );
  }

  const cameraLive = hasPermission && !!device;
  /** Kamera önizlemesi hemen; OCR `enabled` iken. Onay ekranında `keepCameraWarm` ile dondurulmaz. */
  const cameraActive = cameraLive && (enabled || keepCameraWarm);

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onLayout={onCameraLayout}
        onPress={onTapFocus}
        accessibilityRole="button"
        accessibilityLabel={t('kbsMrzTapToFocus')}
      >
        <Camera
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={cameraActive}
          format={format}
          fps={[15, 30]}
          torch={torchEnabled ? 'on' : 'off'}
          onError={onCameraError}
          onInitialized={onCameraInitialized}
          frameProcessor={enabled ? frameProcessor : undefined}
          videoStabilizationMode="off"
          pixelFormat="yuv"
          photoQualityBalance="quality"
          enableBufferCompression={false}
          lowLightBoost={!torchEnabled && device.supportsLowLightBoost}
        />
      </Pressable>
      {successGlow ? <View style={styles.successGlow} pointerEvents="none" /> : null}
      <View style={styles.vignette} pointerEvents="none" />
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 20,
  },
  vignette: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  successGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34,197,94,0.22)',
    borderWidth: 4,
    borderColor: 'rgba(34,197,94,0.65)',
  },
});
