import * as ImagePicker from 'expo-image-picker';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import {
  adminNotesMediaPickerGalleryOptions,
  prepareAdminNoteUploadUri,
} from '@/lib/adminQuickNotesMedia';
import {
  FEED_MEDIA_UPLOAD_TIMEOUT_MS,
  promiseWithTimeout,
  uploadUriToPublicBucket,
} from '@/lib/storagePublicUpload';
import { pickAndUploadStaffIntroVideo } from '@/lib/staffIntroNotificationVideo';
import { destinationById } from '@/lib/staffNotificationActions';

export const ANNOUNCEMENT_MEDIA_BUCKET = 'feed-media';
export const MAX_ANNOUNCEMENT_IMAGES = 6;

export type AnnouncementMediaPayload = {
  images?: string[];
  videoUrl?: string;
  videoTitle?: string;
  websiteUrl?: string;
  websiteLabel?: string;
  openScreen?: string;
  actionLabel?: string;
};

export type AnnouncementMediaDraft = {
  imageUrls: string[];
  videoUrl: string;
  videoTitle: string;
  websiteUrl: string;
  websiteLabel: string;
  destinationId: string | null;
  actionLabel: string;
};

export function emptyAnnouncementMediaDraft(): AnnouncementMediaDraft {
  return {
    imageUrls: [],
    videoUrl: '',
    videoTitle: '',
    websiteUrl: '',
    websiteLabel: '',
    destinationId: null,
    actionLabel: '',
  };
}

export function parseAnnouncementMediaPayload(raw: unknown): AnnouncementMediaPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const images = Array.isArray(o.images)
    ? o.images.filter((u): u is string => typeof u === 'string' && !!u.trim())
    : undefined;
  const pick = (k: string) => (typeof o[k] === 'string' ? o[k].trim() : '');
  const videoUrl = pick('videoUrl');
  const videoTitle = pick('videoTitle');
  const websiteUrl = pick('websiteUrl');
  const websiteLabel = pick('websiteLabel');
  const openScreen = pick('openScreen');
  const actionLabel = pick('actionLabel');
  if (
    !images?.length &&
    !videoUrl &&
    !websiteUrl &&
    !openScreen
  ) {
    return null;
  }
  return {
    images: images?.length ? images : undefined,
    videoUrl: videoUrl || undefined,
    videoTitle: videoTitle || undefined,
    websiteUrl: websiteUrl || undefined,
    websiteLabel: websiteLabel || undefined,
    openScreen: openScreen || undefined,
    actionLabel: actionLabel || undefined,
  };
}

export function draftToAnnouncementMediaPayload(draft: AnnouncementMediaDraft): AnnouncementMediaPayload | null {
  const dest = destinationById(draft.destinationId);
  const openScreen = dest?.href ?? '';
  const payload: AnnouncementMediaPayload = {};
  const images = draft.imageUrls.map((u) => u.trim()).filter(Boolean);
  if (images.length) payload.images = images;
  const videoUrl = draft.videoUrl.trim();
  if (videoUrl) {
    payload.videoUrl = videoUrl;
    const vt = draft.videoTitle.trim();
    if (vt) payload.videoTitle = vt;
  }
  const websiteUrl = normalizeWebsiteUrl(draft.websiteUrl);
  if (websiteUrl) {
    payload.websiteUrl = websiteUrl;
    const wl = draft.websiteLabel.trim();
    if (wl) payload.websiteLabel = wl;
  }
  if (openScreen) {
    payload.openScreen = openScreen;
    const al = draft.actionLabel.trim() || `${dest?.label ?? 'Modül'} sayfasını aç`;
    payload.actionLabel = al;
  }
  return parseAnnouncementMediaPayload(payload);
}

export function announcementMediaLegacyFields(media: AnnouncementMediaPayload | null): {
  image_url: string | null;
  action_url: string | null;
  action_text: string | null;
} {
  if (!media) return { image_url: null, action_url: null, action_text: null };
  const image_url = media.images?.[0] ?? null;
  const action_url = media.websiteUrl ?? media.openScreen ?? null;
  const action_text = media.websiteLabel ?? media.actionLabel ?? null;
  return { image_url, action_url, action_text };
}

