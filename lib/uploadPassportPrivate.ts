import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

export async function uploadPassportPrivateFromUri(params: {
  uri: string;
  subfolder?: string;
}): Promise<{ path: string; publicUrl: string }> {
  const res = await uploadUriToPublicBucket({
    bucketId: 'feed-media',
    uri: params.uri,
    kind: 'image',
    subfolder: params.subfolder ?? 'kbs-documents',
    // Kimlik görseli her zaman yerel JPEG: base64/Edge yerine doğrudan Storage REST'e
    // binary stream — eski cihazlarda bellek kopyası yok, zayıf internette tek deneme.
    preferStreamUpload: true,
  });
  return { path: res.path, publicUrl: res.publicUrl };
}
