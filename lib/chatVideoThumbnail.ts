/**
 * Sohbet videosu: karşı tarafın hemen görmesi için küçük JPEG önizleme.
 */
import * as ImageManipulator from 'expo-image-manipulator';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';
import { copyAndroidContentUriToCacheForPreview } from '@/lib/uploadMedia';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import {
  uploadImageMessageForGuest,
  uploadImageMessageForStaff,
} from '@/lib/messagingApi';
import type { ChatMediaActor } from '@/lib/chatMediaSend';

function normalizeLocalUri(uri: string): string {
  const u = uri.trim();
  if (!u) return u;
  if (u.startsWith('file://')) return u;
  if (Platform.OS === 'android' && u.startsWith('/')) return `file://${u}`;
  return u;
}

export async function ensureChatVideoLocalUri(uri: string): Promise<string> {
  let local = uri.trim();
  if (Platform.OS === 'android' && local.startsWith('content://')) {
    local = await copyAndroidContentUriToCacheForPreview(local, 'video');
  }
  return normalizeLocalUri(local);
}

function isVideoThumbnailsNativeAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  return Boolean(requireOptionalNativeModule('ExpoVideoThumbnails'));
}

/** İlk kare — ~400px JPEG (hızlı yükleme). Native modül yoksa sessizce atlanır. */
export async function extractChatVideoThumbnailUri(videoUri: string): Promise<string | null> {
  if (!isVideoThumbnailsNativeAvailable()) return null;
  const local = await ensureChatVideoLocalUri(videoUri);
  try {
    const { getThumbnailAsync } = await import('expo-video-thumbnails');
    const { uri } = await getThumbnailAsync(local, { time: 0, quality: 0.45 });
    if (!uri) return null;
    const small = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: 400 } }], {
      compress: 0.55,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return small.uri ?? uri;
  } catch {
    return null;
  }
}

export async function uploadChatVideoThumbnail(
  actor: ChatMediaActor,
  thumbUri: string
): Promise<string | null> {
  try {
    const buffer = await uriToArrayBuffer(thumbUri);
    if (actor.kind === 'staff') {
      return await uploadImageMessageForStaff(buffer, 'image/jpeg');
    }
    return await uploadImageMessageForGuest(actor.appToken, actor.conversationId, buffer, 'image/jpeg');
  } catch {
    return null;
  }
}

/** Seçimden hemen sonra: cache + JPEG poster (UI için). */
export async function buildEarlyVideoPreview(
  videoUri: string
): Promise<{ localUri: string; posterUri: string | null }> {
  const localUri = await ensureChatVideoLocalUri(videoUri);
  const posterUri = await extractChatVideoThumbnailUri(localUri);
  return { localUri, posterUri: posterUri ?? null };
}

/** Yerel video + isteğe bağlı hızlı önizleme URL (public). */
export async function prepareChatVideoThumbnailUpload(
  actor: ChatMediaActor,
  videoUri: string
): Promise<{ localUri: string; thumbnailUrl: string | null }> {
  const localUri = await ensureChatVideoLocalUri(videoUri);
  const thumbLocal = await extractChatVideoThumbnailUri(localUri);
  if (!thumbLocal) return { localUri, thumbnailUrl: null };
  const thumbnailUrl = await uploadChatVideoThumbnail(actor, thumbLocal);
  return { localUri, thumbnailUrl };
}
