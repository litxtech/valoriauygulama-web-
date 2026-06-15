import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { ensureMicrophonePermission } from '@/lib/microphonePermission';
import {
  startVoicePreupload,
  consumeVoicePreupload,
  clearVoicePreupload,
} from '@/lib/chatVoicePreupload';

const MIN_VOICE_DURATION_SEC = 1;
const MAX_VOICE_DURATION_SEC = 120;

export type ChatVoicePhase = 'idle' | 'recording' | 'ready' | 'uploading';

export type VoiceSendPayload = {
  localUri: string;
  preUploadedUrl: string | null;
  durationSec: number;
};

type Options = {
  onSend: (payload: VoiceSendPayload) => Promise<void>;
  preUpload?: (localUri: string) => Promise<string>;
  preUploadKey?: string;
  disabled?: boolean;
};

export function useChatVoiceRecording({ onSend, preUpload, preUploadKey, disabled }: Options) {
  const { t } = useTranslation();
  const recorder = useVoiceRecorder();
  const [pendingUri, setPendingUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const isRecording = recorder.state === 'recording';

  const phase: ChatVoicePhase = uploading
    ? 'uploading'
    : isRecording
      ? 'recording'
      : pendingUri
        ? 'ready'
        : 'idle';

  const durationSec = Math.min(recorder.durationSec, MAX_VOICE_DURATION_SEC);

  useEffect(() => {
    if (!pendingUri || !preUpload || !preUploadKey) return;
    startVoicePreupload(preUploadKey, pendingUri, preUpload);
  }, [pendingUri, preUpload, preUploadKey]);

  const stopToReady = useCallback(async () => {
    if (!isRecording || uploading) return;
    if (recorder.durationSec < MIN_VOICE_DURATION_SEC) {
      await recorder.cancelRecording();
      Alert.alert(t('chatVoiceTooShortTitle'), t('chatVoiceTooShortBody'));
      return;
    }
    const uri = await recorder.stopRecording();
    if (!uri) {
      Alert.alert(t('recordError'), t('chatVoiceSendFailed'));
      await recorder.release();
      return;
    }
    setPendingUri(uri);
  }, [isRecording, uploading, recorder, t]);

  const start = useCallback(async () => {
    if (disabled || uploading || isRecording || pendingUri) return;
    const granted = await ensureMicrophonePermission({
      title: t('chatMicPermissionTitle'),
      message: t('chatMicPermissionMessage'),
      settingsMessage: t('chatMicPermissionSettings'),
    });
    if (!granted) return;
    await recorder.release();
    const err = await recorder.startRecording();
    if (err) {
      Alert.alert(t('recordError'), err);
    }
  }, [disabled, uploading, isRecording, pendingUri, recorder, t]);

  const toggleMic = useCallback(async () => {
    if (disabled || uploading) return;
    if (isRecording) {
      await stopToReady();
      return;
    }
    if (pendingUri) return;
    await start();
  }, [disabled, uploading, isRecording, pendingUri, start, stopToReady]);

  const cancel = useCallback(async () => {
    if (isRecording) {
      await recorder.cancelRecording();
    }
    if (preUploadKey) clearVoicePreupload(preUploadKey);
    setPendingUri(null);
    await recorder.release();
  }, [isRecording, recorder, preUploadKey]);

  const send = useCallback(async () => {
    if (!pendingUri || uploading || isRecording) return;
    setUploading(true);
    const uri = pendingUri;
    const dur = durationSec;
    try {
      const preUploadedUrl =
        preUploadKey != null ? await consumeVoicePreupload(preUploadKey, uri) : null;
      await onSend({ localUri: uri, preUploadedUrl, durationSec: dur });
      if (preUploadKey) clearVoicePreupload(preUploadKey);
      setPendingUri(null);
      await recorder.release();
    } catch (e) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('chatVoiceSendFailed'));
    } finally {
      setUploading(false);
    }
  }, [pendingUri, uploading, isRecording, onSend, recorder, preUploadKey, durationSec, t]);

  useEffect(() => {
    if (isRecording && recorder.durationSec >= MAX_VOICE_DURATION_SEC) {
      void stopToReady();
    }
  }, [isRecording, recorder.durationSec, stopToReady]);

  return {
    phase,
    isRecording,
    uploading,
    durationSec,
    pendingUri,
    start,
    toggleMic,
    stopToReady,
    cancel,
    send,
  };
}
