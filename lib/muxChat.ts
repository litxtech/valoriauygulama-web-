/**
 * Mux mesaj videosu: URL ayrıştırma, oynatma adresleri.
 */

export const MUX_PENDING_PREFIX = 'mux://pending/';
export const MUX_PROCESSING_PREFIX = 'mux://processing/';
/** İstemci önizlemesi — sunucuya gitmeden yerel video URI (media_thumbnail). */
export const LOCAL_VIDEO_PREVIEW_PREFIX = 'local://preview';

export type MuxVideoMessageState = 'pending' | 'processing' | 'ready' | 'error' | 'unknown';

export function isLocalVideoPreviewUrl(mediaUrl: string | null | undefined): boolean {
  return (mediaUrl ?? '').trim().startsWith(LOCAL_VIDEO_PREVIEW_PREFIX);
}

export function getMuxVideoMessageState(mediaUrl: string | null | undefined): MuxVideoMessageState {
  const u = (mediaUrl ?? '').trim();
  if (!u) return 'unknown';
  if (isLocalVideoPreviewUrl(u)) return 'pending';
  if (u === 'mux://pending' || u.startsWith(MUX_PENDING_PREFIX)) return 'pending';
  if (u.startsWith(MUX_PROCESSING_PREFIX)) return 'processing';
  if (u.includes('stream.mux.com') && /\.m3u8/i.test(u)) return 'ready';
  if (u.startsWith('mux://')) return 'processing';
  return 'unknown';
}

export function isMuxPendingMediaUrl(mediaUrl: string | null | undefined): boolean {
  return getMuxVideoMessageState(mediaUrl) === 'pending' || getMuxVideoMessageState(mediaUrl) === 'processing';
}

export function getMuxHlsPlaybackUrl(mediaUrl: string | null | undefined): string | null {
  const u = (mediaUrl ?? '').trim();
  if (getMuxVideoMessageState(u) === 'ready') return u;
  return null;
}

export function getMuxThumbnailFromMessage(
  mediaUrl: string | null | undefined,
  mediaThumbnail: string | null | undefined
): string | null {
  const thumb = (mediaThumbnail ?? '').trim();
  if (thumb) return thumb;
  const hls = getMuxHlsPlaybackUrl(mediaUrl);
  if (!hls) return null;
  const m = hls.match(/stream\.mux\.com\/([^./]+)/);
  if (!m?.[1]) return null;
  return `https://image.mux.com/${m[1]}/thumbnail.jpg?width=400&time=1`;
}

export const CHAT_VIDEO_MAX_BYTES = 600 * 1024 * 1024;
