-- Admin: duyuru okuma + görev görüntüleme takibi

CREATE TABLE IF NOT EXISTS public.staff_assignment_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.staff_assignments(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, staff_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_assignment_views_assignment
  ON public.staff_assignment_views(assignment_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS idx_staff_assignment_views_staff
  ON public.staff_assignment_views(staff_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS public.staff_tasks_tab_views (
  staff_id UUID PRIMARY KEY REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  last_opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_tasks_tab_views_org
  ON public.staff_tasks_tab_views(organization_id, last_opened_at DESC);

ALTER TABLE public.staff_assignment_views ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_tasks_tab_views ENABLE ROW LEVEL SECURITY;

-- Personel kendi görev görüntülemesini kaydeder
DROP POLICY IF EXISTS staff_assignment_views_insert_self ON public.staff_assignment_views;
CREATE POLICY staff_assignment_views_insert_self ON public.staff_assignment_views
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS staff_assignment_views_update_self ON public.staff_assignment_views;
CREATE POLICY staff_assignment_views_update_self ON public.staff_assignment_views
  FOR UPDATE TO authenticated
  USING (
    staff_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    staff_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS staff_tasks_tab_views_upsert_self ON public.staff_tasks_tab_views;
CREATE POLICY staff_tasks_tab_views_upsert_self ON public.staff_tasks_tab_views
  FOR ALL TO authenticated
  USING (
    staff_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1)
  )
  WITH CHECK (
    staff_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Admin / yetkili: aynı işletmedeki okuma ve görüntülemeleri okuyabilir
CREATE OR REPLACE FUNCTION public.staff_is_engagement_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND (
        s.role = 'admin'
        OR COALESCE((s.app_permissions->>'toplu_duyuru') = 'true', false)
        OR COALESCE((s.app_permissions->>'gorev_ata') = 'true', false)
        OR COALESCE((s.app_permissions->>'super_admin') = 'true', false)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.staff_is_engagement_admin() TO authenticated;

DROP POLICY IF EXISTS staff_assignment_views_admin_select ON public.staff_assignment_views;
CREATE POLICY staff_assignment_views_admin_select ON public.staff_assignment_views
  FOR SELECT TO authenticated
  USING (
    public.staff_is_engagement_admin()
    AND EXISTS (
      SELECT 1
      FROM public.staff_assignments sa
      JOIN public.staff viewer ON viewer.id = staff_assignment_views.staff_id
      JOIN public.staff admin_s ON admin_s.auth_id = auth.uid()
      WHERE sa.id = staff_assignment_views.assignment_id
        AND viewer.organization_id = admin_s.organization_id
    )
  );

DROP POLICY IF EXISTS staff_tasks_tab_views_admin_select ON public.staff_tasks_tab_views;
CREATE POLICY staff_tasks_tab_views_admin_select ON public.staff_tasks_tab_views
  FOR SELECT TO authenticated
  USING (
    public.staff_is_engagement_admin()
    AND organization_id = (
      SELECT organization_id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1
    )
  );

DROP POLICY IF EXISTS announcement_reads_admin_select ON public.announcement_reads;
CREATE POLICY announcement_reads_admin_select ON public.announcement_reads
  FOR SELECT TO authenticated
  USING (
    public.staff_is_engagement_admin()
    AND user_type IN ('staff', 'admin')
    AND EXISTS (
      SELECT 1
      FROM public.staff reader
      JOIN public.staff admin_s ON admin_s.auth_id = auth.uid()
      WHERE reader.id = announcement_reads.user_id
        AND reader.organization_id = admin_s.organization_id
    )
  );

COMMENT ON TABLE public.staff_assignment_views IS 'Personelin belirli bir görevi açma/görüntüleme kaydı';
COMMENT ON TABLE public.staff_tasks_tab_views IS 'Personelin görevler sekmesini son açış zamanı';
