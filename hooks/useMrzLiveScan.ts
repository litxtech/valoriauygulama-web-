import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraView } from 'expo-camera';
import type { TFunction } from 'i18next';
import {
  MRZ_LIVE_WARMUP_MS,
  analyzeOcrLinesForMrzLive,
  mrzCaptureQualityForPhase,
  mrzLiveIntervalForPhase,
  type MrzLivePhase,
} from '@/lib/scanner/mrzLiveEngine';
import { captureSilentPreviewFrame, deleteSilentFrame } from '@/lib/scanner/mrzSilentFrame';
import { ocrLinesFromImage } from '@/lib/scanner/ocrLinesFromImage';
import type { ParsedDocument } from '@/lib/scanner/types';
import type { MrzCameraFrameKind } from '@/lib/scanner/mrzFrameTheme';

export type MrzLockedPayload = { mrz: string; parsed: ParsedDocument };

type UseMrzLiveScanArgs = {
  cameraRef: React.RefObject<CameraView | null>;
  cameraReady: boolean;
  cameraMounted: boolean;
  enabled: boolean;
  torchEnabled: boolean;
  t: TFunction;
  onLocked: (payload: MrzLockedPayload) => void;
  onOcrPreview?: (preview: string) => void;
};

function frameKindFromPhase(phase: MrzLivePhase): MrzCameraFrameKind {
  switch (phase) {
    case 'warmup':
      return 'idle';
    case 'watch':
      return 'hunting';
    case 'signal':
      return 'signal';
    case 'locking':
      return 'reading';
    default:
      return 'hunting';
  }
}

export function useMrzLiveScan({
  cameraRef,
  cameraReady,
  cameraMounted,
  enabled,
  torchEnabled,
  t,
  onLocked,
  onOcrPreview,
}: UseMrzLiveScanArgs) {
  const [phase, setPhase] = useState<MrzLivePhase>('warmup');
  const [hint, setHint] = useState('');
  const phaseRef = useRef<MrzLivePhase>('warmup');
  const inFlightRef = useRef(false);
  const sampleAllowedAfterRef = useRef(0);
  const onLockedRef = useRef(onLocked);
  const ocrErrShownRef = useRef(false);

  useEffect(() => {
    onLockedRef.current = onLocked;
  }, [onLocked]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const resetLoop = useCallback(() => {
    setPhase('warmup');
    phaseRef.current = 'warmup';
    sampleAllowedAfterRef.current = Date.now() + MRZ_LIVE_WARMUP_MS;
    setHint(t('kbsMrzLiveCameraWarming'));
  }, [t]);

  const runSilentTick = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!cameraMounted || !cameraReady || !enabled) return;
    if (Date.now() < sampleAllowedAfterRef.current) return;

    inFlightRef.current = true;
    const currentPhase = phaseRef.current === 'warmup' ? 'watch' : phaseRef.current;
    let sampleUri: string | null = null;

    try {
      const q = mrzCaptureQualityForPhase(currentPhase, torchEnabled);
      sampleUri = await captureSilentPreviewFrame(cameraRef, q);
      if (!sampleUri) {
        setPhase('watch');
        phaseRef.current = 'watch';
        setHint(t('kbsMrzFrameAutoHunting'));
        return;
      }

      const { lines } = await ocrLinesFromImage(sampleUri);
      onOcrPreview?.(`OCR | ${lines.slice(0, 10).join(' | ') || '—'}`);

      const analyzed = analyzeOcrLinesForMrzLive(lines);

      if (analyzed.phase === 'locking' && analyzed.locked) {
        setPhase('locking');
        phaseRef.current = 'locking';
        setHint(t('kbsMrzFrameLockActive'));
        onLockedRef.current(analyzed.locked);
        return;
      }

      if (analyzed.phase === 'signal') {
        setPhase('signal');
        phaseRef.current = 'signal';
        setHint(t('kbsMrzFrameLockActive'));
        return;
      }

      setPhase('watch');
      phaseRef.current = 'watch';
      setHint(t('kbsMrzFrameAutoHunting'));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('OCR_NOT_SUPPORTED') && !ocrErrShownRef.current) {
        ocrErrShownRef.current = true;
        setPhase('warmup');
        setHint(t('ocrNotSupportedOnDevice'));
        return;
      }
      setPhase('watch');
      phaseRef.current = 'watch';
      setHint(t('kbsMrzFrameAutoHunting'));
    } finally {
      await deleteSilentFrame(sampleUri);
      inFlightRef.current = false;
    }
  }, [cameraMounted, cameraReady, enabled, torchEnabled, cameraRef, t, onOcrPreview]);

  useEffect(() => {
    if (!enabled || !cameraMounted || !cameraReady) return undefined;

    sampleAllowedAfterRef.current = Date.now() + MRZ_LIVE_WARMUP_MS;
    setPhase('warmup');
    phaseRef.current = 'warmup';
    setHint(t('kbsMrzLiveCameraWarming'));

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = () => {
      if (cancelled) return;
      void runSilentTick().finally(() => {
        if (cancelled) return;
        if (phaseRef.current === 'warmup') {
          phaseRef.current = 'watch';
          setPhase('watch');
          setHint(t('kbsMrzFrameAutoHunting'));
        }
        const ms = mrzLiveIntervalForPhase(phaseRef.current);
        timer = setTimeout(loop, ms);
      });
    };

    timer = setTimeout(loop, MRZ_LIVE_WARMUP_MS);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [cameraMounted, cameraReady, enabled, runSilentTick, t]);

  const frameKind = frameKindFromPhase(phase);
  const showSpinner = phase === 'locking';

  return {
    phase,
    frameKind,
    hint,
    showSpinner,
    resetLoop,
  };
}
