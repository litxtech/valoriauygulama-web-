import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type MutableRefObject,
} from 'react';
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
import { parseIdCardImageUriWithFallback } from '@/lib/kbsCaptureOcr';
import { sanitizeKbsOcrForApply } from '@/lib/kbsCaptureOcrMerge';
import {
  assessIdCardFrontFrameReadiness,
  canLockIdFrontLiveScan,
  createIdCardFrontStabilityState,
} from '@/lib/scanner/idCardFrontLiveEngine';
import { linesFromMlKitOcrForIdFront } from '@/lib/scanner/idCardFrontMlKitLines';
import { mrzBlocksFromMlKitJson } from '@/lib/scanner/mrzOcrFromMlKit';
import type { MrzCameraFrameKind } from '@/lib/scanner/mrzFrameTheme';
import {
  clearIdFrontLockRecord,
  recordIdFrontLock,
  shouldAcceptIdFrontLock,
} from '@/lib/scanner/idCardFrontScanCycle';
import type {
  IdCardFrontLockedPayload,
  IdCardFrontVisionScannerRef,
  IdCardFrontVisionUiState,
} from '@/components/kbs/idCardFrontVisionTypes';

export type {
  IdCardFrontLockedPayload,
  IdCardFrontVisionScannerRef,
  IdCardFrontVisionUiState,
} from '@/components/kbs/idCardFrontVisionTypes';

type Props = {
  enabled: boolean;
  torchEnabled: boolean;
  resetToken?: number;
  onUiStateChange: (ui: IdCardFrontVisionUiState) => void;
  onLocked: (payload: IdCardFrontLockedPayload) => void;
  onOcrPreview?: (preview: string) => void;
};

const TARGET_FPS = 10;
const UNLOCK_AFTER_LOCK_MS = 2800;
const OCR_WARMUP_FRAMES = 0;
const ID_FOCUS_X_RATIO = 0.5;
const ID_FOCUS_Y_RATIO = 0.42;
const REFOCUS_INTERVAL_MS = 4000;

function mapPhaseToFrameKind(
  phase: ReturnType<typeof assessIdCardFrontFrameReadiness>['phase']
): MrzCameraFrameKind {
  switch (phase) {
    case 'watch':
      return 'hunting';
    case 'signal':
      return 'signal';
    case 'capture':
      return 'reading';
    default:
      return 'hunting';
  }
}

function resetScanCycle(
  lockedRef: MutableRefObject<boolean>,
  stabilityRef: MutableRefObject<ReturnType<typeof createIdCardFrontStabilityState>>
) {
  lockedRef.current = false;
  stabilityRef.current = createIdCardFrontStabilityState();
}

