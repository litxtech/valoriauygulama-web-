import type { Href } from 'expo-router';

export type StaffNotificationDestination = {
  id: string;
  label: string;
  href: string;
  group: string;
};

/** Admin toplu personel bildiriminde seçilebilir uygulama hedefleri */
export const STAFF_NOTIFICATION_DESTINATIONS: StaffNotificationDestination[] = [
  { id: 'board', label: 'Duyuru panosu', href: '/staff/board', group: 'Genel' },
  { id: 'tasks', label: 'Görevlerim', href: '/staff/tasks', group: 'Personel' },
  { id: 'attendance', label: 'Mesai / devam', href: '/staff/attendance', group: 'Personel' },
  { id: 'facility_journal', label: 'Otel kullanım kayıtları', href: '/staff/facility-journal', group: 'Operasyon' },
  { id: 'facility_journal_new', label: 'Yeni kullanım kaydı', href: '/staff/facility-journal/new', group: 'Operasyon' },
  { id: 'lost_found', label: 'Kayıp / buluntu', href: '/staff/lost-found', group: 'Operasyon' },
  { id: 'missing_items', label: 'Eksik eşya bildirimi', href: '/staff/missing-items', group: 'Operasyon' },
  { id: 'stock', label: 'Otel stok listesi', href: '/staff/stock', group: 'Operasyon' },
  { id: 'documents', label: 'Doküman yönetimi', href: '/staff/documents', group: 'Operasyon' },
  { id: 'incident_new', label: 'Tutanak oluştur', href: '/staff/incident-reports/new', group: 'Operasyon' },
  { id: 'kitchen_ops', label: 'Mutfak operasyonları', href: '/staff/kitchen-ops', group: 'F&B' },
  { id: 'fnb_hub', label: 'F&B Merkezi', href: '/staff/fnb-hub', group: 'F&B' },
  { id: 'meal_menu', label: 'Personel yemek listesi', href: '/staff/meal-menu', group: 'Personel' },
  { id: 'breakfast_confirm', label: 'Kahvaltı teyidi', href: '/staff/breakfast-confirm', group: 'Personel' },
  { id: 'cleaning_plan', label: 'Yarın temizlik planı', href: '/staff/cleaning-plan', group: 'Personel' },
  { id: 'department_rules', label: 'Bölüm kuralları', href: '/staff/department-rules', group: 'Personel' },
  { id: 'payments', label: 'Tahsilat merkezi', href: '/staff/payments', group: 'Finans' },
  { id: 'expenses', label: 'Harcamalarım', href: '/staff/expenses', group: 'Finans' },
];

export type StaffNotificationActionPayload = {
  openScreen?: string;
  actionLabel?: string;
  videoUrl?: string;
  videoTitle?: string;
  introTitle?: string;
  introBody?: string;
};

function pickStr(data: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const raw = data[k];
    if (typeof raw === 'string') {
      const t = raw.trim();
      if (t) return t;
    }
  }
  return '';
}

export function destinationById(id: string | null | undefined): StaffNotificationDestination | null {
  if (!id) return null;
  return STAFF_NOTIFICATION_DESTINATIONS.find((d) => d.id === id) ?? null;
}

export function parseStaffNotificationAction(
  data: Record<string, unknown> | null | undefined
): StaffNotificationActionPayload | null {
  if (!data || typeof data !== 'object') return null;
  const screen = pickStr(data, 'screen');
  const openScreen =
    pickStr(data, 'openScreen', 'targetScreen') ||
    (screen && screen !== '/staff/announcement-action' ? screen : '');
  const videoUrl = pickStr(data, 'videoUrl', 'video_url');
  const actionLabel = pickStr(data, 'actionLabel', 'action_label');
  const videoTitle = pickStr(data, 'videoTitle', 'video_title');
  const introTitle = pickStr(data, 'introTitle', 'title');
  const introBody = pickStr(data, 'introBody', 'body');
  if (!openScreen && !videoUrl) return null;
  return {
    openScreen: openScreen || undefined,
    actionLabel: actionLabel || undefined,
    videoUrl: videoUrl || undefined,
    videoTitle: videoTitle || undefined,
    introTitle: introTitle || undefined,
    introBody: introBody || undefined,
  };
}

