/**
 * Sohbetten video gönderme — seçimden sonra anında UI, yükleme arka planda.
 */
import {
  type ChatMediaActor,
  pickChatVideoFromCamera,
  pickChatVideosFromLibrary,
} from '@/lib/chatMediaSend';
import {
  sendChatVideoBatch,
  type ChatVideoBatchHandlers,
} from '@/lib/chatVideoBatchSend';

export type ChatVideoSendActor = ChatMediaActor;

export async function sendChatVideoFromPicker(
  actor: ChatVideoSendActor,
  source: 'camera' | 'library',
  handlers: ChatVideoBatchHandlers
): Promise<{ conversationId: string; queued: number }> {
  const uris =
    source === 'camera'
      ? ([await pickChatVideoFromCamera()].filter(Boolean) as string[])
      : await pickChatVideosFromLibrary();
  if (!uris.length) return { conversationId: actor.conversationId, queued: 0 };
  return sendChatVideoBatch(actor, uris, handlers);
}

export { pickChatVideosFromLibrary } from '@/lib/chatMediaSend';
