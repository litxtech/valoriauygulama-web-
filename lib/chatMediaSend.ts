/**
 * Sohbet: çoklu resim / video seçimi ve gönderimi.
 */
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { resolveFeedPickedMediaUri } from '@/lib/feedPostMediaPicker';
import { chatVideoPickerOptions } from '@/lib/muxChatUpload';
import {
  staffSendMessage,
  guestSendMessage,
  uploadImageMessageForStaff,
  uploadImageMessageForGuest,
} from '@/lib/messagingApi';
import { uriToArrayBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import type { Message } from '@/lib/messaging';
import { makeChatAlbumContent } from '@/lib/chatImageAlbum';

export const CHAT_MEDIA_SELECTION_LIMIT = 10;

export type ChatMediaActor =
  | {
      kind: 'staff';
      staffId: string;
      staffName: string;
      staffAvatar: string | null;
      conversationId: string;
    }
  | {
      kind: 'guest';
      appToken: string;
      conversationId: string;
    };

export async function pickChatImagesFromLibrary(): Promise<string[]> {
  const granted = await ensureMediaLibraryPermission();
  if (!granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
    allowsMultipleSelection: true,
    selectionLimit: CHAT_MEDIA_SELECTION_LIMIT,
  });
  if (result.canceled || !result.assets?.length) return [];
  return result.assets.map((a) => a.uri).filter(Boolean) as string[];
}

export async function pickChatImageFromCamera(): Promise<string | null> {
  const granted = await ensureCameraPermission();
  if (!granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: false,
  });
  if (result.canceled || !result.assets[0]?.uri) return null;
  return result.assets[0].uri;
}

export async function pickChatVideosFromLibrary(): Promise<string[]> {
  const granted = await ensureMediaLibraryPermission();
  if (!granted) return [];
  const result = await ImagePicker.launchImageLibraryAsync({
    ...chatVideoPickerOptions,
    mediaTypes: ['videos'],
    allowsMultipleSelection: true,
    selectionLimit: CHAT_MEDIA_SELECTION_LIMIT,
  });
  if (result.canceled || !result.assets?.length) return [];
  const out: string[] = [];
  for (const asset of result.assets) {
    const resolved = await resolveFeedPickedMediaUri(asset);
    if (resolved.type === 'video' && resolved.uri) out.push(resolved.uri);
  }
  return out;
}

export async function pickChatVideoFromCamera(): Promise<string | null> {
  const granted = await ensureCameraPermission();
  if (!granted) return null;
  const result = await ImagePicker.launchCameraAsync({
    ...chatVideoPickerOptions,
    mediaTypes: ['videos'],
  });
  if (result.canceled || !result.assets[0]) return null;
  const resolved = await resolveFeedPickedMediaUri(result.assets[0]);
  return resolved.type === 'video' ? resolved.uri : null;
}

async function prepareGuestImageBuffer(uri: string): Promise<{ buffer: ArrayBuffer; mime: string }> {
  let local = uri;
  const maxWidth = 1200;
  try {
    const manipulated = await ImageManipulator.manipulateAsync(local, [{ resize: { width: maxWidth } }], {
      compress: 0.65,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    if (manipulated?.uri) local = manipulated.uri;
  } catch {
    /* orijinal */
  }
  let buffer = await uriToArrayBuffer(local);
  const MAX_BYTES = 1_000_000;
  if (buffer.byteLength > MAX_BYTES) {
    try {
      const w = buffer.byteLength > 800_000 ? 600 : 800;
      const again = await ImageManipulator.manipulateAsync(local, [{ resize: { width: w } }], {
        compress: 0.5,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      if (again?.uri) buffer = await uriToArrayBuffer(again.uri);
    } catch {
      /* */
    }
  }
  const { mime } = getMimeAndExt(local, 'image');
  return { buffer, mime };
}

async function sendOneStaffImage(
  actor: Extract<ChatMediaActor, { kind: 'staff' }>,
  uri: string,
  content: string
): Promise<{ message: Message | null; conversationId: string; error: string | null }> {
  const arrayBuffer = await uriToArrayBuffer(uri);
  const { mime } = getMimeAndExt(uri, 'image');
  const mediaUrl = await uploadImageMessageForStaff(arrayBuffer, mime);
  const { data, error, conversationId } = await staffSendMessage(
    actor.conversationId,
    actor.staffId,
    actor.staffName,
    actor.staffAvatar,
    content,
    'image',
    mediaUrl
  );
  return { message: data, conversationId, error };
}

async function sendOneGuestImage(
  actor: Extract<ChatMediaActor, { kind: 'guest' }>,
  uri: string,
  content: string
): Promise<{ messageId: string | null; conversationId: string }> {
  const { buffer, mime } = await prepareGuestImageBuffer(uri);
  const mediaUrl = await uploadImageMessageForGuest(actor.appToken, actor.conversationId, buffer, mime);
  const { messageId, conversationId } = await guestSendMessage(
    actor.appToken,
    actor.conversationId,
    content,
    'image',
    mediaUrl
  );
  return { messageId, conversationId: conversationId ?? actor.conversationId };
}

export async function sendChatImageUris(
  actor: ChatMediaActor,
  uris: string[],
  _photoLabel: string
): Promise<{ conversationId: string; sentMessages: Message[]; failed: number }> {
  if (!uris.length) return { conversationId: actor.conversationId, sentMessages: [], failed: 0 };
  let conversationId = actor.conversationId;
  const sentMessages: Message[] = [];
  let failed = 0;
  const albumBatchId =
    uris.length > 1 ? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` : null;

  for (const uri of uris) {
    const content = albumBatchId ? makeChatAlbumContent(albumBatchId) : '';
    try {
      if (actor.kind === 'staff') {
        const { message, conversationId: cid, error } = await sendOneStaffImage(
          { ...actor, conversationId },
          uri,
          content
        );
        conversationId = cid;
        if (error || !message) {
          failed += 1;
          continue;
        }
        sentMessages.push(message);
      } else {
        const { messageId, conversationId: cid } = await sendOneGuestImage(
          { ...actor, conversationId },
          uri,
          content
        );
        conversationId = cid;
        if (!messageId) {
          failed += 1;
          continue;
        }
      }
    } catch {
      failed += 1;
    }
  }

  return { conversationId, sentMessages, failed };
}

/** @deprecated sendChatVideoBatch kullanın */
export { sendChatVideoBatch as sendChatVideoUris } from '@/lib/chatVideoBatchSend';
