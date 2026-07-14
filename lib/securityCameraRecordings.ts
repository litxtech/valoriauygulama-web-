import { supabase } from '@/lib/supabase';
import { sendBulkToStaff } from '@/lib/notificationService';

export type SecurityCameraRecordingMediaRow = {
  id: string;
  recording_id: string;
  media_type: 'image' | 'video';
  storage_path: string | null;
  public_url: string;
  thumbnail_url: string | null;
  sort_order: number;
  created_at?: string;
};

export type SecurityCameraRecordingRow = {
  id: string;
  organization_id: string;
  record_no: string | null;
  title: string;
  note: string | null;
  camera_label: string | null;
  location_label: string | null;
  recorded_at: string | null;
  created_by_staff_id: string;
  created_at: string;
  updated_at: string;
  creator?: { full_name: string | null } | null;
  media?: SecurityCameraRecordingMediaRow[];
};

const LIST_SELECT =
  'id, record_no, title, note, camera_label, location_label, recorded_at, created_at, created_by_staff_id, media:security_camera_recording_media(id, recording_id, media_type, public_url, thumbnail_url, sort_order)';

const DETAIL_SELECT =
  'id, organization_id, record_no, title, note, camera_label, location_label, recorded_at, created_by_staff_id, created_at, updated_at, creator:staff!security_camera_recordings_created_by_staff_id_fkey(full_name), media:security_camera_recording_media(id, recording_id, media_type, storage_path, public_url, thumbnail_url, sort_order, created_at)';

export async function listSecurityCameraRecordings(args: { search?: string; limit?: number } = {}) {
  let q = supabase
    .from('security_camera_recordings')
    .select(LIST_SELECT)
    .order('created_at', { ascending: false })
    .limit(args.limit ?? 100);

  if (args.search?.trim()) {
    const term = args.search.trim();
    q = q.or(
      `title.ilike.%${term}%,note.ilike.%${term}%,camera_label.ilike.%${term}%,location_label.ilike.%${term}%,record_no.ilike.%${term}%`
    );
  }
  return await q;
}

export async function getSecurityCameraRecording(id: string) {
  return await supabase.from('security_camera_recordings').select(DETAIL_SELECT).eq('id', id).maybeSingle();
}

export async function createSecurityCameraRecording(
  organizationId: string,
  staffId: string,
  input: {
    title: string;
    note?: string | null;
    cameraLabel?: string | null;
    locationLabel?: string | null;
    recordedAt?: string | null;
    media?: Array<{
      publicUrl: string;
      storagePath?: string | null;
      mediaType: 'image' | 'video';
      thumbnailUrl?: string | null;
      sortOrder?: number;
    }>;
  }
) {
  const payload = {
    organization_id: organizationId,
    created_by_staff_id: staffId,
    title: input.title.trim(),
    note: input.note?.trim() || null,
    camera_label: input.cameraLabel?.trim() || null,
    location_label: input.locationLabel?.trim() || null,
    recorded_at: input.recordedAt || null,
  };

  const { data, error } = await supabase
    .from('security_camera_recordings')
    .insert(payload)
    .select('id, record_no')
    .single();
  if (error || !data) return { data, error };

  const media = input.media ?? [];
  if (media.length > 0) {
    const rows = media.map((m, i) => ({
      organization_id: organizationId,
      recording_id: data.id,
      media_type: m.mediaType,
      storage_path: m.storagePath ?? null,
      public_url: m.publicUrl,
      thumbnail_url: m.thumbnailUrl ?? null,
      sort_order: m.sortOrder ?? i,
      created_by_staff_id: staffId,
    }));
    const mediaRes = await supabase.from('security_camera_recording_media').insert(rows);
    if (mediaRes.error) return { data, error: mediaRes.error };
  }

  return { data, error: null };
}

export async function deleteSecurityCameraRecording(id: string) {
  return await supabase.from('security_camera_recordings').delete().eq('id', id);
}

export async function notifySecurityCameraRecordingCreated(params: {
  organizationId: string;
  createdByStaffId: string;
  recording: {
    id: string;
    record_no: string | null;
    title: string;
    camera_label?: string | null;
  };
}) {
  const no = params.recording.record_no ? ` (${params.recording.record_no})` : '';
  const cam = params.recording.camera_label?.trim()
    ? ` · ${params.recording.camera_label.trim()}`
    : '';
  await sendBulkToStaff({
    target: 'security',
    organizationId: params.organizationId,
    title: 'Önemli kamera kaydı',
    body: `${params.recording.title}${no}${cam}`,
    createdByStaffId: params.createdByStaffId,
    notificationType: 'staff_security_camera_recording',
    category: 'staff',
    data: {
      url: `/staff/security-recordings/${params.recording.id}`,
      recordingId: params.recording.id,
    },
  });
}
