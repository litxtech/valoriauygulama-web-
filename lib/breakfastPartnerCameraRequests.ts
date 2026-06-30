/**
 * Kahvaltı partner — kamera kaydı talep modülü (yeni, mevcut sisteme dokunmaz).
 */
import * as ImagePicker from 'expo-image-picker';
import { supabase, supabaseMessaging } from '@/lib/supabase';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { formatPartnerDate, formatPartnerTime } from '@/lib/breakfastPartner';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { feedPostMediaPickerGalleryOptions, resolveFeedPickedMediaUri } from '@/lib/feedPostMediaPicker';
import {
  isSupabaseUnavailableError,
  isTransientSupabaseDbError,
  sanitizeSupabaseErrorMessage,
  sleepMs,
} from '@/lib/supabaseTransientErrors';

/** Ham fetch — resilient 522 sarmalayıcısı partner RPC/insert için yanlış alarm üretebiliyor. */
const partnerDb = supabaseMessaging;

export type PartnerCameraRequestContext = {
  partnerUserId: string;
  partnerHotelId: string;
  organizationId: string;
};

function formatCameraDbError(error: { message?: string; code?: string } | null): string {
  if (!error) return 'Bilinmeyen hata';
  const msg = sanitizeSupabaseErrorMessage(error.message);
  if (error.code === 'PGRST202') return 'Sunucu şeması güncelleniyor. Birkaç saniye sonra tekrar deneyin.';
  if (error.code === '42501') {
    return 'Bu işlem için yetkiniz yok. Admin hesabıyla giriş yaptığınızdan emin olun.';
  }
  if (/yetki\s*yok|yetkisiz/i.test(msg)) {
    return 'Yetkisiz: Bu işlem yalnızca admin hesabıyla yapılabilir.';
  }
  return msg;
}

function isTransientCameraDbError(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  if (isSupabaseUnavailableError(error.message)) return true;
  if (isTransientSupabaseDbError(error)) return true;
  if (error.code === 'SUPABASE_UNAVAILABLE' || error.code === 'PGRST002') return true;
  return false;
}

function normalizeTimeParam(value: string): string {
  const t = value.trim();
  return /^\d{1,2}:\d{2}$/.test(t) ? `${t}:00` : t;
}

export type CameraRequestStatus =
  | 'bekliyor'
  | 'video_yuklendi'
  | 'itiraz_bekliyor'
  | 'itiraz_cevaplandi'
  | 'kapatildi'
  | 'reddedildi';

export const CAMERA_REQUEST_STATUS_LABELS: Record<CameraRequestStatus, string> = {
  bekliyor: 'BEKLİYOR',
  video_yuklendi: 'VİDEO YÜKLENDİ',
  itiraz_bekliyor: 'İTİRAZ BEKLİYOR',
  itiraz_cevaplandi: 'İTİRAZ CEVAPLANDI',
  kapatildi: 'KAPATILDI',
  reddedildi: 'REDDEDİLDİ',
};

export type CameraRequestRow = {
  id: string;
  partnerUserId: string;
  partnerHotelId: string;
  organizationId: string;
  requestDate: string;
  timeStart: string;
  timeEnd: string | null;
  guestName: string | null;
  roomNumber: string | null;
  description: string;
  requestReason: string;
  status: CameraRequestStatus;
  adminNote: string | null;
  rejectionReason: string | null;
  videoViewedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  hotelName?: string;
};

export type CameraRequestVideo = {
  id: string;
  cameraRequestId: string;
  storagePath: string;
  publicUrl: string;
  mimeType: string | null;
  fileSize: number | null;
  isReplacement: boolean;
  createdAt: string;
};

export type CameraRequestMessage = {
  id: string;
  cameraRequestId: string;
  senderType: 'partner' | 'staff' | 'system';
  senderId: string | null;
  body: string;
  createdAt: string;
};

export type CameraRequestAppeal = {
  id: string;
  cameraRequestId: string;
  partnerUserId: string;
  appealReason: string;
  description: string;
  adminResponse: string | null;
  status: 'bekliyor' | 'cevaplandi';
  createdAt: string;
  respondedAt: string | null;
};

export type CameraRequestDetail = CameraRequestRow & {
  videos: CameraRequestVideo[];
  messages: CameraRequestMessage[];
  appeals: CameraRequestAppeal[];
};

const CAMERA_VIDEO_BUCKET = 'breakfast-partner-camera';
const ALLOWED_VIDEO_EXT = new Set(['mp4', 'mov', 'm4v']);

