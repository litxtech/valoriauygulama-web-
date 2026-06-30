/**
 * Personel profil → Bildirim tercihleri kataloğu.
 * pref_key: notification_preferences.staff_notif_<prefKey>
 * Kapalı → push + in-app bildirim filtrelenir (filter_staff_notification_recipients).
 */

export type StaffNotifPrefEntry = {
  prefKey: string;
  titleKey: string;
  hintKey: string;
  /** Ses kataloğu feature_key (staff_notif_sound_<featureKey>) */
  soundFeatureKey?: string;
  /** notification_type eşlemesi — tam eşit veya prefix/contains */
  matchExact: string[];
  matchPrefix: string[];
  matchContains: string[];
  mandatory?: boolean;
};

function entry(
  prefKey: string,
  titleKey: string,
  hintKey: string,
  opts?: {
    soundFeatureKey?: string;
    matchExact?: string[];
    matchPrefix?: string[];
    matchContains?: string[];
    mandatory?: boolean;
  }
): StaffNotifPrefEntry {
  return {
    prefKey,
    titleKey,
    hintKey,
    soundFeatureKey: opts?.soundFeatureKey,
    matchExact: opts?.matchExact ?? [],
    matchPrefix: opts?.matchPrefix ?? [],
    matchContains: opts?.matchContains ?? [],
    mandatory: opts?.mandatory,
  };
}

/** Zorunlu — kapatılamaz bildirim türleri */
export const MANDATORY_NOTIFICATION_TYPES = new Set([
  'message',
  'chat_message',
  'admin_announcement',
  'admin_panel_alert',
  'staff_personnel_warning',
]);