export function hasStaffNotificationAction(data: Record<string, unknown> | null | undefined): boolean {
  return parseStaffNotificationAction(data) != null;
}

export function buildStaffNotificationActionData(params: {
  destinationId?: string | null;
  actionLabel?: string;
  videoUrl?: string;
  videoTitle?: string;
  introTitle: string;
  introBody: string;
}): {
  notificationType: 'staff_board_announcement' | 'staff_feature_intro';
  data: Record<string, unknown>;
} {
  const dest = destinationById(params.destinationId);
  const videoUrl = params.videoUrl?.trim() || '';
  const openScreen = dest?.href ?? '';
  const actionLabel =
    params.actionLabel?.trim() ||
    (dest ? `${dest.label} sayfasını aç` : videoUrl ? 'Devam et' : '');

  const hasVideo = !!videoUrl;
  const hasScreen = !!openScreen;

  if (!hasVideo && !hasScreen) {
    return {
      notificationType: 'staff_board_announcement',
      data: { screen: '/staff/board' },
    };
  }

  const base: Record<string, unknown> = {
    introTitle: params.introTitle.trim() || 'Duyuru',
    introBody: params.introBody.trim(),
    notificationType: 'staff_feature_intro',
  };

  if (actionLabel) base.actionLabel = actionLabel;
  if (openScreen) base.openScreen = openScreen;
  if (videoUrl) {
    base.videoUrl = videoUrl;
    if (params.videoTitle?.trim()) base.videoTitle = params.videoTitle.trim();
    base.screen = '/staff/announcement-action';
  } else if (openScreen) {
    base.screen = openScreen;
  }

  return {
    notificationType: 'staff_feature_intro',
    data: base,
  };
}

export function buildAnnouncementActionHref(data: Record<string, unknown>): Href {
  const imageUrlsRaw = data.imageUrls;
  const imageUrls =
    Array.isArray(imageUrlsRaw)
      ? imageUrlsRaw.filter((u): u is string => typeof u === 'string' && !!u.trim()).join(',')
      : '';
  return {
    pathname: '/staff/announcement-action',
    params: {
      title: pickStr(data, 'introTitle', 'title'),
      body: pickStr(data, 'introBody', 'body'),
      videoUrl: pickStr(data, 'videoUrl', 'video_url'),
      videoTitle: pickStr(data, 'videoTitle', 'video_title'),
      openScreen: pickStr(data, 'openScreen', 'targetScreen'),
      actionLabel: pickStr(data, 'actionLabel', 'action_label') || 'Modülü aç',
      imageUrls,
    },
  } as Href;
}

export function youtubeVideoId(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const short = u.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/i);
  if (short?.[1]) return short[1];
  const watch = u.match(/[?&]v=([A-Za-z0-9_-]{6,})/i);
  if (watch?.[1]) return watch[1];
  const embed = u.match(/youtube\.com\/embed\/([A-Za-z0-9_-]{6,})/i);
  if (embed?.[1]) return embed[1];
  return null;
}

export function isDirectVideoUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return /\.(mp4|m4v|webm|mov)(\?|$)/i.test(u) || u.includes('stream.mux.com') || u.includes('/storage/v1/object/');
}

export function videoEmbedHtml(url: string): string | null {
  const yt = youtubeVideoId(url);
  if (yt) {
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;background:#000"><iframe width="100%" height="100%" src="https://www.youtube.com/embed/${yt}?playsinline=1&rel=0" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></body></html>`;
  }
  if (isDirectVideoUrl(url)) return null;
  const vimeo = url.trim().match(/vimeo\.com\/(\d+)/i);
  if (vimeo?.[1]) {
    return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;background:#000"><iframe width="100%" height="100%" src="https://player.vimeo.com/video/${vimeo[1]}" frameborder="0" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen></iframe></body></html>`;
  }
  return null;
}
