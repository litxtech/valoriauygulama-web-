import { Alert } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { log } from '@/lib/logger';
import {
  MAX_UPLOAD_BYTES,
  NOTIFICATION_SOUND_STORAGE_BUCKET,
  isAudioFileExtension,
  isAudioMimeType,
} from '@/lib/notificationSoundCatalog';
import {
  publicUrlForSoundPath,
  storagePathForSound,
} from '@/lib/notificationSoundSettings';

/** Tüm ses dosyaları — iOS/Android dosya seçici */
const PICKER_TYPE = '*/*';

const EXT_TO_MIME: Record<string, string> = {
  wav: 'audio/wav',
  wave: 'audio/wav',
  mp3: 'audio/mpeg',
  mpeg: 'audio/mpeg',
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  caf: 'audio/x-caf',
  aiff: 'audio/aiff',
  aif: 'audio/aiff',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/opus',
  flac: 'audio/flac',
  wma: 'audio/x-ms-wma',
  amr: 'audio/amr',
  '3gp': 'audio/3gpp',
  '3gpp': 'audio/3gpp',
  webm: 'audio/webm',
  mid: 'audio/midi',
  midi: 'audio/midi',
};

const MIME_ALIASES: Record<string, string> = {
  'com.microsoft.waveform-audio': 'audio/wav',
  'public.wav': 'audio/wav',
  'public.mp3': 'audio/mpeg',
  'public.mpeg-4-audio': 'audio/mp4',
  'public.aiff-audio': 'audio/aiff',
  'public.audio': '',
  'public.data': '',
  'application/octet-stream': '',
  'binary/octet-stream': '',
  'audio/wave': 'audio/wav',
  'audio/x-ms-wav': 'audio/wav',
};

const NON_AUDIO_MIME_PREFIXES = ['image/', 'video/', 'text/', 'application/pdf'];

export type PickedSoundFile = {
  uri: string;
  name: string;
  size: number | null;
  mimeType: string;
};

export type SoundFileValidationInput = {
  name: string;
  mimeType?: string | null;
  uri?: string | null;
};

export type SoundFileValidationResult =
  | {
      ok: true;
      mimeType: string;
      source: 'mime' | 'alias' | 'extension' | 'generic';
    }
  | {
      ok: false;
      reason: string;
      details: {
        name: string;
        mimeType: string | null;
        uri: string | null;
        normalizedMime: string | null;
        extension: string | null;
      };
    };

function normalizeMime(raw?: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const base = trimmed.split(';')[0]?.trim().toLowerCase() ?? '';
  return base || null;
}

function extensionFromPath(path: string): string | null {
  const clean = (path.split('?')[0] ?? '').trim();
  const m = clean.match(/\.([a-z0-9]+)$/i);
  return m?.[1]?.toLowerCase() ?? null;
}

function resolveExtension(input: SoundFileValidationInput): string | null {
  const name = (input.name ?? '').trim();
  return extensionFromPath(name) ?? (input.uri ? extensionFromPath(input.uri) : null);
}

