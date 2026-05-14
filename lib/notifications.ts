/**
 * Valoria Hotel - Bildirim Sistemi
 * Bildirim tipleri, kategoriler, şablon anahtarları ve yardımcı fonksiyonlar.
 */

export type NotificationCategory = 'emergency' | 'guest' | 'staff' | 'admin' | 'bulk';

/** Acil durum bildirim tipleri (tüm misafirlere zorunlu) */
export const EMERGENCY_TYPES = {
  fire_drill: 'emergency_fire_drill',
  water_outage: 'emergency_water_outage',
  power_outage: 'emergency_power_outage',
  emergency_evacuate: 'emergency_evacuate',
} as const;

/** Misafir bildirim tipleri (check-in/out, hizmet) */
export const GUEST_TYPES = {
  contract_approved: 'guest_contract_approved',
  admin_assigned_room: 'guest_admin_assigned_room',
  stay_financial_updated: 'guest_stay_financial_updated',
  room_reassigned: 'guest_room_reassigned',
  room_settled: 'guest_room_settled',
  checkout_reminder: 'guest_checkout_reminder',
  checkout_done: 'guest_checkout_done',
  request_received: 'guest_request_received',
  request_on_the_way: 'guest_request_on_the_way',
  request_completed: 'guest_request_completed',
  cleaning_reminder: 'guest_cleaning_reminder',
} as const;

/** Personele giden bildirim tipleri */
export const STAFF_TYPES = {
  new_task: 'staff_new_task',
  urgent_task: 'staff_urgent_task',
  new_repair: 'staff_new_repair',
  urgent_repair: 'staff_urgent_repair',
  new_guest_checkin: 'staff_new_guest_checkin',
  task_done: 'staff_task_done',
  repair_done: 'staff_repair_done',
  stock_entry_pending: 'staff_stock_entry_pending',
} as const;

/** Admin'e giden bildirim tipleri */
export const ADMIN_TYPES = {
  contract_acceptance_new: 'admin_contract_acceptance_new',
  pending_checkin: 'admin_pending_checkin',
  pending_stock: 'admin_pending_stock',
  pending_leave: 'admin_pending_leave',
  critical_stock: 'admin_critical_stock',
  empty_rooms_critical: 'admin_empty_rooms_critical',
  high_occupancy: 'admin_high_occupancy',
  payment_reminder: 'admin_payment_reminder',
  daily_report: 'admin_daily_report',
  evening_report: 'admin_evening_report',
  weekly_report: 'admin_weekly_report',
} as const;

export type NotificationType =
  | (typeof EMERGENCY_TYPES)[keyof typeof EMERGENCY_TYPES]
  | (typeof GUEST_TYPES)[keyof typeof GUEST_TYPES]
  | (typeof STAFF_TYPES)[keyof typeof STAFF_TYPES]
  | (typeof ADMIN_TYPES)[keyof typeof ADMIN_TYPES]
  | string;

/** Toplu bildirim hedefi (misafir) */
export type BulkGuestTarget =
  | 'all_guests'
  | 'checkin_today'
  | 'checkout_tomorrow'
  | 'specific_rooms'
  | 'long_stay';

/** Toplu bildirim hedefi (personel) */
export type BulkStaffTarget =
  | 'all_staff'
  | 'housekeeping'
  | 'technical'
  | 'reception'
  | 'security';

/** Toplu bildirim kategorisi (misafir) */
export type BulkCategory = 'info' | 'warning' | 'campaign';

/** Hazır mesaj şablonları (sistem tetikleyicileri için) */
export const EMERGENCY_MESSAGES: Record<string, { title: string; body: string }> = {
  [EMERGENCY_TYPES.fire_drill]: {
    title: 'Yangın Tatbikatı',
    body: "🚨 Yangın tatbikatı 15:00'te başlayacak. Lütfen açıklamaları takip edin.",
  },
  [EMERGENCY_TYPES.water_outage]: {
    title: 'Su Kesintisi',
    body: '💧 14:00-16:00 arası su kesintisi olacaktır. Anlayışınız için teşekkürler.',
  },
  [EMERGENCY_TYPES.power_outage]: {
    title: 'Elektrik Kesintisi',
    body: '⚡ 10:00-11:00 arası elektrik bakımı yapılacaktır. Jeneratör devrede olacak.',
  },
  [EMERGENCY_TYPES.emergency_evacuate]: {
    title: 'Acil Durum',
    body: '🚨 Lütfen binayı boşaltın! Yangın merdivenlerini kullanın.',
  },
};

