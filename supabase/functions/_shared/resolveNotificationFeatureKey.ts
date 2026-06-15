/** notification_type → bildirim ses feature_key (lib/notificationSoundCatalog ile uyumlu) */

const TYPE_TO_FEATURE: { test: (t: string) => boolean; key: string }[] = [
  { test: (t) => t.includes("emergency"), key: "emergency_alert" },
  { test: (t) => t === "message" || t.startsWith("chat_") || t === "app_screenshot", key: "new_message" },
  { test: (t) => t.includes("task") || t.includes("assignment") || t.includes("repair"), key: "new_task" },
  {
    test: (t) => t.includes("announcement") || t.startsWith("bulk_") || t.includes("board") || t === "admin_panel_alert",
    key: "announcement",
  },
  { test: (t) => t.includes("stock") || t.includes("shortage"), key: "stock_warning" },
  {
    test: (t) =>
      t === "kitchen_revenue_entry" || t === "kitchen_expense_entry" || t === "kitchen_monthly_market_expense",
    key: "kitchen_finance",
  },
  { test: (t) => t.includes("kitchen") || t.includes("breakfast") || t.includes("meal"), key: "kitchen_request" },
  {
    test: (t) => t.startsWith("guest_service_request") || t === "hotel_kitchen_menu_order",
    key: "guest_service_request",
  },
  { test: (t) => t.includes("staff_tip") || t.includes("guest_tip") || t === "admin_tip_payment", key: "staff_tip" },
  {
    test: (t) => t === "payment_received" || t === "payment_failed" || t === "admin_payment_received",
    key: "payment",
  },
  { test: (t) => t.startsWith("tech_") || t === "hotel_facility_status", key: "technical_asset" },
  { test: (t) => t.startsWith("department_rule"), key: "department_rule" },
  {
    test: (t) =>
      t.includes("guest_request") ||
      t.includes("checkin") ||
      t.includes("checkout") ||
      t.includes("transfer_tour") ||
      (t.includes("room_") && !t.startsWith("guest_service_request")),
    key: "reception_request",
  },
  {
    test: (t) =>
      t.includes("debt") || (t.includes("finance") && !t.startsWith("kitchen_")) || t.includes("maliye"),
    key: "accounting_document",
  },
  { test: (t) => t.includes("contract") || t.includes("acceptance"), key: "guest_form" },
  { test: (t) => t.startsWith("kbs_"), key: "kbs_notification" },
  { test: (t) => t.includes("personnel_warning") || t.includes("staff_mention"), key: "staff_call" },
  { test: (t) => t.includes("feed_") || t.includes("story_"), key: "social_feed" },
  {
    test: (t) => t.includes("smart_ops") || t.startsWith("ops_") || t === "scheduled_template_notification",
    key: "smart_ops",
  },
  { test: (t) => t.includes("guest_complaint") || t.includes("staff_internal_note"), key: "complaint" },
  { test: (t) => t.startsWith("missing_item"), key: "missing_item" },
  { test: (t) => t.includes("attendance") || t.includes("staff_attendance"), key: "attendance" },
  { test: (t) => t.startsWith("salary_"), key: "salary" },
  { test: (t) => t.startsWith("expense_"), key: "expense" },
  { test: (t) => t === "report_status", key: "report_status" },
  { test: (t) => t.includes("staff_shift") || t.includes("pending_leave"), key: "shift_leave" },
  { test: (t) => t.includes("staff_permission"), key: "permission_update" },
  { test: (t) => t.includes("staff_room_cleaning") || t.includes("room_cleaning"), key: "room_cleaning" },
  { test: (t) => t === "managed_contract", key: "managed_contract" },
  { test: (t) => t === "group_added", key: "group_added" },
];

export function resolveNotificationFeatureKey(
  notificationType?: string | null,
  category?: string | null
): string {
  const t = (notificationType ?? "").trim().toLowerCase();
  const cat = (category ?? "").trim().toLowerCase();
  if (cat === "emergency") return "emergency_alert";
  if (!t) return "announcement";
  for (const row of TYPE_TO_FEATURE) {
    if (row.test(t)) return row.key;
  }
  return "announcement";
}
