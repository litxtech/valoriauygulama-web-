-- Kimlik çekim bildirimi: admin işletme bazında hedef personel seçer.

CREATE TABLE IF NOT EXISTS public.kbs_capture_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  notify_staff_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.kbs_capture_settings (organization_id)
SELECT o.id FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.kbs_capture_settings_seed_for_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.kbs_capture_settings (organization_id) VALUES (NEW.id)
  ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kbs_capture_settings_seed ON public.organizations;
CREATE TRIGGER trg_kbs_capture_settings_seed
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.kbs_capture_settings_seed_for_org();

CREATE OR REPLACE FUNCTION public.kbs_capture_settings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kbs_capture_settings_updated ON public.kbs_capture_settings;
CREATE TRIGGER trg_kbs_capture_settings_updated
  BEFORE UPDATE ON public.kbs_capture_settings
  FOR EACH ROW EXECUTE FUNCTION public.kbs_capture_settings_touch_updated_at();

ALTER TABLE public.kbs_capture_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kbs_capture_settings_select_org" ON public.kbs_capture_settings;
CREATE POLICY "kbs_capture_settings_select_org"
  ON public.kbs_capture_settings FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "kbs_capture_settings_update_admin" ON public.kbs_capture_settings;
CREATE POLICY "kbs_capture_settings_update_admin"
  ON public.kbs_capture_settings FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

GRANT SELECT, UPDATE ON public.kbs_capture_settings TO authenticated;

COMMENT ON TABLE public.kbs_capture_settings IS 'Kimlik/pasaport çekim bildirimi hedef personel listesi (işletme bazlı).';
