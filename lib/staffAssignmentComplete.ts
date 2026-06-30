import { supabase } from '@/lib/supabase';
import { STAFF_TASK_MEDIA_BUCKET } from '@/lib/staffAssignmentMedia';
import { uploadBufferToPublicBucket } from '@/lib/storagePublicUpload';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { prepareCrossPlatformUploadImageUri } from '@/lib/crossPlatformImage';

export const MAX_COMPLETION_PROOF_PHOTOS = 4;

export async function uploadAssignmentCompletionProofs(
  assignmentId: string,
  imageUris: string[]
): Promise<{ urls: string[]; error?: string }> {
  const urls: string[] = [];
  for (let i = 0; i < imageUris.length; i++) {
    const uri = imageUris[i]?.trim();
    if (!uri) continue;
    try {
      const uploadUri = await prepareCrossPlatformUploadImageUri(uri);
      const buf = await uriToArrayBuffer(uploadUri);
      const { publicUrl } = await uploadBufferToPublicBucket({
        bucketId: STAFF_TASK_MEDIA_BUCKET,
        buffer: buf,
        contentType: 'image/jpeg',
        extension: 'jpg',
        subfolder: `tasks/${assignmentId}/completion`,
      });
      urls.push(publicUrl);
    } catch (e) {
      return { urls, error: (e as Error)?.message ?? 'Fotoğraf yüklenemedi.' };
    }
  }
  return { urls };
}

export async function completeStaffAssignment(params: {
  assignmentId: string;
  staffId: string;
  note?: string;
  proofUris?: string[];
}): Promise<{ error?: string }> {
  let proofUrls: string[] = [];
  if (params.proofUris && params.proofUris.length > 0) {
    const up = await uploadAssignmentCompletionProofs(params.assignmentId, params.proofUris);
    if (up.error) return { error: up.error };
    proofUrls = up.urls;
  }

  const patch: Record<string, unknown> = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    completion_note: params.note?.trim() || null,
    completion_proof_urls: proofUrls,
  };

  const { error } = await supabase
    .from('staff_assignments')
    .update(patch)
    .eq('id', params.assignmentId)
    .eq('assigned_staff_id', params.staffId)
    .in('status', ['pending', 'in_progress']);

  return error ? { error: error.message } : {};
}

export async function failStaffAssignment(params: {
  assignmentId: string;
  staffId: string;
  reason: string;
}): Promise<{ error?: string }> {
  const reason = params.reason.trim();
  if (reason.length < 3) {
    return { error: 'Açıklama en az 3 karakter olmalı.' };
  }

  const { error } = await supabase
    .from('staff_assignments')
    .update({
      status: 'failed',
      failed_at: new Date().toISOString(),
      failure_reason: reason,
      completion_note: null,
      completion_proof_urls: [],
    })
    .eq('id', params.assignmentId)
    .eq('assigned_staff_id', params.staffId)
    .in('status', ['pending', 'in_progress']);

  return error ? { error: error.message } : {};
}