function mimeFromExtension(ext: string | null): string | null {
  if (!ext) return null;
  if (EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  if (isAudioFileExtension(ext)) return `audio/${ext}`;
  return null;
}

function isClearlyNonAudio(mime: string | null): boolean {
  if (!mime) return false;
  return NON_AUDIO_MIME_PREFIXES.some((p) => mime.startsWith(p));
}

function buildRejectionMessage(details: {
  name: string;
  mimeType: string | null;
  normalizedMime: string | null;
  extension: string | null;
}): string {
  const extHint = details.extension ? `.${details.extension}` : '(uzantı yok)';
  return [
    'Ses dosyası olarak kabul edilemedi.',
    '',
    `Ad: ${details.name || '—'}`,
    `MIME: ${details.mimeType ?? '—'}`,
    `Uzantı: ${extHint}`,
    '',
    'Desteklenen: tüm yaygın ses formatları (.wav, .mp3, .ogg, .flac, .m4a, .caf, .aac, …)',
    'Dosya adında ses uzantısı olmalı veya MIME türü audio/* olmalıdır.',
  ].join('\n');
}

/**
 * Tüm yaygın ses dosyalarını kabul eder: audio/* MIME, bilinen uzantılar, iOS alias'ları.
 */
export function validateNotificationSoundFile(
  input: SoundFileValidationInput
): SoundFileValidationResult {
  const name = (input.name ?? '').trim();
  const reported = input.mimeType ?? null;
  const uri = input.uri ?? null;
  const normalizedMime = normalizeMime(reported);
  const extension = resolveExtension(input);

  log.info('notificationSoundUpload', 'validate picked file', {
    name,
    mimeType: reported,
    uri,
    normalizedMime,
    extension,
  });

  if (isClearlyNonAudio(normalizedMime)) {
    const details = { name, mimeType: reported, uri, normalizedMime, extension };
    log.warn('notificationSoundUpload', 'rejected non-audio mime', details);
    return { ok: false, reason: buildRejectionMessage(details), details };
  }

  if (normalizedMime && isAudioMimeType(normalizedMime)) {
    return { ok: true, mimeType: normalizedMime, source: 'mime' };
  }

  if (normalizedMime && normalizedMime in MIME_ALIASES) {
    const mapped = MIME_ALIASES[normalizedMime];
    if (mapped) {
      return { ok: true, mimeType: mapped, source: 'alias' };
    }
  }

  const extMime = mimeFromExtension(extension);
  if (extMime) {
    return { ok: true, mimeType: extMime, source: 'extension' };
  }

  if (
    normalizedMime &&
    (normalizedMime === 'application/octet-stream' ||
      normalizedMime === 'binary/octet-stream' ||
      normalizedMime === 'public.data' ||
      normalizedMime === 'public.audio')
  ) {
    if (extension && isAudioFileExtension(extension)) {
      const guess = mimeFromExtension(extension) ?? 'application/octet-stream';
      return { ok: true, mimeType: guess, source: 'generic' };
    }
  }

  const details = { name, mimeType: reported, uri, normalizedMime, extension };
  log.warn('notificationSoundUpload', 'rejected file', details);
  return { ok: false, reason: buildRejectionMessage(details), details };
}

export async function pickNotificationSoundFile(): Promise<PickedSoundFile | null> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: PICKER_TYPE,
    });

    if (result.canceled) {
      log.info('notificationSoundUpload', 'picker canceled');
      return null;
    }

    const asset = result.assets?.[0];
    if (!asset?.uri) {
      log.warn('notificationSoundUpload', 'picker asset missing uri', { asset });
      Alert.alert('Dosya seçilemedi', 'Ses dosyası alınamadı. Tekrar deneyin.');
      return null;
    }

    const name = (asset.name ?? '').trim() || `sound_${Date.now()}.wav`;
    const reportedMime =
      (asset as { mimeType?: string | null; type?: string | null }).mimeType ??
      (asset as { type?: string | null }).type ??
      null;

    log.info('notificationSoundUpload', 'DocumentPicker asset', {
      name,
      mimeType: reportedMime,
      uri: asset.uri,
      size: asset.size ?? null,
    });

    const validation = validateNotificationSoundFile({
      name,
      mimeType: reportedMime,
      uri: asset.uri,
    });

    if (!validation.ok) {
      Alert.alert('Geçersiz dosya', validation.reason);
      return null;
    }

    const size = typeof asset.size === 'number' ? asset.size : null;
    if (size != null && size > MAX_UPLOAD_BYTES) {
      Alert.alert(
        'Dosya çok büyük',
        `Seçilen dosya ${Math.round(size / 1024)} KB.\nMaksimum ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB.`
      );
      return null;
    }

    log.info('notificationSoundUpload', 'accepted file', {
      name,
      mimeType: validation.mimeType,
      source: validation.source,
      uri: asset.uri,
    });

    return {
      uri: asset.uri,
      name,
      size,
      mimeType: validation.mimeType,
    };
  } catch (e) {
    log.error('notificationSoundUpload', 'picker error', e);
    Alert.alert('Dosya seçici açılamadı', (e as Error).message ?? 'Bilinmeyen hata');
    return null;
  }
}

export async function uploadNotificationSoundToStorage(params: {
  organizationId: string;
  featureKey: string;
  picked: PickedSoundFile;
}): Promise<{ publicUrl: string; path: string }> {
  const path = storagePathForSound(params.organizationId, params.featureKey, params.picked.name);
  const buffer = await uriToArrayBuffer(params.picked.uri, { mediaKind: 'image' });

  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`Dosya çok büyük (maks. ${Math.round(MAX_UPLOAD_BYTES / 1024)} KB).`);
  }
  if (buffer.byteLength === 0) {
    throw new Error('Ses dosyası boş veya okunamadı.');
  }

  const contentType =
    params.picked.mimeType?.trim() ||
    mimeFromExtension(extensionFromPath(params.picked.name)) ||
    'application/octet-stream';

  const { error } = await supabase.storage
    .from(NOTIFICATION_SOUND_STORAGE_BUCKET)
    .upload(path, buffer, {
      upsert: true,
      contentType,
    });

  if (error) {
    throw new Error(error.message);
  }

  return { publicUrl: publicUrlForSoundPath(path), path };
}