function mapRequestRow(raw: Record<string, unknown>): CameraRequestRow {
  const hotel = raw.breakfast_partner_hotels as { name?: string } | null;
  return {
    id: String(raw.id),
    partnerUserId: String(raw.partner_user_id),
    partnerHotelId: String(raw.partner_hotel_id),
    organizationId: String(raw.organization_id),
    requestDate: String(raw.request_date),
    timeStart: String(raw.time_start),
    timeEnd: (raw.time_end as string | null) ?? null,
    guestName: (raw.guest_name as string | null) ?? null,
    roomNumber: (raw.room_number as string | null) ?? null,
    description: String(raw.description),
    requestReason: String(raw.request_reason),
    status: raw.status as CameraRequestStatus,
    adminNote: (raw.admin_note as string | null) ?? null,
    rejectionReason: (raw.rejection_reason as string | null) ?? null,
    videoViewedAt: (raw.video_viewed_at as string | null) ?? null,
    closedAt: (raw.closed_at as string | null) ?? null,
    createdAt: String(raw.created_at),
    updatedAt: String(raw.updated_at),
    hotelName: hotel?.name ?? undefined,
  };
}

function mapVideoRow(raw: Record<string, unknown>): CameraRequestVideo {
  return {
    id: String(raw.id),
    cameraRequestId: String(raw.camera_request_id),
    storagePath: String(raw.storage_path),
    publicUrl: String(raw.public_url),
    mimeType: (raw.mime_type as string | null) ?? null,
    fileSize: raw.file_size != null ? Number(raw.file_size) : null,
    isReplacement: raw.is_replacement === true,
    createdAt: String(raw.created_at),
  };
}

function mapMessageRow(raw: Record<string, unknown>): CameraRequestMessage {
  return {
    id: String(raw.id),
    cameraRequestId: String(raw.camera_request_id),
    senderType: raw.sender_type as CameraRequestMessage['senderType'],
    senderId: (raw.sender_id as string | null) ?? null,
    body: String(raw.body),
    createdAt: String(raw.created_at),
  };
}

function mapAppealRow(raw: Record<string, unknown>): CameraRequestAppeal {
  return {
    id: String(raw.id),
    cameraRequestId: String(raw.camera_request_id),
    partnerUserId: String(raw.partner_user_id),
    appealReason: String(raw.appeal_reason),
    description: String(raw.description),
    adminResponse: (raw.admin_response as string | null) ?? null,
    status: raw.status as CameraRequestAppeal['status'],
    createdAt: String(raw.created_at),
    respondedAt: (raw.responded_at as string | null) ?? null,
  };
}

/** HH:MM — Postgres time alanı */
export function formatCameraRequestTime(value: string | null | undefined): string {
  if (!value) return '';
  const s = value.trim();
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) return `${m[1].padStart(2, '0')}:${m[2]}`;
  return s.slice(0, 5);
}

export function formatCameraRequestTimeRange(start: string, end: string | null): string {
  const a = formatCameraRequestTime(start);
  const b = end ? formatCameraRequestTime(end) : '';
  return b ? `${a} – ${b}` : a;
}

export function formatCameraRequestListMeta(row: CameraRequestRow): string {
  return `${formatPartnerDate(row.requestDate)} · ${formatCameraRequestTimeRange(row.timeStart, row.timeEnd)}`;
}

export function cameraRequestStatusTone(
  status: CameraRequestStatus
): 'muted' | 'accent' | 'success' | 'danger' | 'info' {
  switch (status) {
    case 'bekliyor':
    case 'itiraz_bekliyor':
      return 'accent';
    case 'video_yuklendi':
      return 'success';
    case 'itiraz_cevaplandi':
      return 'info';
    case 'reddedildi':
      return 'danger';
    case 'kapatildi':
      return 'muted';
    default:
      return 'muted';
  }
}

export function partnerCanAppealCameraRequest(row: CameraRequestRow): boolean {
  return (
    (row.status === 'video_yuklendi' || row.status === 'itiraz_cevaplandi') &&
    Boolean(row.videoViewedAt)
  );
}

export function partnerCanViewCameraVideo(row: CameraRequestRow): boolean {
  return ['video_yuklendi', 'itiraz_bekliyor', 'itiraz_cevaplandi', 'kapatildi'].includes(row.status);
}

// ----- Partner -----

