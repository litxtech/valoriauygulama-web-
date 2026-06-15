/**
 * Bildirim tip sabitleri — i18n paketleri buradan import eder (döngüsel import önlenir).
 */

export const EMERGENCY_TYPES = {
  fire_drill: 'emergency_fire_drill',
  water_outage: 'emergency_water_outage',
  power_outage: 'emergency_power_outage',
  emergency_evacuate: 'emergency_evacuate',
} as const;

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
  welcome_app: 'guest_welcome_app',
} as const;

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
