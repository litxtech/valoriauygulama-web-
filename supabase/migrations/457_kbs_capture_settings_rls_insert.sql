-- kbs_capture_settings: upsert INSERT RLS + eksik işletme satırları

INSERT INTO public.kbs_capture_settings (organization_id)
SELECT o.id
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1
  FROM public.kbs_capture_settings k
  WHERE k.organization_id = o.id
);

DROP POLICY IF EXISTS "kbs_capture_settings_insert_admin" ON public.kbs_capture_settings;
CREATE POLICY "kbs_capture_settings_insert_admin"
  ON public.kbs_capture_settings FOR INSERT TO authenticated
  WITH CHECK (public.current_user_is_staff_admin());

GRANT INSERT ON public.kbs_capture_settings TO authenticated;