export async function partnerCreateCameraRequest(
  input: {
    requestDate: string;
    timeStart: string;
    timeEnd?: string | null;
    guestName?: string;
    roomNumber?: string;
    description: string;
    requestReason: string;
  },
  ctx: PartnerCameraRequestContext
): Promise<{ id: string | null; error?: string }> {
  const payload = {
    partner_user_id: ctx.partnerUserId,
    partner_hotel_id: ctx.partnerHotelId,
    organization_id: ctx.organizationId,
    request_date: input.requestDate.trim(),
    time_start: normalizeTimeParam(input.timeStart),
    time_end: input.timeEnd?.trim() ? normalizeTimeParam(input.timeEnd) : null,
    guest_name: input.guestName?.trim() || null,
    room_number: input.roomNumber?.trim() || null,
    description: input.description.trim(),
    request_reason: input.requestReason.trim(),
    status: 'bekliyor' as const,
  };

  const rpcBody = {
    p_request_date: payload.request_date,
    p_time_start: payload.time_start,
    p_time_end: payload.time_end,
    p_guest_name: payload.guest_name,
    p_room_number: payload.room_number,
    p_description: payload.description,
    p_request_reason: payload.request_reason,
  };

  let lastError = 'Talep oluşturulamadı.';

  for (const delayMs of [0, 600, 1800, 3500]) {
    if (delayMs) await sleepMs(delayMs);

    const { data, error } = await partnerDb
      .from('camera_requests')
      .insert(payload)
      .select('id')
      .single();

    if (!error && data?.id) return { id: String(data.id) };

    if (error && !isTransientCameraDbError(error)) {
      const msg = formatCameraDbError(error);
      if (
        msg.includes('row-level security') ||
        error.code === '42501' ||
        error.code === 'PGRST204' ||
        error.code === 'PGRST205'
      ) {
        const rpc = await partnerDb.rpc('partner_create_camera_request', rpcBody);
        if (!rpc.error && rpc.data) return { id: rpc.data as string };
        if (rpc.error && !isTransientCameraDbError(rpc.error)) {
          return { id: null, error: formatCameraDbError(rpc.error) };
        }
        lastError = formatCameraDbError(rpc.error);
        continue;
      }
      return { id: null, error: msg };
    }

    lastError = formatCameraDbError(error);

    const rpc = await partnerDb.rpc('partner_create_camera_request', rpcBody);
    if (!rpc.error && rpc.data) return { id: rpc.data as string };
    if (rpc.error && !isTransientCameraDbError(rpc.error)) {
      return { id: null, error: formatCameraDbError(rpc.error) };
    }
    if (rpc.error) lastError = formatCameraDbError(rpc.error);
  }

  return {
    id: null,
    error: isSupabaseUnavailableError(lastError)
      ? 'Supabase geçici olarak erişilemiyor. Wi‑Fi ile birkaç saniye sonra tekrar deneyin.'
      : lastError,
  };
}

