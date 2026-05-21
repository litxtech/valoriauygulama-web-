import type { Message } from '@/lib/messaging';
import { isLocalVideoPreviewUrl, isMuxPendingMediaUrl } from '@/lib/muxChat';

/** Görünmez albüm işareti — UI'da gösterilmez */
export const CHAT_ALBUM_CONTENT_PREFIX = '\u200Balbum:';
export const CHAT_VIDEO_ALBUM_CONTENT_PREFIX = '\u200Bvideo-album:';

export function makeChatAlbumContent(batchId: string): string {
  return `${CHAT_ALBUM_CONTENT_PREFIX}${batchId}`;
}

export function parseChatAlbumId(content: string | null | undefined): string | null {
  const c = (content ?? '').trim();
  if (!c.startsWith(CHAT_ALBUM_CONTENT_PREFIX)) return null;
  const id = c.slice(CHAT_ALBUM_CONTENT_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function isChatAlbumContent(content: string | null | undefined): boolean {
  return parseChatAlbumId(content) != null;
}

export function makeChatVideoAlbumContent(batchId: string): string {
  return `${CHAT_VIDEO_ALBUM_CONTENT_PREFIX}${batchId}`;
}

export function parseChatVideoAlbumId(content: string | null | undefined): string | null {
  const c = (content ?? '').trim();
  if (!c.startsWith(CHAT_VIDEO_ALBUM_CONTENT_PREFIX)) return null;
  const id = c.slice(CHAT_VIDEO_ALBUM_CONTENT_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

const ALBUM_TIME_WINDOW_MS = 20_000;

export type ChatListDisplayItem =
  | { kind: 'message'; message: Message }
  | { kind: 'image_album'; messages: Message[]; key: string }
  | { kind: 'video_album'; messages: Message[]; key: string };

function canGroupImages(a: Message, b: Message): boolean {
  if (a.message_type !== 'image' || b.message_type !== 'image') return false;
  if (a.sender_id !== b.sender_id || a.sender_type !== b.sender_type) return false;

  const albumA = parseChatAlbumId(a.content);
  const albumB = parseChatAlbumId(b.content);
  if (albumA && albumB) return albumA === albumB;
  if (albumA || albumB) return false;

  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  return Math.abs(tb - ta) <= ALBUM_TIME_WINDOW_MS;
}

function canGroupVideos(a: Message, b: Message): boolean {
  if (a.message_type !== 'video' || b.message_type !== 'video') return false;
  if (a.sender_id !== b.sender_id || a.sender_type !== b.sender_type) return false;

  const albumA = parseChatVideoAlbumId(a.content);
  const albumB = parseChatVideoAlbumId(b.content);
  if (albumA && albumB) return albumA === albumB;
  if (albumA || albumB) return false;

  const pending =
    isLocalVideoPreviewUrl(a.media_url) ||
    isMuxPendingMediaUrl(a.media_url) ||
    isLocalVideoPreviewUrl(b.media_url) ||
    isMuxPendingMediaUrl(b.media_url);
  if (!pending) return false;

  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  return Math.abs(tb - ta) <= ALBUM_TIME_WINDOW_MS;
}

/** Ardışık resim / video — WhatsApp tarzı albüm satırı */
export function buildChatListDisplayItems(messages: Message[]): ChatListDisplayItem[] {
  const items: ChatListDisplayItem[] = [];
  let i = 0;

  while (i < messages.length) {
    const m = messages[i];

    if (m.message_type === 'image') {
      const group: Message[] = [m];
      let j = i + 1;
      while (j < messages.length && canGroupImages(group[group.length - 1], messages[j])) {
        group.push(messages[j]);
        j += 1;
      }
      if (group.length > 1) {
        const albumId = parseChatAlbumId(m.content);
        items.push({
          kind: 'image_album',
          messages: group,
          key: albumId ? `img-album-${albumId}` : `img-album-${group.map((x) => x.id).join('-')}`,
        });
      } else {
        items.push({ kind: 'message', message: m });
      }
      i = j;
      continue;
    }

    if (m.message_type === 'video') {
      const group: Message[] = [m];
      let j = i + 1;
      while (j < messages.length && canGroupVideos(group[group.length - 1], messages[j])) {
        group.push(messages[j]);
        j += 1;
      }
      if (group.length > 1) {
        const albumId = parseChatVideoAlbumId(m.content);
        items.push({
          kind: 'video_album',
          messages: group,
          key: albumId ? `vid-album-${albumId}` : `vid-album-${group.map((x) => x.id).join('-')}`,
        });
      } else {
        items.push({ kind: 'message', message: m });
      }
      i = j;
      continue;
    }

    items.push({ kind: 'message', message: m });
    i += 1;
  }

  return items;
}

export function messageVideoThumbUri(msg: Message): string {
  const thumb = (msg.media_thumbnail ?? '').trim();
  if (thumb) return thumb;
  const url = (msg.media_url ?? '').trim();
  if (url && !isLocalVideoPreviewUrl(url) && !isMuxPendingMediaUrl(url)) return url;
  return '';
}

export function messageImageUri(msg: Message): string {
  return (msg.media_thumbnail || msg.media_url || '').trim();
}
