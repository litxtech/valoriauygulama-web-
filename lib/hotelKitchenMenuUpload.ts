import * as ImageManipulator from 'expo-image-manipulator';
import { HOTEL_KITCHEN_MENU_BUCKET } from '@/lib/hotelKitchenMenu';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import {
  extractErrorMessage,
  isSupabaseUnavailableError,
  sleepMs,
} from '@/lib/supabaseTransientErrors';

const MENU_IMAGE_MAX_WIDTH = 900;
const UPLOAD_MAX_ATTEMPTS = 4;

async function prepareMenuImageUri(localUri: string): Promise<string> {
  try {
    const out = await ImageManipulator.manipulateAsync(
      localUri,
      [{ resize: { width: MENU_IMAGE_MAX_WIDTH } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
    );
    return out?.uri ?? localUri;
  } catch {
    return localUri;
  }
}

/** Edge upload + küçültme — daha hızlı yükleme. */
export async function uploadHotelKitchenMenuImage(params: {
  organizationId: string;
  itemId: string;
  localUri: string;
}): Promise<string> {
  const { organizationId, itemId, localUri } = params;
  const prepared = await prepareMenuImageUri(localUri);
  const subfolder = `org/${organizationId}/items/${itemId}`;
  let lastMsg = '';

  for (let attempt = 1; attempt <= UPLOAD_MAX_ATTEMPTS; attempt++) {
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: HOTEL_KITCHEN_MENU_BUCKET,
        uri: prepared,
        kind: 'image',
        subfolder,
      });
      return publicUrl;
    } catch (e: unknown) {
      lastMsg = extractErrorMessage(e);
      if (attempt < UPLOAD_MAX_ATTEMPTS && isSupabaseUnavailableError(lastMsg)) {
        await sleepMs(500 + attempt * 450);
        continue;
      }
      throw e instanceof Error ? e : new Error(lastMsg || 'upload failed');
    }
  }

  throw new Error(lastMsg || 'upload failed');
}

export async function uploadHotelKitchenMenuImagesParallel(params: {
  organizationId: string;
  itemId: string;
  localUris: string[];
}): Promise<{ urls: string[]; errors: string[] }> {
  const { organizationId, itemId, localUris } = params;
  const results = await Promise.all(
    localUris.map(async (uri) => {
      try {
        const url = await uploadHotelKitchenMenuImage({ organizationId, itemId, localUri: uri });
        return { ok: true as const, url };
      } catch (e: unknown) {
        return { ok: false as const, message: (e as Error)?.message ?? 'upload failed' };
      }
    })
  );
  const urls: string[] = [];
  const errors: string[] = [];
  for (const r of results) {
    if (r.ok) urls.push(r.url);
    else errors.push(r.message);
  }
  return { urls, errors };
}