export const GUEST_MESSAGE_TEMPLATES: Record<string, (ctx: Record<string, string>) => { title: string; body: string }> = {
  [GUEST_TYPES.contract_approved]: () => ({
    title: 'Sözleşme Onaylandı',
    body: "📝 Sözleşmeniz onaylandı. Check-in talebiniz admin'e iletildi.",
  }),
  [GUEST_TYPES.admin_assigned_room]: (ctx) => ({
    title: 'Oda Hazır',
    body: `✅ Oda ${ctx.roomNumber ?? '?'} hazır! Dijital anahtarınız aktif. İyi tatiller!`,
  }),
  [GUEST_TYPES.stay_financial_updated]: (ctx) => ({
    title: 'Konaklama bilgisi güncellendi',
    body: `Resepsiyon konaklama tutarınızı güncelledi: ${ctx.summary ?? 'Detaylar uygulamada.'}`,
  }),
  [GUEST_TYPES.room_reassigned]: (ctx) => ({
    title: 'Odanız değiştirildi',
    body: `Yeni odanız: ${ctx.roomNumber ?? '?'}. Dijital anahtar ve oda hizmetleri bu odaya göre güncellendi.`,
  }),
  [GUEST_TYPES.room_settled]: (ctx) => ({
    title: "Odaya Yerleştiniz",
    body: `🏨 Oda ${ctx.roomNumber ?? '?'}'ye yerleştiniz. İhtiyaçlarınız için resepsiyon 0.`,
  }),
  [GUEST_TYPES.checkout_reminder]: () => ({
    title: 'Çıkış Hatırlatması',
    body: "⏰ Çıkış saatinize 1 saat kaldı. Odadan ayrılmaya hazır mısınız?",
  }),
  [GUEST_TYPES.checkout_done]: () => ({
    title: 'Bizi Tercih Ettiniz İçin Teşekkürler',
    body: '👋 Bizi tercih ettiğiniz için teşekkürler! Tekrar bekleriz.',
  }),
  [GUEST_TYPES.request_received]: (ctx) => ({
    title: 'Talep Alındı',
    body: `🍽️ ${ctx.requestLabel ?? 'Siparişiniz'} alındı. Tahmini süre: ${ctx.estimate ?? '15 dakika'}`,
  }),
  [GUEST_TYPES.request_on_the_way]: () => ({
    title: 'Yolda',
    body: '🚀 Siparişiniz yolda! 2 dakika içinde odanızda',
  }),
  [GUEST_TYPES.request_completed]: (ctx) => ({
    title: 'Talep Tamamlandı',
    body: `✅ ${ctx.requestLabel ?? 'Talebiniz'} tamamlandı. İyi günler!`,
  }),
  [GUEST_TYPES.cleaning_reminder]: () => ({
    title: 'Temizlik Saati',
    body: '🧹 Odanızın temizlik saati yaklaşıyor. Uygun musunuz?',
  }),
};

/** Misafir bildirim tercih anahtarları */
export const GUEST_PREF_KEYS = {
  service_updates: 'service_updates',
  checkin_checkout_reminders: 'checkin_checkout_reminders',
  hotel_announcements: 'hotel_announcements',
  campaigns: 'campaigns',
  marketing: 'marketing',
} as const;

/** Personel bildirim tercih anahtarları (acil kapatılamaz) */
export const STAFF_PREF_KEYS = {
  new_tasks: 'new_tasks',
  emergency: 'emergency',
  meeting_reminders: 'meeting_reminders',
  shift_changes: 'shift_changes',
} as const;

export interface NotificationRow {
  id: string;
  guest_id: string | null;
  staff_id: string | null;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  notification_type: string | null;
  category: NotificationCategory | null;
  read_at: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface NotificationTemplateRow {
  id: string;
  target_audience: 'guest' | 'staff';
  template_key: string;
  category: string;
  title_template: string;
  body_template: string;
  is_system: boolean;
  sort_order: number;
}