export function normalizeWebsiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

export function isValidWebsiteUrl(raw: string): boolean {
  const url = normalizeWebsiteUrl(raw);
  if (!url) return true;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function pickAndUploadAnnouncementImages(params: {
  organizationId: string;
  currentCount: number;
  onProgress?: (step: string) => void;
}): Promise<{ urls: string[]; cancelled?: boolean; error?: string }> {
  if (params.currentCount >= MAX_ANNOUNCEMENT_IMAGES) {
    return { urls: [], error: `En fazla ${MAX_ANNOUNCEMENT_IMAGES} görsel ekleyebilirsiniz.` };
  }

  const granted = await ensureMediaLibraryPermission({
    title: 'Galeri',
    message: 'Duyuruya görsel eklemek için galeri erişimi gerekir.',
    settingsMessage: 'Ayarlardan galeri iznini açın.',
  });
  if (!granted) return { urls: [], cancelled: true };

  const remaining = MAX_ANNOUNCEMENT_IMAGES - params.currentCount;
  const result = await ImagePicker.launchImageLibraryAsync({
    ...adminNotesMediaPickerGalleryOptions,
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: remaining > 1,
    selectionLimit: remaining,
  });
  if (result.canceled || !result.assets.length) return { urls: [], cancelled: true };

  const urls: string[] = [];
  for (let i = 0; i < result.assets.length; i++) {
    const asset = result.assets[i];
    if (!asset?.uri) continue;
    try {
      params.onProgress?.(`Görsel ${i + 1}/${result.assets.length} yükleniyor…`);
      const localUri = await prepareAdminNoteUploadUri(asset.uri, 'image', params.onProgress);
      const uploaded = await promiseWithTimeout(
        uploadUriToPublicBucket({
          bucketId: ANNOUNCEMENT_MEDIA_BUCKET,
          uri: localUri,
          kind: 'image',
          subfolder: `announcements/${params.organizationId}`,
        }),
        FEED_MEDIA_UPLOAD_TIMEOUT_MS + 5 * 60 * 1000,
        'Görsel yükleme zaman aşımına uğradı.'
      );
      urls.push(uploaded.publicUrl);
    } catch (e) {
      return {
        urls,
        error: e instanceof Error ? e.message : 'Görsel yüklenemedi.',
      };
    }
  }
  return { urls };
}

export async function pickAndUploadAnnouncementVideo(params: {
  organizationId: string;
  onProgress?: (step: string) => void;
}): Promise<{ publicUrl?: string; cancelled?: boolean; error?: string }> {
  return pickAndUploadStaffIntroVideo(params);
}

export function buildBoardAnnouncementNotificationData(params: {
  announcementId: string;
  title: string;
  body: string;
  media: AnnouncementMediaPayload | null;
}): Record<string, unknown> {
  const media = params.media;
  const hasVideo = !!media?.videoUrl?.trim();
  const hasScreen = !!media?.openScreen?.trim();
  const hasWebsite = !!media?.websiteUrl?.trim();

  if (hasVideo || hasScreen || hasWebsite) {
    const data: Record<string, unknown> = {
      introTitle: params.title,
      introBody: params.body,
      notificationType: 'staff_feature_intro',
      announcementId: params.announcementId,
      screen: hasVideo ? '/staff/announcement-action' : '/staff/board',
      boardAnnouncementId: params.announcementId,
    };
    if (media?.actionLabel) data.actionLabel = media.actionLabel;
    if (media?.openScreen) data.openScreen = media.openScreen;
    if (media?.videoUrl) {
      data.videoUrl = media.videoUrl;
      if (media.videoTitle) data.videoTitle = media.videoTitle;
    }
    if (media?.websiteUrl) {
      data.websiteUrl = media.websiteUrl;
      if (media.websiteLabel) data.websiteLabel = media.websiteLabel;
    }
    if (media?.images?.length) data.imageUrls = media.images;
    return data;
  }

  return {
    screen: '/staff/board',
    url: '/staff/board',
    boardAnnouncementId: params.announcementId,
    notificationType: 'staff_board_announcement',
  };
}
