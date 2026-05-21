import { isLocalVideoPreviewUrl, isMuxPendingMediaUrl } from '@/lib/muxChat';

export function isLocalVideoFileUri(uri: string): boolean {
  const u = uri.trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith('file://') || u.startsWith('content://')) return true;
  return /\.(mp4|mov|m4v|webm|mkv)(\?|$)/i.test(u);
}

export function isImagePosterUri(uri: string): boolean {
  const u = uri.trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith('http') && u.includes('image.mux.com')) return true;
  return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u) || u.includes('imagemanipulator');
}

export type ChatVideoPreviewSources = {
  posterUri: string | null;
  videoUri: string | null;
  hasEarlyPreview: boolean;
};

/** Kartta gösterilecek poster (JPEG) veya yerel video URI. */
export function resolveChatVideoPreviewSources(
  mediaUrl: string | null | undefined,
  mediaThumbnail: string | null | undefined
): ChatVideoPreviewSources {
  const url = (mediaUrl ?? '').trim();
  const thumb = (mediaThumbnail ?? '').trim();

  const pack = (posterUri: string | null, videoUri: string | null): ChatVideoPreviewSources => ({
    posterUri,
    videoUri,
    hasEarlyPreview: Boolean(posterUri || videoUri),
  });

  if (thumb && isImagePosterUri(thumb)) {
    return pack(thumb, null);
  }

  if (isLocalVideoPreviewUrl(url)) {
    if (thumb && isLocalVideoFileUri(thumb)) {
      return pack(null, thumb);
    }
    return pack(null, thumb || null);
  }

  if (thumb && isLocalVideoFileUri(thumb)) {
    return pack(null, thumb);
  }

  if (thumb && (thumb.startsWith('http://') || thumb.startsWith('https://'))) {
    return pack(thumb, null);
  }

  if (url && !isMuxPendingMediaUrl(url) && !isLocalVideoPreviewUrl(url)) {
    return pack(thumb || url, null);
  }

  return pack(thumb || null, null);
}