export const IdCardFrontVisionScanner = forwardRef<IdCardFrontVisionScannerRef, Props>(function IdCardFrontVisionScanner(
  {
  enabled,
  torchEnabled,
  resetToken = 0,
  onUiStateChange,
  onLocked,
  onOcrPreview,
},
  ref
) {
  const { t } = useTranslation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back', {
    physicalDevices: ['wide-angle-camera'],
  });
  const cameraRef = useRef<CameraType>(null);
  const viewLayoutRef = useRef({ width: 0, height: 0 });
  const lockedRef = useRef(false);
  const photoBusyRef = useRef(false);
  const acceptPartialRef = useRef(false);
  const lastLockRef = useRef({ key: null as string | null, at: 0 });
  const ocrWarmupRef = useRef(0);
  const stabilityRef = useRef(createIdCardFrontStabilityState());
  const [successGlow, setSuccessGlow] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { fps: 30 },
  ]);

  const { textRecognition } = useTextRecognition({
    language: 'LATIN',
    scaleFactor: 2,
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
    pushUi('hunting', 'kbsIdFrontLiveHunting', false);
  }, [enabled, previewReady, pushUi]);

  const focusAt = useCallback(
    (x: number, y: number) => {
      if (!device?.supportsFocus) return;
      void cameraRef.current?.focus({ x, y }).catch(() => {});
    },
    [device?.supportsFocus]
  );

  const focusCardRegion = useCallback(() => {
    const { width, height } = viewLayoutRef.current;
    if (width < 2 || height < 2) return;
    focusAt(width * ID_FOCUS_X_RATIO, height * ID_FOCUS_Y_RATIO);
  }, [focusAt]);

  const onCameraLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      viewLayoutRef.current = { width, height };
      if (previewReady) focusCardRegion();
    },
    [focusCardRegion, previewReady]
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
    const id = setInterval(() => focusCardRegion(), REFOCUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, previewReady, focusCardRegion]);

  useEffect(() => {
    resetScanCycle(lockedRef, stabilityRef);
    clearIdFrontLockRecord(lastLockRef.current);
    ocrWarmupRef.current = 0;
    photoBusyRef.current = false;
    setSuccessGlow(false);
    if (enabled) {
      pushUi('hunting', 'kbsIdFrontLiveHunting', false);
      if (previewReady) focusCardRegion();
    }
  }, [enabled, resetToken, pushUi, previewReady, focusCardRegion]);

  const onCameraInitialized = useCallback(() => {
    ocrWarmupRef.current = 0;
    setPreviewReady(true);
    focusCardRegion();
    if (enabled) pushUi('hunting', 'kbsIdFrontLiveHunting', false);
  }, [enabled, focusCardRegion, pushUi]);

  const onCameraError = useCallback((error: CameraRuntimeError) => {
    if (error.code === 'device/low-light-boost-not-supported') return;
  }, []);

  const runCapturePhotoParse = useCallback(async () => {
    if (photoBusyRef.current || !cameraRef.current) return;
    const acceptPartial = acceptPartialRef.current;
    if (!acceptPartial && lockedRef.current) return;

    photoBusyRef.current = true;
    if (!acceptPartial) lockedRef.current = true;
    pushUi('reading', 'kbsIdFrontLiveReading', true);
    try {
      const photo = await cameraRef.current.takePhoto({
        flash: torchEnabled ? 'on' : 'off',
      });
      const path = photo.path;
      const imageUri = path.startsWith('file://') ? path : `file://${path}`;

      const ocr = await parseIdCardImageUriWithFallback(imageUri, { captureSide: 'front' });
      const parsed = sanitizeKbsOcrForApply(ocr.parsed);
      const ok = canLockIdFrontLiveScan(parsed);

      if (!ok && !acceptPartial) {
        resetScanCycle(lockedRef, stabilityRef);
        pushUi('hunting', 'kbsIdFrontLiveAlign', false);
        return;
      }
      if (ok && !shouldAcceptIdFrontLock(lastLockRef.current.key, lastLockRef.current.at, parsed)) {
        resetScanCycle(lockedRef, stabilityRef);
        return;
      }

      if (ok) recordIdFrontLock(lastLockRef.current, parsed);
      lockedRef.current = true;
      setSuccessGlow(true);
      pushUi('success', ok ? 'kbsIdFrontLiveSuccess' : 'kbsIdFrontLiveAlign', false, ok);
      onLocked({ parsed, imageUri });
      setTimeout(() => setSuccessGlow(false), 1400);
      setTimeout(() => {
        resetScanCycle(lockedRef, stabilityRef);
        if (enabled) pushUi('hunting', 'kbsIdFrontLiveHunting', false);
      }, UNLOCK_AFTER_LOCK_MS);
    } catch {
      resetScanCycle(lockedRef, stabilityRef);
      pushUi('hunting', 'kbsIdFrontLiveAlign', false);
    } finally {
      photoBusyRef.current = false;
      acceptPartialRef.current = false;
    }
  }, [enabled, onLocked, pushUi, torchEnabled]);

  const capturePhotoAndParse = useRunOnJS(runCapturePhotoParse);

  useImperativeHandle(
    ref,
    () => ({
      captureNow: () => {
        acceptPartialRef.current = true;
        void runCapturePhotoParse();
      },
    }),
    [runCapturePhotoParse]
  );

  const handleOcrResult = useRunOnJS(
    useCallback(
      (fullText: string, blocksJson: string, frameHeight: number) => {
        if (!enabled || lockedRef.current || photoBusyRef.current) return;
        if (ocrWarmupRef.current < OCR_WARMUP_FRAMES) {
          ocrWarmupRef.current += 1;
          return;
        }

        const blocks = mrzBlocksFromMlKitJson(blocksJson, frameHeight);
        const lines = linesFromMlKitOcrForIdFront(fullText, blocks);
        onOcrPreview?.(`Ön yüz | ${lines.slice(0, 6).join(' | ') || '—'}`);

        const readiness = assessIdCardFrontFrameReadiness(lines, stabilityRef.current);
        pushUi(mapPhaseToFrameKind(readiness.phase), readiness.hintKey, readiness.phase === 'signal');

        if (readiness.phase !== 'capture') return;

        if (!lockedRef.current && !photoBusyRef.current) {
          void capturePhotoAndParse();
        }
      },
      [enabled, capturePhotoAndParse, onOcrPreview, pushUi]
    )
  );

  const frameProcessor = useFrameProcessor(
    (frame: Frame) => {
      'worklet';
      if (!enabled) return;

      runAtTargetFps(TARGET_FPS, () => {
        'worklet';
        runAsync(frame, () => {
          'worklet';
          const result = textRecognition(frame, {
            outputOrientation: 'portrait',
          });
          const text = result?.text ?? '';
          const blocks = (result as { blocks?: unknown[] })?.blocks ?? [];
          handleOcrResult(text, JSON.stringify(blocks), frame.height);
        });
      });
    },
    [enabled, torchEnabled, textRecognition, handleOcrResult]
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

  const cameraActive = hasPermission && !!device && enabled;

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
          photo
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
});

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
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  successGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34,197,94,0.22)',
    borderWidth: 4,
    borderColor: 'rgba(34,197,94,0.65)',
  },
});
