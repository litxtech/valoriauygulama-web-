-- Oda ödeme panosu: alınmadı / bekliyor / alındı + tutar + alan personel
BEGIN;

CREATE TABLE IF NOT EXISTS public.room_payment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  room_id uuid REFERENCES public.rooms(id) ON DELETE CASCADE,
  location_label text,
  target_date date NOT NULL DEFAULT ((timezone('Europe/Istanbul', now()))::date),
  status text NOT NULL DEFAULT 'unpaid'
    CHECK (status IN ('unpaid', 'waiting', 'collected')),
  amount_due numeric(12, 2) NOT NULL DEFAULT 0
    CHECK (amount_due >= 0),
  amount_collected numeric(12, 2)
    CHECK (amount_collected IS NULL OR amount_collected >= 0),
  currency text NOT NULL DEFAULT 'TRY',
  payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'transfer', 'other')),
  guest_label text,
  note text,
  is_priority boolean NOT NULL DEFAULT false,
  scheduled_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  collected_at timestamptz,
  collected_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_payment_jobs_room_or_label CHECK (
    room_id IS NOT NULL
    OR (location_label IS NOT NULL AND length(trim(location_label)) > 0)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pay_jobs_org_room_date
  ON public.room_payment_jobs (organization_id, room_id, target_date)
  WHERE room_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_room_pay_jobs_org_label_date
  ON public.room_payment_jobs (organization_id, lower(trim(location_label)), target_date)
  WHERE room_id IS NULL AND location_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_room_pay_jobs_org_date_status
  ON public.room_payment_jobs (organization_id, target_date, status);

CREATE INDEX IF NOT EXISTS idx_room_pay_jobs_org_status
  ON public.room_payment_jobs (organization_id, status)
  WHERE status IN ('unpaid', 'waiting');

COMMENT ON TABLE public.room_payment_jobs IS
  'Resepsiyon oda tahsilat panosu: alınmadı / bekliyor / alındı; tutar ve alan personel anlık güncellenir.';

CREATE OR REPLACE FUNCTION public.room_payment_jobs_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_room_pay_jobs_updated_at ON public.room_payment_jobs;
CREATE TRIGGER trg_room_pay_jobs_updated_at
  BEFORE UPDATE ON public.room_payment_jobs
  FOR EACH ROW EXECUTE FUNCTION public.room_payment_jobs_set_updated_at();

ALTER TABLE public.room_payment_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS room_pay_jobs_select_org ON public.room_payment_jobs;
CREATE POLICY room_pay_jobs_select_org ON public.room_payment_jobs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_pay_jobs_insert_org ON public.room_payment_jobs;
CREATE POLICY room_pay_jobs_insert_org ON public.room_payment_jobs
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_pay_jobs_update_org ON public.room_payment_jobs;
CREATE POLICY room_pay_jobs_update_org ON public.room_payment_jobs
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_staff_organization_id())
  WITH CHECK (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS room_pay_jobs_delete_org ON public.room_payment_jobs;
CREATE POLICY room_pay_jobs_delete_org ON public.room_payment_jobs
  FOR DELETE TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'room_payment_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.room_payment_jobs;
  END IF;
END $$;

-- Bildirim tercihi: staff_room_payment* → room_payment
CREATE OR REPLACE FUNCTION public.resolve_staff_notification_pref_key(p_notification_type text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  t text := lower(coalesce(trim(p_notification_type), ''));
BEGIN
  IF t = '' THEN
    RETURN 'announcement';
  END IF;

  IF t = 'staff_ops_morning_digest' THEN
    RETURN 'ops_morning_digest';
  END IF;

  IF t = 'fault_record_created' OR t LIKE 'fault_record%' THEN
    RETURN 'technical_asset';
  END IF;

  IF t IN (
    'message', 'chat_message', 'admin_announcement', 'admin_panel_alert', 'staff_personnel_warning'
  ) OR t LIKE '%emergency%' THEN
    RETURN t;
  END IF;

  IF t IN (
    'staff_assignment', 'staff_new_task', 'staff_urgent_task', 'staff_task_done',
    'staff_new_repair', 'staff_urgent_repair', 'staff_repair_done',
    'stock_pending_approval', 'admin_critical_stock', 'admin_pending_stock', 'staff_stock_entry_pending',
    'breakfast_morning_briefing', 'breakfast_partner_entry', 'breakfast_partner_remind',
    'breakfast_partner_payment_staff',
    'staff_meal_menu_daily', 'transfer_tour',
    'attendance_missing_checkin', 'staff_attendance_action',
    'salary_deposited', 'salary_reminder', 'expense_pending_approval', 'report_status',
    'staff_shift_changes', 'admin_pending_leave', 'staff_permission_updated',
    'managed_contract', 'staff_personnel_warning_ack',
    'staff_mention', 'chat_mention', 'chat_screenshot',
    'feed_like', 'feed_comment', 'feed_comment_reply', 'story_like', 'story_reply',
    'feed_post', 'story_post', 'group_added', 'guest_welcome_app', 'staff_debt',
    'tech_fault_report', 'tech_asset_status', 'tech_maintenance_log', 'hotel_facility_status'
  ) THEN
    RETURN CASE t
      WHEN 'staff_assignment' THEN 'staff_assignment'
      WHEN 'staff_new_task' THEN 'new_task'
      WHEN 'staff_urgent_task' THEN 'new_task'
      WHEN 'staff_task_done' THEN 'new_task'
      WHEN 'staff_new_repair' THEN 'new_task'
      WHEN 'staff_urgent_repair' THEN 'new_task'
      WHEN 'staff_repair_done' THEN 'new_task'
      WHEN 'stock_pending_approval' THEN 'stock_pending_approval'
      WHEN 'admin_critical_stock' THEN 'stock_pending_approval'
      WHEN 'admin_pending_stock' THEN 'stock_pending_approval'
      WHEN 'staff_stock_entry_pending' THEN 'stock_pending_approval'
      WHEN 'breakfast_morning_briefing' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_entry' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_remind' THEN 'breakfast_briefing'
      WHEN 'breakfast_partner_payment_staff' THEN 'breakfast_briefing'
      WHEN 'staff_meal_menu_daily' THEN 'staff_meal_menu_daily'
      WHEN 'transfer_tour' THEN 'reception_request'
      WHEN 'attendance_missing_checkin' THEN 'attendance'
      WHEN 'staff_attendance_action' THEN 'attendance'
      WHEN 'salary_deposited' THEN 'salary_deposited'
      WHEN 'salary_reminder' THEN 'salary_reminder'
      WHEN 'expense_pending_approval' THEN 'expense_pending_approval'
      WHEN 'report_status' THEN 'report_status'
      WHEN 'staff_shift_changes' THEN 'shift_leave'
      WHEN 'admin_pending_leave' THEN 'shift_leave'
      WHEN 'staff_permission_updated' THEN 'staff_permission_updated'
      WHEN 'managed_contract' THEN 'managed_contract'
      WHEN 'staff_personnel_warning_ack' THEN 'staff_personnel_warning_ack'
      WHEN 'staff_mention' THEN 'staff_mention'
      WHEN 'chat_mention' THEN 'staff_mention'
      WHEN 'chat_screenshot' THEN 'chat_screenshot'
      WHEN 'feed_like' THEN 'feed_like'
      WHEN 'feed_comment' THEN 'feed_comment'
      WHEN 'feed_comment_reply' THEN 'feed_comment_reply'
      WHEN 'story_like' THEN 'story_like'
      WHEN 'story_reply' THEN 'story_reply'
      WHEN 'feed_post' THEN 'feed_post'
      WHEN 'story_post' THEN 'story_post'
      WHEN 'group_added' THEN 'group_added'
      WHEN 'guest_welcome_app' THEN 'guest_welcome_app'
      WHEN 'staff_debt' THEN 'accounting_document'
      WHEN 'tech_fault_report' THEN 'technical_asset'
      WHEN 'tech_asset_status' THEN 'technical_asset'
      WHEN 'tech_maintenance_log' THEN 'technical_asset'
      WHEN 'hotel_facility_status' THEN 'technical_asset'
      ELSE t
    END;
  END IF;

  IF t LIKE 'breakfast_confirmation%' THEN RETURN 'breakfast_confirm'; END IF;
  IF t LIKE 'kitchen%' OR t LIKE 'meal%' THEN RETURN 'kitchen_request'; END IF;
  IF t LIKE 'guest_request%' OR t LIKE 'guest_checkin%' OR t LIKE 'guest_checkout%'
     OR t LIKE 'guest_admin_assigned%' OR t LIKE 'guest_room%' OR t LIKE 'admin_pending_checkin%' THEN
    RETURN 'reception_request';
  END IF;
  IF t LIKE 'staff_room_payment%' THEN RETURN 'room_payment'; END IF;
  IF t LIKE 'staff_room_cleaning%' THEN RETURN 'room_cleaning'; END IF;
  IF t LIKE 'guest_complaint%' OR t LIKE 'staff_internal_note%' THEN RETURN 'complaint'; END IF;
  IF t LIKE 'missing_item%' THEN RETURN 'missing_item'; END IF;
  IF t LIKE 'attendance_%' THEN RETURN 'attendance'; END IF;
  IF t LIKE 'kbs_%' THEN RETURN 'kbs_notification'; END IF;
  IF t LIKE 'finance%' OR t LIKE 'maliye%' OR t LIKE '%accounting%' OR t LIKE '%document%' THEN
    RETURN 'accounting_document';
  END IF;
  IF t LIKE 'admin_contract%' OR t LIKE 'guest_contract%' OR t LIKE '%contract_acceptance%' OR t LIKE '%acceptance%' THEN
    RETURN 'guest_form';
  END IF;
  IF t LIKE 'smart_ops%' OR t LIKE 'ops_%' THEN RETURN 'smart_ops'; END IF;
  IF t LIKE 'admin_daily_report%' OR t LIKE 'admin_evening_report%' OR t LIKE 'admin_weekly_report%'
     OR t LIKE 'admin_high_occupancy%' OR t LIKE 'admin_empty_rooms%' OR t LIKE 'admin_payment_reminder%' THEN
    RETURN 'admin_reports';
  END IF;
  IF t LIKE 'staff_stock%' OR t LIKE 'kitchen_shortage%' OR t LIKE '%stock%' THEN
    RETURN 'stock_pending_approval';
  END IF;
  IF t LIKE 'tech_%' THEN RETURN 'technical_asset'; END IF;
  IF t LIKE 'chat_%' THEN RETURN 'staff_mention'; END IF;
  IF t LIKE 'bulk_%' OR t LIKE '%announcement%' OR t LIKE '%board%' THEN RETURN 'announcement'; END IF;
  IF t LIKE '%checkin%' OR t LIKE '%checkout%' THEN RETURN 'reception_request'; END IF;

  RETURN t;
END;
$$;

COMMENT ON FUNCTION public.resolve_staff_notification_pref_key(text) IS
  'Maps notification_type to staff_notif_<pref_key> (staff_room_payment* → room_payment).';

COMMIT;
