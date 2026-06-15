-- Sabah kahvaltı misafir sayısı + otel nüfusu bildirimi (mutfak / resepsiyon).

BEGIN;

CREATE TABLE IF NOT EXISTS public.breakfast_morning_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_date date NOT NULL DEFAULT (timezone('Europe/Istanbul', now()))::date,
  breakfast_guest_count integer NOT NULL CHECK (breakfast_guest_count >= 0),
  hotel_guest_count integer NOT NULL CHECK (hotel_guest_count >= 0),
  notify_targets text[] NOT NULL DEFAULT '{}',
  note text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT breakfast_morning_briefing_targets_valid CHECK (
    notify_targets <@ ARRAY['kitchen', 'reception']::text[]
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS breakfast_morning_briefing_org_date_uidx
  ON public.breakfast_morning_briefings (organization_id, record_date);

CREATE INDEX IF NOT EXISTS breakfast_morning_briefing_org_date_idx
  ON public.breakfast_morning_briefings (organization_id, record_date DESC);

COMMENT ON TABLE public.breakfast_morning_briefings IS
  'Sabah kahvaltı misafir sayısı ve otel nüfusu — mutfak/resepsiyon push bildirimi.';

CREATE OR REPLACE FUNCTION public.staff_department_is_kitchen(p_department text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(trim(coalesce(p_department, ''))) IN (
    'kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry', 'restaurant'
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_department_is_reception(p_department text, p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_role IN ('reception_chief', 'receptionist', 'admin')
    OR lower(trim(coalesce(p_department, ''))) IN (
      'reception', 'receptionist', 'reception_chief', 'resepsiyon', 'front_desk'
    );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_breakfast_briefing_manage()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.current_user_is_staff_admin()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (
          s.role = 'reception_chief'
          OR public.staff_has_app_permission('doluluk_operasyon')
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.staff_can_breakfast_briefing_view()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.staff_can_breakfast_briefing_manage()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (
          public.staff_department_is_kitchen(s.department)
          OR public.staff_department_is_reception(s.department, s.role)
          OR public.staff_has_app_permission('mutfak_operasyon')
          OR public.staff_has_app_permission('yemek_listesi_mutfak_onay')
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.breakfast_morning_briefings_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_breakfast_morning_briefings_updated ON public.breakfast_morning_briefings;
CREATE TRIGGER trg_breakfast_morning_briefings_updated
  BEFORE UPDATE ON public.breakfast_morning_briefings
  FOR EACH ROW EXECUTE FUNCTION public.breakfast_morning_briefings_set_updated_at();

ALTER TABLE public.breakfast_morning_briefings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "breakfast_morning_briefing_select" ON public.breakfast_morning_briefings;
CREATE POLICY "breakfast_morning_briefing_select"
  ON public.breakfast_morning_briefings FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND public.staff_can_breakfast_briefing_view()
    )
  );

DROP POLICY IF EXISTS "breakfast_morning_briefing_insert" ON public.breakfast_morning_briefings;
CREATE POLICY "breakfast_morning_briefing_insert"
  ON public.breakfast_morning_briefings FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND public.staff_can_breakfast_briefing_manage()
    )
  );

DROP POLICY IF EXISTS "breakfast_morning_briefing_update" ON public.breakfast_morning_briefings;
CREATE POLICY "breakfast_morning_briefing_update"
  ON public.breakfast_morning_briefings FOR UPDATE TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR (
      organization_id = public.current_staff_organization_id()
      AND public.staff_can_breakfast_briefing_manage()
    )
  )
  WITH CHECK (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

GRANT SELECT, INSERT, UPDATE ON public.breakfast_morning_briefings TO authenticated;

COMMIT;
