import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { prepareCrossPlatformUploadImageUri } from '@/lib/crossPlatformImage';

/** HEIC/HEIF Android'de açılmaz; JPEG'e dönüştürdüğümüz için dosya adını da .jpg yapar. */
function normalizeImageFileName(name: string): string {
  return name.replace(/\.(heic|heif)$/i, '.jpg');
}

function contentTypeForName(name: string): string {
  const l = name.toLowerCase();
  if (l.endsWith('.png')) return 'image/png';
  if (l.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function uploadDiningVenueImage(params: {
  organizationId: string;
  venueId: string;
  localUri: string;
  fileName: string;
}): Promise<string> {
  const { organizationId, venueId, localUri } = params;
  const fileName = normalizeImageFileName(params.fileName);
  const path = `org/${organizationId}/dining-venues/${venueId}/${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const uploadUri = await prepareCrossPlatformUploadImageUri(localUri);
  const buf = await uriToArrayBuffer(uploadUri, { mediaKind: 'image' });
  const { error } = await supabase.storage
    .from('dining-venues')
    .upload(path, buf, { contentType: contentTypeForName(fileName), upsert: true });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from('dining-venues').getPublicUrl(path);
  return data.publicUrl;
}