export const STAFF_NOTIFICATION_DELIVERY_TOGGLES: StaffNotifPrefEntry[] = [
  entry('staff_assignment', 'staffNotifAssignmentsTitle', 'staffNotifAssignmentsHint', {
    soundFeatureKey: 'new_task',
    matchExact: ['staff_assignment'],
  }),
  entry('new_task', 'staffNotifNewTaskTitle', 'staffNotifNewTaskHint', {
    soundFeatureKey: 'new_task',
    matchExact: ['staff_new_task', 'staff_urgent_task', 'staff_task_done'],
    matchPrefix: ['staff_new_repair', 'staff_urgent_repair', 'staff_repair_done'],
  }),
  entry('stock_pending_approval', 'staffNotifStockMovementsTitle', 'staffNotifStockMovementsHint', {
    soundFeatureKey: 'stock_warning',
    matchExact: ['stock_pending_approval', 'admin_critical_stock', 'admin_pending_stock', 'staff_stock_entry_pending'],
    matchPrefix: ['staff_stock', 'kitchen_shortage'],
    matchContains: ['stock'],
  }),
  entry('kitchen_finance', 'staffNotifKitchenFinanceTitle', 'staffNotifKitchenFinanceHint', {
    soundFeatureKey: 'kitchen_finance',
    matchExact: ['kitchen_revenue_entry', 'kitchen_expense_entry', 'kitchen_monthly_market_expense'],
  }),
  entry('kitchen_request', 'staffNotifKitchenTitle', 'staffNotifKitchenHint', {
    soundFeatureKey: 'kitchen_request',
    matchPrefix: ['kitchen'],
    matchContains: ['meal'],
  }),
  entry('breakfast_confirm', 'staffNotifBreakfastConfirmTitle', 'staffNotifBreakfastConfirmHint', {
    soundFeatureKey: 'kitchen_request',
    matchPrefix: ['breakfast_confirmation'],
  }),
  entry('breakfast_briefing', 'staffNotifBreakfastBriefingTitle', 'staffNotifBreakfastBriefingHint', {
    soundFeatureKey: 'kitchen_request',
    matchExact: ['breakfast_morning_briefing', 'breakfast_partner_entry', 'breakfast_partner_remind', 'breakfast_partner_payment_staff'],
  }),
  entry('staff_meal_menu_daily', 'staffNotifMealMenuDailyTitle', 'staffNotifMealMenuDailyHint', {
    soundFeatureKey: 'kitchen_request',
    matchExact: ['staff_meal_menu_daily'],
  }),
  entry('reception_request', 'staffNotifReceptionTitle', 'staffNotifReceptionHint', {
    soundFeatureKey: 'reception_request',
    matchExact: ['transfer_tour'],
    matchPrefix: ['guest_request', 'guest_checkin', 'guest_checkout', 'guest_admin_assigned', 'guest_room', 'admin_pending_checkin'],
    matchContains: ['checkin', 'checkout'],
  }),
  entry('room_cleaning', 'staffNotifRoomCleaningTitle', 'staffNotifRoomCleaningHint', {
    soundFeatureKey: 'room_cleaning',
    matchPrefix: ['staff_room_cleaning'],
  }),
  entry('complaint', 'staffNotifComplaintTitle', 'staffNotifComplaintHint', {
    soundFeatureKey: 'complaint',
    matchPrefix: ['guest_complaint', 'staff_internal_note'],
  }),
  entry('missing_item', 'staffNotifMissingItemTitle', 'staffNotifMissingItemHint', {
    soundFeatureKey: 'missing_item',
    matchPrefix: ['missing_item'],
  }),
  entry('attendance', 'staffNotifAttendanceTitle', 'staffNotifAttendanceHint', {
    soundFeatureKey: 'attendance',
    matchExact: ['attendance_missing_checkin', 'staff_attendance_action'],
    matchPrefix: ['attendance_'],
  }),
  entry('salary_deposited', 'staffNotifSalaryDepositedTitle', 'staffNotifSalaryDepositedHint', {
    soundFeatureKey: 'salary',
    matchExact: ['salary_deposited'],
  }),
  entry('salary_reminder', 'staffNotifSalaryReminderTitle', 'staffNotifSalaryReminderHint', {
    soundFeatureKey: 'salary',
    matchExact: ['salary_reminder'],
  }),
  entry('expense_pending_approval', 'staffNotifExpenseTitle', 'staffNotifExpenseHint', {
    soundFeatureKey: 'expense',
    matchExact: ['expense_pending_approval'],
  }),
  entry('report_status', 'staffNotifReportUpdatesTitle', 'staffNotifReportUpdatesHint', {
    soundFeatureKey: 'report_status',
    matchExact: ['report_status'],
  }),
  entry('shift_leave', 'staffNotifShiftLeaveTitle', 'staffNotifShiftLeaveHint', {
    soundFeatureKey: 'shift_leave',
    matchExact: ['staff_shift_changes', 'admin_pending_leave'],
  }),
  entry('staff_permission_updated', 'staffNotifPermissionTitle', 'staffNotifPermissionHint', {
    soundFeatureKey: 'permission_update',
    matchExact: ['staff_permission_updated'],
  }),
  entry('kbs_notification', 'staffNotifKbsTitle', 'staffNotifKbsHint', {
    soundFeatureKey: 'kbs_notification',
    matchPrefix: ['kbs_'],
  }),
  entry('accounting_document', 'staffNotifAccountingTitle', 'staffNotifAccountingHint', {
    soundFeatureKey: 'accounting_document',
    matchExact: ['staff_debt', 'finance_counterparty_agreement'],
    matchPrefix: ['finance', 'maliye'],
    matchContains: ['accounting', 'document'],
  }),
  entry('guest_form', 'staffNotifGuestFormTitle', 'staffNotifGuestFormHint', {
    soundFeatureKey: 'guest_form',
    matchPrefix: ['admin_contract', 'guest_contract'],
    matchContains: ['contract_acceptance', 'acceptance'],
  }),
  entry('managed_contract', 'staffNotifManagedContractTitle', 'staffNotifManagedContractHint', {
    soundFeatureKey: 'managed_contract',
    matchExact: ['managed_contract'],
  }),
  entry('department_rule', 'staffNotifDepartmentRuleTitle', 'staffNotifDepartmentRuleHint', {
    soundFeatureKey: 'department_rule',
    matchExact: ['department_rule', 'department_rule_reminder'],
  }),
  entry('smart_ops', 'staffNotifSmartOpsTitle', 'staffNotifSmartOpsHint', {
    soundFeatureKey: 'smart_ops',
    matchPrefix: ['smart_ops'],
    matchContains: ['ops_'],
  }),
  entry('staff_personnel_warning_ack', 'staffNotifWarningAckTitle', 'staffNotifWarningAckHint', {
    soundFeatureKey: 'staff_call',
    matchExact: ['staff_personnel_warning_ack'],
  }),
  entry('staff_mention', 'staffNotifMentionTitle', 'staffNotifMentionHint', {
    soundFeatureKey: 'new_message',
    matchExact: ['staff_mention', 'chat_mention'],
  }),
  entry('chat_screenshot', 'staffNotifChatScreenshotTitle', 'staffNotifChatScreenshotHint', {
    soundFeatureKey: 'new_message',
    matchExact: ['chat_screenshot'],
  }),
  entry('feed_like', 'staffNotifFeedLikesTitle', 'staffNotifFeedLikesHint', {
    soundFeatureKey: 'social_feed',
    matchExact: ['feed_like'],
  }),
  entry('feed_comment', 'staffNotifFeedCommentsTitle', 'staffNotifFeedCommentsHint', {
    soundFeatureKey: 'social_feed',
    matchExact: ['feed_comment'],
  }),
  entry('feed_comment_reply', 'staffNotifCommentRepliesTitle', 'staffNotifCommentRepliesHint', {
    soundFeatureKey: 'social_feed',
    matchExact: ['feed_comment_reply'],
  }),
  entry('story_like', 'staffNotifStoryLikesTitle', 'staffNotifStoryLikesHint', {
    soundFeatureKey: 'social_feed',
    matchExact: ['story_like'],
  }),
  entry('story_reply', 'staffNotifStoryRepliesTitle', 'staffNotifStoryRepliesHint', {
    soundFeatureKey: 'social_feed',
    matchExact: ['story_reply'],
  }),
  entry('feed_post', 'staffNotifFeedPostTitle', 'staffNotifFeedPostHint', {
    soundFeatureKey: 'social_feed',
    matchExact: ['feed_post'],
  }),
  entry('story_post', 'staffNotifStoryPostTitle', 'staffNotifStoryPostHint', {
    soundFeatureKey: 'social_feed',
    matchExact: ['story_post'],
  }),
  entry('group_added', 'staffNotifGroupAddedTitle', 'staffNotifGroupAddedHint', {
    soundFeatureKey: 'group_added',
    matchExact: ['group_added'],
  }),
  entry('admin_reports', 'staffNotifAdminReportsTitle', 'staffNotifAdminReportsHint', {
    soundFeatureKey: 'announcement',
    matchPrefix: ['admin_daily_report', 'admin_evening_report', 'admin_weekly_report', 'admin_high_occupancy', 'admin_empty_rooms', 'admin_payment_reminder'],
  }),
  entry('guest_welcome_app', 'staffNotifGuestWelcomeTitle', 'staffNotifGuestWelcomeHint', {
    soundFeatureKey: 'reception_request',
    matchExact: ['guest_welcome_app'],
  }),
  entry('staff_tip', 'staffNotifStaffTipTitle', 'staffNotifStaffTipHint', {
    soundFeatureKey: 'staff_tip',
    matchExact: [
      'staff_tip',
      'guest_tip_paid',
      'staff_tip_refunded',
      'guest_tip_refunded',
      'staff_tip_thank_you',
      'admin_tip_payment',
    ],
  }),
  entry('payment', 'staffNotifPaymentTitle', 'staffNotifPaymentHint', {
    soundFeatureKey: 'payment',
    matchExact: ['payment_received', 'payment_failed', 'admin_payment_received'],
  }),
  entry('guest_service_request', 'staffNotifGuestServiceRequestTitle', 'staffNotifGuestServiceRequestHint', {
    soundFeatureKey: 'guest_service_request',
    matchExact: ['guest_service_request_new', 'guest_service_request_status', 'hotel_kitchen_menu_order'],
  }),
  entry('technical_asset', 'staffNotifTechnicalAssetTitle', 'staffNotifTechnicalAssetHint', {
    soundFeatureKey: 'technical_asset',
    matchExact: ['tech_fault_report', 'tech_asset_status', 'tech_maintenance_log', 'hotel_facility_status'],
  }),
];

