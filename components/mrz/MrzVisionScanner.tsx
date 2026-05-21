import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, Dimensions } from 'react-native';
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

export type MrzVisionUiState = {
  frameKind: MrzCameraFrameKind;
  hint: string;
  showSpinner: boolean;
  successGlow: boolean;
};

export type MrzLockedPayload = { mrz: string; parsed: ParsedDocument };

type Props = {
  enabled: boolean;
  torchEnabled: boolean;
  onUiStateChange: (ui: MrzVisionUiState) => void;
  onLocked: (payload: MrzLockedPayload) => void;
  onOcrPreview?: (preview: string) => void;
};

const TARGET_FPS = 18;
const REFOCUS_INTERVAL_MS = 2200;
/** MRZ şeridi pasaport/kimlik alt bölgesinde — odak noktası */
const MRZ_FOCUS = { x: 0.5, y: 0.72 } as const;

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

export function MrzVisionScanner({
  enabled,
  torchEnabled,
  onUiStateChange,
  onLocked,
  onOcrPreview,
}: Props) {
  const { t } = useTranslation();
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const cameraRef = useRef<CameraType>(null);
  const lockedRef = useRef(false);
  const stabilityRef = useRef(createMrzStabilityState());
  const [successGlow, setSuccessGlow] = useState(false);
  const [previewReady, setPreviewReady] = useState(false);
  const screenAspect = Dimensions.get('window').height / Dimensions.get('window').width;
  const format = useCameraFormat(device, [
    { videoResolution: 'max' },
    { fps: 30 },
    { autoFocusSystem: 'phase-detection' },
    { videoAspectRatio: screenAspect },
  ]);

  const { textRecognition } = useTextRecognition({
    language: 'LATIN',
    scaleFactor: 1,
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

  const focusMrzRegion = useCallback(() => {
    void cameraRef.current?.focus(MRZ_FOCUS).catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled || !previewReady) return undefined;
    const id = setInterval(() => focusMrzRegion(), REFOCUS_INTERVAL_MS);
    return () => clearInterval(id);
  }, [enabled, previewReady, focusMrzRegion]);

  useEffect(() => {
    if (enabled) {
      lockedRef.current = false;
      stabilityRef.current = createMrzStabilityState();
      pushUi('hunting', 'kbsMrzFrameAutoHunting', false);
      if (previewReady) focusMrzRegion();
    }
  }, [enabled, pushUi, previewReady, focusMrzRegion]);

  const onCameraInitialized = useCallback(() => {
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

        const blocks = mrzBlocksFromMlKitJson(blocksJson, frameHeight);
        const readiness = assessMrzFrameReadiness(fullText, blocks, stabilityRef.current);
        onOcrPreview?.(`MLKit | ${readiness.lines.slice(0, 6).join(' | ') || '—'}`);

        if (readiness.phase !== 'locking') {
          pushUi(mapPhaseToFrameKind(readiness.phase), readiness.hintKey, false);
          return;
        }

        const analyzed = analyzeOcrLinesForMrzLive(readiness.lines);
        if (analyzed.phase !== 'locking' || !analyzed.locked) {
          pushUi('signal', 'kbsMrzFrameLockActive', true);
          return;
        }

        lockedRef.current = true;
        setSuccessGlow(true);
        pushUi('success', 'kbsMrzFrameSuccess', false, true);
        onLocked(analyzed.locked);
        setTimeout(() => setSuccessGlow(false), 2400);
      },
      [enabled, onLocked, onOcrPreview, pushUi]
    ),
    [enabled, onLocked, onOcrPreview, pushUi]
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
        <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
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

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraLive}
        format={format}
        torch={torchEnabled ? 'on' : 'off'}
        onError={onCameraError}
        onInitialized={onCameraInitialized}
        frameProcessor={enabled ? frameProcessor : undefined}
        videoStabilizationMode="off"
        pixelFormat="yuv"
      />
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
