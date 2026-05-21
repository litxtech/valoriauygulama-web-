-- Günlük mutfak onayı: listedeki yemekler yapıldı, numune alındı, muhafaza edildi

BEGIN;

CREATE TABLE IF NOT EXISTS public.staff_meal_menu_day_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  menu_id uuid NOT NULL REFERENCES public.staff_meal_menus(id) ON DELETE CASCADE,
  meal_date date NOT NULL,
  confirmed_by_staff_id uuid NOT NULL REFERENCES public.staff(id),
  prepared_meals boolean NOT NULL DEFAULT true,
  took_samples boolean NOT NULL DEFAULT true,
  preserved_samples boolean NOT NULL DEFAULT true,
  note text,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_meal_menu_day_confirm_org_date UNIQUE (organization_id, meal_date)
);

CREATE INDEX IF NOT EXISTS idx_staff_meal_menu_day_confirm_menu_date
  ON public.staff_meal_menu_day_confirmations (menu_id, meal_date DESC);

CREATE INDEX IF NOT EXISTS idx_staff_meal_menu_day_confirm_org_date
  ON public.staff_meal_menu_day_confirmations (organization_id, meal_date DESC);

DROP TRIGGER IF EXISTS trg_staff_meal_menu_day_confirm_updated ON public.staff_meal_menu_day_confirmations;
CREATE TRIGGER trg_staff_meal_menu_day_confirm_updated
  BEFORE UPDATE ON public.staff_meal_menu_day_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.staff_meal_menus_set_updated_at();

ALTER TABLE public.staff_meal_menu_day_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_meal_menu_day_confirm_select_org" ON public.staff_meal_menu_day_confirmations;
CREATE POLICY "staff_meal_menu_day_confirm_select_org"
  ON public.staff_meal_menu_day_confirmations FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "staff_meal_menu_day_confirm_write" ON public.staff_meal_menu_day_confirmations;
CREATE POLICY "staff_meal_menu_day_confirm_write"
  ON public.staff_meal_menu_day_confirmations FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_app_permission('yemek_listesi_mutfak_onay')
      OR public.staff_has_app_permission('yemek_listesi_olustur')
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_app_permission('yemek_listesi_mutfak_onay')
      OR public.staff_has_app_permission('yemek_listesi_olustur')
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_meal_menu_day_confirmations TO authenticated;

COMMENT ON TABLE public.staff_meal_menu_day_confirmations IS
  'Günlük mutfak teyidi: menüdeki yemekler hazırlandı, numune alındı ve muhafaza edildi.';

COMMIT;
