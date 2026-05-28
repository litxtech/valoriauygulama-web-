import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';

const BUCKET = 'smart-ops-tasks';

export async function uploadSmartOpsTaskPhoto(params: {
  organizationId: string;
  staffId: string;
  taskId: string;
  uri: string;
}): Promise<string> {
  const subfolder = `${params.organizationId}/${params.staffId}/${params.taskId}`;
  const url = await uploadUriToPublicBucket({
    bucketId: BUCKET,
    uri: params.uri,
    kind: 'image',
    subfolder,
  });
  return url;
}