export async function partnerListCameraRequests(limit = 60): Promise<CameraRequestRow[]> {
  const { data, error } = await partnerDb
    .from('camera_requests')
    .select(
      'id, partner_user_id, partner_hotel_id, organization_id, request_date, time_start, time_end, guest_name, room_number, description, request_reason, status, admin_note, rejection_reason, video_viewed_at, closed_at, created_at, updated_at'
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(formatCameraDbError(error));
  return (data ?? []).map((row) => mapRequestRow(row as Record<string, unknown>));
}

export async function partnerGetCameraRequestDetail(requestId: string): Promise<CameraRequestDetail | null> {
  const { data: req, error } = await partnerDb
    .from('camera_requests')
    .select(
      'id, partner_user_id, partner_hotel_id, organization_id, request_date, time_start, time_end, guest_name, room_number, description, request_reason, status, admin_note, rejection_reason, video_viewed_at, closed_at, created_at, updated_at'
    )
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new Error(formatCameraDbError(error));
  if (!req) return null;

  const [videos, messages, appeals] = await Promise.all([
    partnerDb
      .from('camera_request_videos')
      .select('id, camera_request_id, storage_path, public_url, mime_type, file_size, is_replacement, created_at')
      .eq('camera_request_id', requestId)
      .order('created_at', { ascending: false }),
    partnerDb
      .from('camera_request_messages')
      .select('id, camera_request_id, sender_type, sender_id, body, created_at')
      .eq('camera_request_id', requestId)
      .order('created_at', { ascending: true }),
    partnerDb
      .from('camera_request_appeals')
      .select(
        'id, camera_request_id, partner_user_id, appeal_reason, description, admin_response, status, created_at, responded_at'
      )
      .eq('camera_request_id', requestId)
      .order('created_at', { ascending: false }),
  ]);

  if (videos.error) throw new Error(videos.error.message);
  if (messages.error) throw new Error(messages.error.message);
  if (appeals.error) throw new Error(appeals.error.message);

  return {
    ...mapRequestRow(req as Record<string, unknown>),
    videos: (videos.data ?? []).map((r) => mapVideoRow(r as Record<string, unknown>)),
    messages: (messages.data ?? []).map((r) => mapMessageRow(r as Record<string, unknown>)),
    appeals: (appeals.data ?? []).map((r) => mapAppealRow(r as Record<string, unknown>)),
  };
}

export async function partnerMarkCameraRequestViewed(requestId: string): Promise<void> {
  await partnerDb.rpc('partner_mark_camera_request_viewed', { p_request_id: requestId });
}

export async function partnerCreateCameraRequestAppeal(input: {
  requestId: string;
  appealReason: string;
  description: string;
}): Promise<{ id: string | null; error?: string }> {
  const body = {
    p_request_id: input.requestId,
    p_appeal_reason: input.appealReason.trim(),
    p_description: input.description.trim(),
  };
  let lastError = 'İtiraz oluşturulamadı.';
  for (const delayMs of [0, 700, 2000]) {
    if (delayMs) await sleepMs(delayMs);
    const { data, error } = await partnerDb.rpc('partner_create_camera_request_appeal', body);
    if (!error && data) return { id: data as string };
    if (error && !isTransientCameraDbError(error)) {
      return { id: null, error: formatCameraDbError(error) };
    }
    if (error) lastError = formatCameraDbError(error);
  }
  return { id: null, error: lastError };
}

// ----- Admin -----

export async function adminListCameraRequests(orgId: string, limit = 100): Promise<CameraRequestRow[]> {
  const { data, error } = await supabase
    .from('camera_requests')
    .select(
      'id, partner_user_id, partner_hotel_id, organization_id, request_date, time_start, time_end, guest_name, room_number, description, request_reason, status, admin_note, rejection_reason, video_viewed_at, closed_at, created_at, updated_at, breakfast_partner_hotels(name)'
    )
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(formatCameraDbError(error));
  return (data ?? []).map((row) => mapRequestRow(row as Record<string, unknown>));
}

export async function adminGetCameraRequestDetail(requestId: string): Promise<CameraRequestDetail | null> {
  const { data: req, error } = await supabase
    .from('camera_requests')
    .select(
      'id, partner_user_id, partner_hotel_id, organization_id, request_date, time_start, time_end, guest_name, room_number, description, request_reason, status, admin_note, rejection_reason, video_viewed_at, closed_at, created_at, updated_at, breakfast_partner_hotels(name)'
    )
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new Error(formatCameraDbError(error));
  if (!req) return null;

  const [videos, messages, appeals] = await Promise.all([
    supabase
      .from('camera_request_videos')
      .select('id, camera_request_id, storage_path, public_url, mime_type, file_size, is_replacement, created_at')
      .eq('camera_request_id', requestId)
      .order('created_at', { ascending: false }),
    supabase
      .from('camera_request_messages')
      .select('id, camera_request_id, sender_type, sender_id, body, created_at')
      .eq('camera_request_id', requestId)
      .order('created_at', { ascending: true }),
    supabase
      .from('camera_request_appeals')
      .select(
        'id, camera_request_id, partner_user_id, appeal_reason, description, admin_response, status, created_at, responded_at'
      )
      .eq('camera_request_id', requestId)
      .order('created_at', { ascending: false }),
  ]);

  if (videos.error) throw new Error(videos.error.message);
  if (messages.error) throw new Error(messages.error.message);
  if (appeals.error) throw new Error(appeals.error.message);

  return {
    ...mapRequestRow(req as Record<string, unknown>),
    videos: (videos.data ?? []).map((r) => mapVideoRow(r as Record<string, unknown>)),
    messages: (messages.data ?? []).map((r) => mapMessageRow(r as Record<string, unknown>)),
    appeals: (appeals.data ?? []).map((r) => mapAppealRow(r as Record<string, unknown>)),
  };
}

export async function adminAddCameraRequestNote(requestId: string, body: string): Promise<string | null> {
  const { error } = await supabase.rpc('staff_add_camera_request_message', {
    p_request_id: requestId,
    p_body: body.trim(),
    p_set_admin_note: true,
  });
  return error?.message ?? null;
}

export async function adminRejectCameraRequest(requestId: string, reason: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('staff_reject_camera_request', {
    p_request_id: requestId,
    p_reason: reason.trim(),
  });
  if (error) return error.message;
  if (!data) return 'Talep reddedilemedi.';
  return null;
}

export async function adminCloseCameraRequest(requestId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('staff_close_camera_request', { p_request_id: requestId });
  if (error) return error.message;
  if (!data) return 'Talep kapatılamadı.';
  return null;
}

export async function adminRespondCameraRequestAppeal(appealId: string, response: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('staff_respond_camera_request_appeal', {
    p_appeal_id: appealId,
    p_response: response.trim(),
  });
  if (error) return error.message;
  if (!data) return 'İtiraz cevaplanamadı.';
  return null;
}

export async function pickCameraRequestVideo(): Promise<{ uri: string; mime: string; name: string } | null> {
  const granted = await ensureMediaLibraryPermission({
    title: 'Galeri izni',
    message: 'Kamera kaydı videosu seçmek için galeri erişimi gerekir.',
    settingsMessage: 'Galeri izni kapalı. Video yüklemek için ayarlardan izin verin.',
  });
  if (!granted) return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    ...feedPostMediaPickerGalleryOptions,
    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
    allowsMultipleSelection: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;

  const asset = result.assets[0];
  const { uri } = await resolveFeedPickedMediaUri(asset);
  if (!uri) return null;

  const rawName = asset.fileName ?? uri.split('/').pop() ?? 'video.mp4';
  const name = rawName.includes('.') ? rawName : `${rawName}.mp4`;
  const ext = name.split('.').pop()?.toLowerCase() ?? 'mp4';
  const mimeFromAsset = asset.mimeType?.split(';')[0]?.trim().toLowerCase();
  const mime =
    mimeFromAsset && mimeFromAsset.startsWith('video/')
      ? mimeFromAsset
      : ext === 'mov'
        ? 'video/quicktime'
        : ext === 'm4v'
          ? 'video/x-m4v'
          : 'video/mp4';

  if (!ALLOWED_VIDEO_EXT.has(ext) && !mime.startsWith('video/')) {
    throw new Error('Yalnızca mp4, mov ve m4v formatları desteklenir.');
  }

  return { uri, mime, name };
}

export async function adminUploadCameraRequestVideo(params: {
  requestId: string;
  partnerHotelId: string;
  localUri: string;
  mimeType: string;
  fileName: string;
  isReplacement?: boolean;
  onProgress?: (fraction: number) => void;
}): Promise<{ videoId: string | null; error?: string }> {
  params.onProgress?.(0.05);
  let publicUrl: string;
  let path: string;
  try {
    ({ publicUrl, path } = await uploadUriToPublicBucket({
      bucketId: CAMERA_VIDEO_BUCKET,
      uri: params.localUri,
      kind: 'video',
      subfolder: `${params.partnerHotelId}/${params.requestId}`,
      preferStreamUpload: true,
    }));
  } catch (e) {
    const msg = (e as Error)?.message ?? 'Video yüklenemedi';
    return {
      videoId: null,
      error: isSupabaseUnavailableError(msg)
        ? 'Supabase geçici olarak erişilemiyor. Wi‑Fi ile birkaç saniye sonra tekrar deneyin.'
        : msg,
    };
  }
  params.onProgress?.(0.85);

  const rpcBody = {
    p_request_id: params.requestId,
    p_storage_path: path,
    p_public_url: publicUrl,
    p_mime_type: params.mimeType,
    p_file_size: null,
    p_is_replacement: params.isReplacement ?? false,
  };

  let lastError = 'Video kaydı oluşturulamadı.';
  for (const delayMs of [0, 700, 1800]) {
    if (delayMs) await sleepMs(delayMs);
    const { data, error } = await partnerDb.rpc('staff_register_camera_request_video', rpcBody);
    params.onProgress?.(1);
    if (!error && data) return { videoId: data as string };
    if (error && !isTransientCameraDbError(error)) {
      return { videoId: null, error: formatCameraDbError(error) };
    }
    if (error) lastError = formatCameraDbError(error);
  }

  return {
    videoId: null,
    error: isSupabaseUnavailableError(lastError)
      ? 'Supabase geçici olarak erişilemiyor. Wi‑Fi ile birkaç saniye sonra tekrar deneyin.'
      : lastError,
  };
}

export function countPendingCameraRequestsForAdmin(rows: CameraRequestRow[]): number {
  return rows.filter((r) => r.status === 'bekliyor' || r.status === 'itiraz_bekliyor').length;
}

export function formatCameraRequestCreatedMeta(iso: string): string {
  return `${formatPartnerDate(iso.slice(0, 10))} · ${formatPartnerTime(iso)}`;
}