export function staffNotifPrefDbKey(prefKey: string): string {
  return `staff_notif_${prefKey}`;
}

export function staffNotifSoundDbKey(featureKey: string): string {
  return `staff_notif_sound_${featureKey}`;
}

export function isMandatoryNotificationType(notificationType?: string | null): boolean {
  const t = (notificationType ?? '').trim().toLowerCase();
  if (!t) return false;
  if (MANDATORY_NOTIFICATION_TYPES.has(t)) return true;
  if (t.includes('emergency')) return true;
  return false;
}

/** notification_type → staff_notif_<prefKey> anahtarı */
export function resolveStaffNotificationPrefKey(notificationType?: string | null): string {
  const t = (notificationType ?? '').trim().toLowerCase();
  if (!t) return 'announcement';
  if (isMandatoryNotificationType(t)) return t;

  for (const row of STAFF_NOTIFICATION_DELIVERY_TOGGLES) {
    if (row.matchExact.includes(t)) return row.prefKey;
    if (row.matchPrefix.some((p) => t.startsWith(p))) return row.prefKey;
    if (row.matchContains.some((p) => t.includes(p))) return row.prefKey;
  }

  if (t.startsWith('chat_')) return 'staff_mention';
  if (t.startsWith('bulk_') || t.includes('announcement') || t.includes('board')) return 'announcement';

  return t;
}

export function getStaffNotifPrefEntry(prefKey: string): StaffNotifPrefEntry | undefined {
  return STAFF_NOTIFICATION_DELIVERY_TOGGLES.find((e) => e.prefKey === prefKey);
}

/** Ses tercihleri — notificationSoundCatalog feature_key listesi */
export function staffSoundToggleFeatureKeys(): string[] {
  const fromDelivery = new Set(
    STAFF_NOTIFICATION_DELIVERY_TOGGLES.map((e) => e.soundFeatureKey).filter(Boolean) as string[]
  );
  fromDelivery.add('emergency_alert');
  fromDelivery.add('new_message');
  fromDelivery.add('announcement');
  return Array.from(fromDelivery);
}
