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
  });
  return { path: res.path, publicUrl: res.publicUrl };
}
