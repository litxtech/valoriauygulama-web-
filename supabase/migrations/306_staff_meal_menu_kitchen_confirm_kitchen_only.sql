-- Mutfak günlük onayı: yalnızca mutfak personeli / yemek_listesi_mutfak_onay (liste oluşturucu ve genel admin hariç)

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_can_meal_menu_kitchen_confirm()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
      AND (
        coalesce((s.app_permissions->>'yemek_listesi_mutfak_onay')::boolean, false)
        OR lower(trim(coalesce(s.department, ''))) IN (
          'kitchen_staff', 'mutfak', 'kitchen', 'chef', 'head_chef', 'pastry'
        )
      )
  );
$$;

COMMENT ON FUNCTION public.staff_can_meal_menu_kitchen_confirm() IS
  'Günlük yemek listesi mutfak onayı: mutfak departmanı veya yemek_listesi_mutfak_onay izni.';

DROP POLICY IF EXISTS "staff_meal_menu_day_confirm_write" ON public.staff_meal_menu_day_confirmations;
CREATE POLICY "staff_meal_menu_day_confirm_write"
  ON public.staff_meal_menu_day_confirmations FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_meal_menu_kitchen_confirm()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_can_meal_menu_kitchen_confirm()
  );

COMMIT;
