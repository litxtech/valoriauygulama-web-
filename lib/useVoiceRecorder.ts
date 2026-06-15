/**
 * Sesli mesaj kaydı - expo-av ile
 */
import { useState, useRef, useCallback } from 'react';
import { Audio } from 'expo-av';
import { prepareChatAudioRecording, releaseChatAudioRecording } from '@/lib/chatAudioSession';

export type RecordingState = 'idle' | 'recording' | 'stopped' | 'error';

const VOICE_RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  ios: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios!,
    bitRate: 64000,
    numberOfChannels: 1,
  },
  android: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android!,
    bitRate: 64000,
    numberOfChannels: 1,
  },
  web: {
    ...Audio.RecordingOptionsPresets.HIGH_QUALITY.web,
    bitsPerSecond: 64000,
  },
};

async function resetAudioModeAfterRecording() {
  await releaseChatAudioRecording();
}

async function unloadRecording(recording: Audio.Recording): Promise<void> {
  try {
    await recording.stopAndUnloadAsync();
  } catch {
    // ignore — already unloaded
  }
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecordingState>('idle');
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startLockRef = useRef(false);

  const clearDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const release = useCallback(async () => {
    clearDurationTimer();
    const recording = recordingRef.current;
    recordingRef.current = null;
    if (recording) {
      await unloadRecording(recording);
    }
    await resetAudioModeAfterRecording();
  }, [clearDurationTimer]);

  const startRecording = useCallback(async (): Promise<string | null> => {
    if (startLockRef.current) return 'Kayıt başlatılıyor…';
    startLockRef.current = true;
    setError(null);
    try {
      await release();
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== 'granted') {
        return 'Mikrofon izni gerekli';
      }
      await prepareChatAudioRecording();
      const { recording } = await Audio.Recording.createAsync(VOICE_RECORDING_OPTIONS);
      recordingRef.current = recording;
      setState('recording');
      setDurationSec(0);
      const start = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setDurationSec(Math.floor((Date.now() - start) / 1000));
      }, 1000);
      return null;
    } catch (e) {
      await release();
      let msg = e instanceof Error ? e.message : 'Kayıt başlatılamadı';
      if (/recording not allowed/i.test(msg)) {
        msg =
          'Ses kaydı şu an kullanılamıyor. Çalan sesli mesajı durdurun veya sohbet ekranını kapatıp tekrar açın.';
      }
      setError(msg);
      setState('error');
      return msg;
    } finally {
      startLockRef.current = false;
    }
  }, [release]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;
    clearDurationTimer();
    try {
      const uri = recording.getURI();
      await unloadRecording(recording);
      recordingRef.current = null;
      await resetAudioModeAfterRecording();
      setState('stopped');
      return uri;
    } catch (e) {
      recordingRef.current = null;
      await resetAudioModeAfterRecording();
      const msg = e instanceof Error ? e.message : 'Kayıt durdurulamadı';
      setError(msg);
      setState('error');
      return null;
    }
  }, [clearDurationTimer]);

  const cancelRecording = useCallback(async () => {
    await release();
    setState('idle');
    setDurationSec(0);
    setError(null);
  }, [release]);

  const reset = useCallback(async () => {
    await release();
    setState('idle');
    setDurationSec(0);
    setError(null);
  }, [release]);

  return {
    state,
    durationSec,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    reset,
    release,
  };
}
