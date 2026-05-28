BEGIN;

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text UNIQUE,
  title text NOT NULL,
  body text NOT NULL,
  target_role text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  send_time time,
  repeat_type text NOT NULL DEFAULT 'daily' CHECK (repeat_type IN ('once', 'daily', 'weekdays', 'weekend', 'custom_days', 'interval')),
  repeat_interval_minutes integer CHECK (repeat_interval_minutes IS NULL OR repeat_interval_minutes > 0),
  active_days smallint[] DEFAULT ARRAY[]::smallint[],
  timezone text NOT NULL DEFAULT 'Europe/Istanbul',
  critical_level text NOT NULL DEFAULT 'normal' CHECK (critical_level IN ('low', 'normal', 'high', 'critical')),
  require_photo text NOT NULL DEFAULT 'optional' CHECK (require_photo IN ('off', 'optional', 'required')),
  sound_type text NOT NULL DEFAULT 'normal' CHECK (sound_type IN ('normal', 'critical', 'alarm', 'manager', 'silent')),
  escalation_enabled boolean NOT NULL DEFAULT true,
  escalate_after_5m boolean NOT NULL DEFAULT true,
  escalate_after_10m boolean NOT NULL DEFAULT true,
  escalate_after_15m boolean NOT NULL DEFAULT true,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sent_at timestamptz,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_templates_active_days_range CHECK (
    active_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[]
  )
);

ALTER TABLE public.notification_templates
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS target_role text,
  ADD COLUMN IF NOT EXISTS active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS send_time time,
  ADD COLUMN IF NOT EXISTS repeat_type text DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS repeat_interval_minutes integer,
  ADD COLUMN IF NOT EXISTS active_days smallint[] DEFAULT ARRAY[]::smallint[],
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Istanbul',
  ADD COLUMN IF NOT EXISTS critical_level text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS require_photo text DEFAULT 'optional',
  ADD COLUMN IF NOT EXISTS sound_type text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS escalation_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS escalate_after_5m boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS escalate_after_10m boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS escalate_after_15m boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notification_templates'
      AND column_name = 'role'
  ) THEN
    EXECUTE 'UPDATE public.notification_templates
             SET target_role = COALESCE(target_role, "role")
             WHERE target_role IS NULL';
  END IF;
END $$;

UPDATE public.notification_templates
SET target_role = COALESCE(target_role, 'general')
WHERE target_role IS NULL;

ALTER TABLE public.notification_templates
  ALTER COLUMN target_role SET DEFAULT 'general';

CREATE TABLE IF NOT EXISTS public.task_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_id uuid NOT NULL REFERENCES public.notification_templates(id) ON DELETE RESTRICT,
  assigned_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  assigned_role text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
  critical_level text NOT NULL DEFAULT 'normal' CHECK (critical_level IN ('low', 'normal', 'high', 'critical')),
  require_photo text NOT NULL DEFAULT 'optional' CHECK (require_photo IN ('off', 'optional', 'required')),
  sound_type text NOT NULL DEFAULT 'normal' CHECK (sound_type IN ('normal', 'critical', 'alarm', 'manager', 'silent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'completed', 'partial', 'issue_reported', 'overdue_l1', 'overdue_l2', 'overdue_l3', 'cancelled')),
  completion_type text CHECK (completion_type IN ('completed', 'partial', 'issue_reported')),
  scheduled_for timestamptz NOT NULL,
  first_sent_at timestamptz,
  last_sent_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  note text,
  photo_url text,
  issue_text text,
  escalated_l1_at timestamptz,
  escalated_l2_at timestamptz,
  escalated_l3_at timestamptz,
  closed_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  source_event_type text,
  source_event_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_instances_required_photo_check CHECK (
    require_photo <> 'required'
    OR status <> 'completed'
    OR photo_url IS NOT NULL
  )
);

CREATE TABLE IF NOT EXISTS public.task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_instance_id uuid NOT NULL REFERENCES public.task_instances(id) ON DELETE CASCADE,
  item_order integer NOT NULL DEFAULT 0,
  label text NOT NULL,
  is_required boolean NOT NULL DEFAULT true,
  checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  note text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (task_instance_id, item_order)
);

