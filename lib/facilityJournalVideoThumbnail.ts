import { extractChatVideoThumbnailUri, ensureChatVideoLocalUri } from '@/lib/chatVideoThumbnail';
import { FACILITY_JOURNAL_MEDIA_BUCKET } from '@/lib/facilityJournalMedia';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

/** Kullanım kaydı videosu için JPEG poster üret ve storage’a yükle. */
export async function extractAndUploadFacilityJournalVideoThumbnail(
  localVideoUri: string,
  organizationId: string
): Promise<string | null> {
  const local = await ensureChatVideoLocalUri(localVideoUri);
  const thumbLocal = await extractChatVideoThumbnailUri(local);
  if (!thumbLocal) return null;

  try {
    const { publicUrl } = await uploadUriToPublicBucket({
      bucketId: FACILITY_JOURNAL_MEDIA_BUCKET,
      uri: thumbLocal,
      kind: 'image',
      subfolder: `records/${organizationId}/thumbnails`,
    });
    return publicUrl;
  } catch {
    return null;
  }
}
