/**
 * Valoria — bildirim ses özellik kataloğu (admin yönetimi + push/foreground eşlemesi).
 * Uygulama modülleri: misafir, personel, admin paneli.
 */

export type NotificationSoundAudience = 'staff' | 'customer' | 'admin' | 'all';

export type NotificationSoundFeatureDef = {
  featureKey: string;
  titleTr: string;
  descriptionTr: string;
  /** Hangi uygulama tarafında bu ses kullanılır */
  audiences: NotificationSoundAudience[];
  /** Eşleşen notification_type değerleri (tam veya prefix) */
  notificationTypeHints: string[];
  /** iOS arka plan push — bundle içi dosya adı (app build) */
  defaultIosPushSound: string;
  /** Android kanal push — raw/bundle ses adı */
  defaultAndroidPushSound: string;
  defaultAndroidChannelId: string;
  priority: 'normal' | 'high' | 'emergency';
  /** Personel profilinden ses kapatılabilir mi (acil durum: hayır) */
  userCanMuteSound: boolean;
  maxDurationSec: number;
};

/** Admin panelinde listelenen ve ses atanabilen tüm özellikler */
export const NOTIFICATION_SOUND_FEATURES: NotificationSoundFeatureDef[] = [
  {
    featureKey: 'emergency_alert',
    titleTr: 'Acil durum',
    descriptionTr: 'Yangın, tahliye, panik butonu ve acil durum alarmları.',
    audiences: ['all'],
    notificationTypeHints: [
      'emergency_',
      'staff_emergency_alert',
      'guest_emergency',
    ],
    defaultIosPushSound: 'emergency_alert.wav',
    defaultAndroidPushSound: 'emergency_alert.wav',
    defaultAndroidChannelId: 'valoria_emergency_alert',
    priority: 'emergency',
    userCanMuteSound: false,
    maxDurationSec: 7,
  },
  {
    featureKey: 'new_task',
    titleTr: 'Yeni görev',
    descriptionTr: 'Atanan görev, acil görev ve görev tamamlama bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['staff_new_task', 'staff_urgent_task', 'staff_assignment', 'staff_task_done'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_new_task',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 2,
  },
  {
    featureKey: 'new_message',
    titleTr: 'Mesaj',
    descriptionTr: 'Sohbet, mention ve grup mesajları.',
    audiences: ['staff', 'customer', 'admin'],
    notificationTypeHints: ['message', 'chat_message', 'chat_mention', 'chat_screenshot'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_new_message',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'announcement',
    titleTr: 'Duyuru',
    descriptionTr: 'Admin duyurusu, pano, toplu bildirim ve kampanya.',
    audiences: ['staff', 'customer', 'admin'],
    notificationTypeHints: [
      'admin_announcement',
      'staff_board_announcement',
      'bulk_',
      'announcement',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_announcement',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'stock_warning',
    titleTr: 'Stok uyarısı',
    descriptionTr: 'Stok onayı, kritik stok ve stok hareketleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: [
      'stock',
      'staff_stock',
      'admin_critical_stock',
      'admin_pending_stock',
      'stock_pending_approval',
      'kitchen_shortage',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_stock_warning',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'kitchen_request',
    titleTr: 'Mutfak talebi',
    descriptionTr: 'Mutfak operasyon, sipariş, kahvaltı teyit ve menü bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['kitchen', 'meal', 'breakfast_confirmation', 'breakfast_morning_briefing', 'staff_meal_menu_daily'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_kitchen_request',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'kitchen_finance',
    titleTr: 'Mutfak hasılat / gider',
    descriptionTr: 'Hasılat veya gider kaydı girildiğinde mutfak ekibine bildirim.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['kitchen_revenue_entry', 'kitchen_expense_entry', 'kitchen_monthly_market_expense'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_kitchen_finance',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'reception_request',
    titleTr: 'Resepsiyon talebi',
    descriptionTr: 'Misafir talebi, oda hizmeti ve check-in/out.',
    audiences: ['staff', 'customer', 'admin'],
    notificationTypeHints: [
      'guest_request',
      'guest_checkin',
      'guest_checkout',
      'guest_admin_assigned_room',
      'guest_room',
      'admin_pending_checkin',
      'transfer_tour',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_reception_request',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'accounting_document',
    titleTr: 'Muhasebe / evrak',
    descriptionTr: 'Muhasebe, çek, borç-alacak ve maliye evrak bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['staff_debt', 'finance', 'maliye', 'accounting', 'document'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_accounting_document',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'guest_form',
    titleTr: 'Misafir formu / sözleşme',
    descriptionTr: 'Sözleşme onayı, KVKK ve misafir kayıt akışları.',
    audiences: ['customer', 'admin'],
    notificationTypeHints: [
      'guest_contract',
      'contract',
      'acceptance',
      'admin_contract',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_guest_form',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'kbs_notification',
    titleTr: 'KBS / kimlik',
    descriptionTr: 'KBS belge yakalama ve kimlik bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['kbs_'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_kbs_notification',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'staff_call',
    titleTr: 'Personel çağrısı',
    descriptionTr: 'Personel uyarısı, resmi uyarı ve çağrı bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: [
      'staff_personnel_warning',
      'staff_call',
      'staff_mention',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_staff_call',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'social_feed',
    titleTr: 'Akış (beğeni / yorum)',
    descriptionTr: 'Gönderi, hikaye beğeni ve yorum bildirimleri.',
    audiences: ['staff', 'customer'],
    notificationTypeHints: [
      'feed_',
      'story_',
      'feed_post',
      'story_post',
      'feed_like',
      'feed_comment',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_social_feed',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 2,
  },
  {
    featureKey: 'smart_ops',
    titleTr: 'Operasyon merkezi',
    descriptionTr: 'Smart Ops şablon ve operasyon bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['smart_ops', 'ops_'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_smart_ops',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'complaint',
    titleTr: 'Şikayet / geri bildirim',
    descriptionTr: 'Misafir şikayeti ve personel iç not bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['guest_complaint', 'staff_internal_note'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_complaint',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'missing_item',
    titleTr: 'Eksik var',
    descriptionTr: 'Eksik eşya bildirimi, hatırlatma ve çözüm.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['missing_item'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_missing_item',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'attendance',
    titleTr: 'Mesai / devam',
    descriptionTr: 'Devamsızlık, giriş-çıkış ve mesai bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['attendance', 'staff_attendance'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_attendance',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'salary',
    titleTr: 'Maaş',
    descriptionTr: 'Maaş yatırıldı ve hatırlatma bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['salary_'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_salary',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'expense',
    titleTr: 'Gider onayı',
    descriptionTr: 'Personel gider talebi ve onay bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['expense_'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_expense',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'report_status',
    titleTr: 'Tutanak / rapor',
    descriptionTr: 'Tutanak ve rapor durum güncellemeleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['report_status'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_report_status',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'shift_leave',
    titleTr: 'Vardiya / izin',
    descriptionTr: 'Vardiya değişikliği ve izin onay bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['staff_shift', 'pending_leave'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_shift_leave',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'permission_update',
    titleTr: 'Yetki güncelleme',
    descriptionTr: 'Uygulama izinleri değiştiğinde bildirim.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['staff_permission'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_permission_update',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 2,
  },
  {
    featureKey: 'room_cleaning',
    titleTr: 'Oda temizlik planı',
    descriptionTr: 'Temizlik planı, oda işaretleme ve not bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['staff_room_cleaning', 'room_cleaning'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_room_cleaning',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'managed_contract',
    titleTr: 'Sözleşme yönetimi',
    descriptionTr: 'İş sözleşmesi imza ve onay bildirimleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['managed_contract'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_managed_contract',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'group_added',
    titleTr: 'Gruba eklenme',
    descriptionTr: 'Yeni sohbet grubuna eklendiğinizde.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['group_added'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_group_added',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 2,
  },
  {
    featureKey: 'department_rule',
    titleTr: 'Bölüm kuralları',
    descriptionTr: 'Yeni kural yayını ve okuma hatırlatmaları.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: ['department_rule', 'department_rule_reminder'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_department_rule',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'staff_tip',
    titleTr: 'Bahşiş',
    descriptionTr: 'Bahşiş alındı, ödendi, iade ve teşekkür bildirimleri.',
    audiences: ['staff', 'customer', 'admin'],
    notificationTypeHints: [
      'staff_tip',
      'guest_tip_paid',
      'staff_tip_refunded',
      'guest_tip_refunded',
      'staff_tip_thank_you',
      'admin_tip_payment',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_staff_tip',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'payment',
    titleTr: 'Ödeme',
    descriptionTr: 'Oluşturulan ödeme linki tamamlandı veya tamamlanmadı bildirimleri (bahşiş hariç).',
    audiences: ['staff', 'customer', 'admin'],
    notificationTypeHints: ['payment_received', 'payment_failed', 'admin_payment_received'],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_payment',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'technical_asset',
    titleTr: 'Teknik varlık / arıza',
    descriptionTr: 'Arıza bildirimi, varlık durumu, bakım kaydı ve tesis durumu.',
    audiences: ['staff', 'customer', 'admin'],
    notificationTypeHints: [
      'tech_fault_report',
      'tech_asset_status',
      'tech_maintenance_log',
      'hotel_facility_status',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_technical_asset',
    priority: 'high',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
  {
    featureKey: 'guest_service_request',
    titleTr: 'Misafir ev hizmeti talebi',
    descriptionTr: 'Oda temizliği, havlu, bakım, kayıp eşya ve menü sipariş talepleri.',
    audiences: ['staff', 'admin'],
    notificationTypeHints: [
      'guest_service_request_new',
      'guest_service_request_status',
      'hotel_kitchen_menu_order',
    ],
    defaultIosPushSound: 'default',
    defaultAndroidPushSound: 'default',
    defaultAndroidChannelId: 'valoria_ns_guest_service_request',
    priority: 'normal',
    userCanMuteSound: true,
    maxDurationSec: 3,
  },
];

export const NOTIFICATION_SOUND_BY_KEY = new Map(
  NOTIFICATION_SOUND_FEATURES.map((f) => [f.featureKey, f])
);

const TYPE_TO_FEATURE: { test: (t: string) => boolean; key: string }[] = [
  { test: (t) => t.includes('emergency'), key: 'emergency_alert' },
  { test: (t) => t === 'message' || t.startsWith('chat_') || t === 'app_screenshot', key: 'new_message' },
  {
    test: (t) =>
      t.includes('task') || t.includes('assignment') || t.includes('repair'),
    key: 'new_task',
  },
  {
    test: (t) =>
      t.includes('announcement') ||
      t.startsWith('bulk_') ||
      t.includes('board') ||
      t === 'admin_panel_alert',
    key: 'announcement',
  },
  { test: (t) => t.includes('stock') || t.includes('shortage'), key: 'stock_warning' },
  {
    test: (t) =>
      t === 'kitchen_revenue_entry' ||
      t === 'kitchen_expense_entry' ||
      t === 'kitchen_monthly_market_expense',
    key: 'kitchen_finance',
  },
  {
    test: (t) =>
      t.includes('kitchen') ||
      t.includes('breakfast') ||
      t.includes('meal'),
    key: 'kitchen_request',
  },
  {
    test: (t) =>
      t.startsWith('guest_service_request') ||
      t === 'hotel_kitchen_menu_order',
    key: 'guest_service_request',
  },
  {
    test: (t) =>
      t.includes('staff_tip') ||
      t.includes('guest_tip') ||
      t === 'admin_tip_payment',
    key: 'staff_tip',
  },
  {
    test: (t) =>
      t === 'payment_received' || t === 'payment_failed' || t === 'admin_payment_received',
    key: 'payment',
  },
  {
    test: (t) =>
      t.startsWith('tech_') ||
      t === 'hotel_facility_status',
    key: 'technical_asset',
  },
  {
    test: (t) =>
      t.startsWith('department_rule'),
    key: 'department_rule',
  },
  {
    test: (t) =>
      t.includes('guest_request') ||
      t.includes('checkin') ||
      t.includes('checkout') ||
      t.includes('transfer_tour') ||
      (t.includes('room_') && !t.startsWith('guest_service_request')),
    key: 'reception_request',
  },
  {
    test: (t) =>
      t.includes('debt') ||
      (t.includes('finance') && !t.startsWith('kitchen_')) ||
      t.includes('maliye'),
    key: 'accounting_document',
  },
  { test: (t) => t.includes('contract') || t.includes('acceptance'), key: 'guest_form' },
  { test: (t) => t.startsWith('kbs_'), key: 'kbs_notification' },
  {
    test: (t) =>
      t.includes('personnel_warning') || t.includes('staff_mention'),
    key: 'staff_call',
  },
  {
    test: (t) => t.includes('feed_') || t.includes('story_'),
    key: 'social_feed',
  },
  {
    test: (t) =>
      t.includes('smart_ops') ||
      t.startsWith('ops_') ||
      t === 'scheduled_template_notification',
    key: 'smart_ops',
  },
  {
    test: (t) => t.includes('guest_complaint') || t.includes('staff_internal_note'),
    key: 'complaint',
  },
  { test: (t) => t.startsWith('missing_item'), key: 'missing_item' },
  { test: (t) => t.includes('attendance') || t.includes('staff_attendance'), key: 'attendance' },
  { test: (t) => t.startsWith('salary_'), key: 'salary' },
  { test: (t) => t.startsWith('expense_'), key: 'expense' },
  { test: (t) => t === 'report_status', key: 'report_status' },
  { test: (t) => t.includes('staff_shift') || t.includes('pending_leave'), key: 'shift_leave' },
  { test: (t) => t.includes('staff_permission'), key: 'permission_update' },
  { test: (t) => t.includes('staff_room_cleaning') || t.includes('room_cleaning'), key: 'room_cleaning' },
  { test: (t) => t === 'managed_contract', key: 'managed_contract' },
  { test: (t) => t === 'group_added', key: 'group_added' },
];

/** notification_type veya kategori → feature_key */
export function resolveNotificationFeatureKey(
  notificationType?: string | null,
  category?: string | null
): string {
  const t = (notificationType ?? '').trim().toLowerCase();
  const cat = (category ?? '').trim().toLowerCase();
  if (cat === 'emergency') return 'emergency_alert';
  if (!t) return 'announcement';
  for (const row of TYPE_TO_FEATURE) {
    if (row.test(t)) return row.key;
  }
  for (const def of NOTIFICATION_SOUND_FEATURES) {
    for (const hint of def.notificationTypeHints) {
      if (t === hint || t.startsWith(hint)) return def.featureKey;
    }
  }
  return 'announcement';
}

export function getNotificationSoundFeatureDef(featureKey: string): NotificationSoundFeatureDef | undefined {
  return NOTIFICATION_SOUND_BY_KEY.get(featureKey);
}

/** Uygulama modül özellikleri özeti (admin katalog sayfası için) */
export const VALORIA_MODULE_FEATURES_SUMMARY = {
  customer: [
    'Ana sayfa, harita, transfer, mesajlar, yemek & mekanlar, şikayet, profil',
    'Acil durum, bildirim ayarları, gönderi paylaşımı',
    'Konaklama: check-in/out, oda talepleri, sözleşme onayı',
  ],
  staff: [
    'Sekmeler: akış, görevler, stok, mesajlar, acil durum, sözleşme onayları, yönetim, profil',
    'Hamburger: harita, pano, mesai, mutfak ops, KBS, muhasebe, satış, otel eşyaları kullanımı, …',
    'Bildirim tercihleri: mesaj (zorunlu), duyuru (zorunlu), özellik bazlı sesler',
  ],
  admin: [
    'Konaklama, iletişim, stok & onaylar, erişim, kurumsal ayarlar',
    'Toplu duyuru, acil durum, bildirim şablonları, Smart Ops',
    'Bildirim sesleri yönetimi (bu sistem)',
  ],
} as const;

export const NOTIFICATION_SOUND_STORAGE_BUCKET = 'notification-sounds';
/** 2 MB — daha uzun ses klipleri için */
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

/** Bildirim çalma süresi (saniye) — admin seçer, DB'ye yazılır */
export const PLAYBACK_DURATION_MIN_SEC = 1;
export const PLAYBACK_DURATION_MAX_SEC = 30;
export const PLAYBACK_DURATION_OPTIONS = [1, 2, 3, 5, 7, 10, 15, 20, 30] as const;

/** Bilinen ses uzantıları (MIME yoksa yedek) */
export const AUDIO_FILE_EXTENSIONS = new Set([
  'wav', 'wave', 'mp3', 'mpeg', 'mp4', 'm4a', 'aac', 'caf', 'aiff', 'aif',
  'ogg', 'oga', 'opus', 'flac', 'wma', 'amr', '3gp', '3gpp', 'webm',
]);

export const ALLOWED_SOUND_MIME = [
  'audio/wav',
  'audio/x-wav',
  'audio/vnd.wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/x-caf',
  'audio/aac',
  'audio/ogg',
  'audio/flac',
  'audio/aiff',
  'audio/x-aiff',
  'audio/amr',
  'audio/3gpp',
  'audio/webm',
  'audio/opus',
] as const;

export type AllowedSoundMime = (typeof ALLOWED_SOUND_MIME)[number];

export function getDefaultPlaybackDurationSec(featureKey: string): number {
  if (featureKey === 'emergency_alert') return 7;
  const def = getNotificationSoundFeatureDef(featureKey);
  return def?.maxDurationSec ?? 3;
}

export function getMaxPlaybackDurationSec(featureKey?: string): number {
  return featureKey === 'emergency_alert' ? 30 : 15;
}

export function clampPlaybackDurationSec(
  seconds: number | null | undefined,
  featureKey?: string
): number {
  const max = getMaxPlaybackDurationSec(featureKey);
  const fallback = featureKey ? getDefaultPlaybackDurationSec(featureKey) : 3;
  const n = seconds ?? fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(PLAYBACK_DURATION_MIN_SEC, Math.round(n)));
}

export function playbackDurationOptionsForFeature(featureKey: string): number[] {
  const max = getMaxPlaybackDurationSec(featureKey);
  return PLAYBACK_DURATION_OPTIONS.filter((s) => s <= max);
}

export function isAudioMimeType(mime: string | null | undefined): boolean {
  const m = (mime ?? '').split(';')[0]?.trim().toLowerCase();
  if (!m) return false;
  if (m.startsWith('audio/')) return true;
  return (ALLOWED_SOUND_MIME as readonly string[]).includes(m);
}

export function isAudioFileExtension(ext: string | null | undefined): boolean {
  if (!ext) return false;
  return AUDIO_FILE_EXTENSIONS.has(ext.toLowerCase());
}