CREATE TABLE IF NOT EXISTS public.task_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_instance_id uuid REFERENCES public.task_instances(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  actor_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('notification_sent', 'task_viewed', 'task_acknowledged', 'task_completed', 'task_partial', 'task_issue_reported', 'task_overdue_l1', 'task_overdue_l2', 'task_overdue_l3', 'photo_uploaded', 'manager_reviewed', 'task_cancelled')),
  note text,
  photo_url text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.operation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  type text NOT NULL,
  level text NOT NULL CHECK (level IN ('info', 'warning', 'high', 'critical')),
  message text NOT NULL,
  related_task_instance_id uuid REFERENCES public.task_instances(id) ON DELETE SET NULL,
  related_notification_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  acknowledged_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.notification_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  task_instance_id uuid REFERENCES public.task_instances(id) ON DELETE CASCADE,
  notification_id uuid REFERENCES public.notification_templates(id) ON DELETE SET NULL,
  target_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'push' CHECK (channel IN ('push', 'in_app', 'sms', 'email')),
  delivery_status text NOT NULL DEFAULT 'sent' CHECK (delivery_status IN ('sent', 'delivered', 'opened', 'failed')),
  provider text,
  provider_message_id text,
  error_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notification_templates IS 'Dinamik operasyon bildirim şablonları';
COMMENT ON TABLE public.task_instances IS 'Şablondan üretilen görev olayları (snapshot kayıt)';
COMMENT ON TABLE public.task_logs IS 'Görev/bildirim işlem günlüğü';
COMMENT ON TABLE public.operation_alerts IS 'Operasyonel kritik uyarılar';
COMMENT ON TABLE public.notification_delivery_logs IS 'Push/in-app teslimat logları';

CREATE INDEX IF NOT EXISTS notification_templates_org_active_time_idx
  ON public.notification_templates (organization_id, active, send_time);
CREATE INDEX IF NOT EXISTS notification_templates_org_role_idx
  ON public.notification_templates (organization_id, target_role, active);

CREATE INDEX IF NOT EXISTS task_instances_org_status_due_idx
  ON public.task_instances (organization_id, status, due_at);
CREATE INDEX IF NOT EXISTS task_instances_assigned_status_idx
  ON public.task_instances (assigned_staff_id, status, scheduled_for DESC);
CREATE INDEX IF NOT EXISTS task_instances_notification_idx
  ON public.task_instances (notification_id, scheduled_for DESC);

CREATE INDEX IF NOT EXISTS task_checklist_items_task_order_idx
  ON public.task_checklist_items (task_instance_id, item_order);

