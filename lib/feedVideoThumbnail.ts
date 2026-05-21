import { extractChatVideoThumbnailUri, ensureChatVideoLocalUri } from '@/lib/chatVideoThumbnail';
import { uploadGuestFeedMedia, uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

const FEED_MEDIA_BUCKET = 'feed-media';

/** Feed videosu için küçük JPEG poster üret ve feed-media’ya yükle. */
export async function extractAndUploadFeedVideoThumbnail(
  localVideoUri: string,
  options?: { guestId?: string }
): Promise<string | null> {
  const local = await ensureChatVideoLocalUri(localVideoUri);
  const thumbLocal = await extractChatVideoThumbnailUri(local);
  if (!thumbLocal) return null;

  try {
    if (options?.guestId) {
      const { publicUrl } = await uploadGuestFeedMedia({
        uri: thumbLocal,
        guestId: options.guestId,
        kind: 'image',
      });
      return publicUrl;
    }
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: FEED_MEDIA_BUCKET,
      uri: thumbLocal,
      kind: 'image',
      subfolder: 'posts',
    });
    return publicUrl;
  } catch {
    return null;
  }
}
