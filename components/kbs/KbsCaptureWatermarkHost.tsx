import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Platform, StyleSheet, Text, View } from 'react-native';
import ViewShot from 'react-native-view-shot';
import * as FileSystem from 'expo-file-system/legacy';
import {
  KBS_CAPTURE_WATERMARK_LABEL,
  setKbsCaptureWatermarkProcessor,
} from '@/lib/kbsCaptureWatermark';

const CAPTURE_QUALITY = Platform.OS === 'android' ? 0.96 : 0.92;

type PendingJob = {
  uri: string;
  resolve: (uri: string) => void;
};

type Frame = {
  uri: string;
  width: number;
  height: number;
};

function watermarkFontSize(width: number, height: number): number {
  return Math.max(16, Math.round(Math.min(width, height) * 0.034));
}

export function KbsCaptureWatermarkHost() {
  const shotRef = useRef<ViewShot>(null);
  const queueRef = useRef<PendingJob[]>([]);
  const currentJobRef = useRef<PendingJob | null>(null);
  const busyRef = useRef(false);
  const capturingRef = useRef(false);
  const [frame, setFrame] = useState<Frame | null>(null);

  const finishCurrent = useCallback((resultUri: string) => {
    const job = currentJobRef.current;
    currentJobRef.current = null;
    busyRef.current = false;
    setFrame(null);
    job?.resolve(resultUri);
  }, []);

  const startNextJob = useCallback(() => {
    if (busyRef.current) return;
    const next = queueRef.current.shift();
    if (!next) return;

    busyRef.current = true;
    capturingRef.current = false;
    currentJobRef.current = next;

    Image.getSize(
      next.uri,
      (width, height) => {
        setFrame({ uri: next.uri, width, height });
      },
      () => {
        finishCurrent(next.uri);
        startNextJob();
      }
    );
  }, [finishCurrent]);

  const processUri = useCallback(
    (uri: string) =>
      new Promise<string>((resolve) => {
        queueRef.current.push({ uri, resolve });
        startNextJob();
      }),
    [startNextJob]
  );

  useEffect(() => {
    setKbsCaptureWatermarkProcessor(processUri);
    return () => setKbsCaptureWatermarkProcessor(null);
  }, [processUri]);

  const captureFrame = useCallback(async () => {
    const job = currentJobRef.current;
    if (!job || !frame || capturingRef.current) return;
    capturingRef.current = true;

    try {
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      await new Promise((r) => setTimeout(r, 48));
      const captured = await shotRef.current?.capture?.();
      if (!captured) {
        finishCurrent(job.uri);
        startNextJob();
        return;
      }
      const dest = `${FileSystem.cacheDirectory ?? ''}kbs-wm-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: captured, to: dest });
      finishCurrent(dest);
    } catch {
      finishCurrent(job.uri);
    } finally {
      startNextJob();
    }
  }, [finishCurrent, frame, startNextJob]);

  if (!frame) return null;

  const fontSize = watermarkFontSize(frame.width, frame.height);
  const padH = Math.round(fontSize * 0.55);
  const padV = Math.round(fontSize * 0.38);
  const margin = Math.max(10, Math.round(Math.min(frame.width, frame.height) * 0.02));

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <ViewShot
        ref={shotRef}
        options={{ format: 'jpg', quality: CAPTURE_QUALITY }}
        style={{ width: frame.width, height: frame.height }}
        {...({ collapsable: false } as object)}
      >
        <View style={{ width: frame.width, height: frame.height }}>
          <Image
            source={{ uri: frame.uri }}
            style={{ width: frame.width, height: frame.height }}
            resizeMode="cover"
            onLoadEnd={() => {
              void captureFrame();
            }}
          />
          <View style={[styles.badge, { right: margin, bottom: margin, paddingHorizontal: padH, paddingVertical: padV }]}>
            <Text style={[styles.label, { fontSize }]}>{KBS_CAPTURE_WATERMARK_LABEL}</Text>
          </View>
        </View>
      </ViewShot>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -20000,
    top: 0,
    opacity: 0.01,
  },
  badge: {
    position: 'absolute',
    backgroundColor: 'rgba(15, 23, 42, 0.62)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(184, 134, 11, 0.75)',
  },
  label: {
    color: '#fff',
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