CREATE INDEX IF NOT EXISTS task_logs_org_created_idx
  ON public.task_logs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS task_logs_task_created_idx
  ON public.task_logs (task_instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS operation_alerts_org_level_created_idx
  ON public.operation_alerts (organization_id, level, created_at DESC);
CREATE INDEX IF NOT EXISTS operation_alerts_task_idx
  ON public.operation_alerts (related_task_instance_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_delivery_logs_org_status_sent_idx
  ON public.notification_delivery_logs (organization_id, delivery_status, sent_at DESC);
CREATE INDEX IF NOT EXISTS notification_delivery_logs_target_staff_idx
  ON public.notification_delivery_logs (target_staff_id, sent_at DESC);

CREATE OR REPLACE FUNCTION public.touch_smart_ops_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_templates_updated_at ON public.notification_templates;
CREATE TRIGGER trg_notification_templates_updated_at
  BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_smart_ops_updated_at();

DROP TRIGGER IF EXISTS trg_task_instances_updated_at ON public.task_instances;
CREATE TRIGGER trg_task_instances_updated_at
  BEFORE UPDATE ON public.task_instances
  FOR EACH ROW EXECUTE FUNCTION public.touch_smart_ops_updated_at();

DROP TRIGGER IF EXISTS trg_task_checklist_items_updated_at ON public.task_checklist_items;
CREATE TRIGGER trg_task_checklist_items_updated_at
  BEFORE UPDATE ON public.task_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_smart_ops_updated_at();

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_templates_select_org" ON public.notification_templates;
CREATE POLICY "notification_templates_select_org"
  ON public.notification_templates FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "notification_templates_insert_admin" ON public.notification_templates;
CREATE POLICY "notification_templates_insert_admin"
  ON public.notification_templates FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "notification_templates_update_admin" ON public.notification_templates;
CREATE POLICY "notification_templates_update_admin"
  ON public.notification_templates FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "notification_templates_delete_admin" ON public.notification_templates;
CREATE POLICY "notification_templates_delete_admin"
  ON public.notification_templates FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "task_instances_select_org" ON public.task_instances;
CREATE POLICY "task_instances_select_org"
  ON public.task_instances FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "task_instances_insert_admin" ON public.task_instances;
CREATE POLICY "task_instances_insert_admin"
  ON public.task_instances FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "task_instances_update_org_actor" ON public.task_instances;
CREATE POLICY "task_instances_update_org_actor"
  ON public.task_instances FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND (
        assigned_staff_id = public.current_staff_id()
      )
    )
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND (
        assigned_staff_id = public.current_staff_id()
      )
    )
  );

DROP POLICY IF EXISTS "task_checklist_items_select_org" ON public.task_checklist_items;
CREATE POLICY "task_checklist_items_select_org"
  ON public.task_checklist_items FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "task_checklist_items_insert_admin" ON public.task_checklist_items;
CREATE POLICY "task_checklist_items_insert_admin"
  ON public.task_checklist_items FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "task_checklist_items_update_org_actor" ON public.task_checklist_items;
CREATE POLICY "task_checklist_items_update_org_actor"
  ON public.task_checklist_items FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND EXISTS (
        SELECT 1
        FROM public.task_instances t
        WHERE t.id = task_checklist_items.task_instance_id
          AND (
            t.assigned_staff_id = public.current_staff_id()
          )
      )
    )
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "task_logs_select_org" ON public.task_logs;
CREATE POLICY "task_logs_select_org"
  ON public.task_logs FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "task_logs_insert_org_actor" ON public.task_logs;
CREATE POLICY "task_logs_insert_org_actor"
  ON public.task_logs FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR actor_staff_id = public.current_staff_id()
      OR EXISTS (
        SELECT 1
        FROM public.task_instances t
        WHERE t.id = task_logs.task_instance_id
          AND t.assigned_staff_id = public.current_staff_id()
      )
    )
  );

DROP POLICY IF EXISTS "operation_alerts_select_org" ON public.operation_alerts;
CREATE POLICY "operation_alerts_select_org"
  ON public.operation_alerts FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "operation_alerts_write_admin" ON public.operation_alerts;
CREATE POLICY "operation_alerts_write_admin"
  ON public.operation_alerts FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "operation_alerts_update_admin" ON public.operation_alerts;
CREATE POLICY "operation_alerts_update_admin"
  ON public.operation_alerts FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

DROP POLICY IF EXISTS "notification_delivery_logs_select_org" ON public.notification_delivery_logs;
CREATE POLICY "notification_delivery_logs_select_org"
  ON public.notification_delivery_logs FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND (
        target_staff_id = public.current_staff_id()
      )
    )
  );

DROP POLICY IF EXISTS "notification_delivery_logs_insert_admin" ON public.notification_delivery_logs;
CREATE POLICY "notification_delivery_logs_insert_admin"
  ON public.notification_delivery_logs FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.task_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.task_checklist_items TO authenticated;
GRANT SELECT, INSERT ON public.task_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.operation_alerts TO authenticated;
GRANT SELECT, INSERT ON public.notification_delivery_logs TO authenticated;

COMMIT;
