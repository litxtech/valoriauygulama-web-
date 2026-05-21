-- Personel: yemek_listesi_olustur izni ile aylık menü düzenleme (admin dışı mutfak vb.)

BEGIN;

DROP POLICY IF EXISTS "staff_meal_menus_admin_write" ON public.staff_meal_menus;
CREATE POLICY "staff_meal_menus_write_admin_or_perm"
  ON public.staff_meal_menus FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_app_permission('yemek_listesi_olustur')
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.current_user_is_staff_admin()
      OR public.staff_has_app_permission('yemek_listesi_olustur')
    )
  );

DROP POLICY IF EXISTS "staff_meal_menu_days_admin_write" ON public.staff_meal_menu_days;
CREATE POLICY "staff_meal_menu_days_write_admin_or_perm"
  ON public.staff_meal_menu_days FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_meal_menus m
      WHERE m.id = staff_meal_menu_days.menu_id
        AND m.organization_id = public.current_staff_organization_id()
        AND (
          public.current_user_is_staff_admin()
          OR public.staff_has_app_permission('yemek_listesi_olustur')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff_meal_menus m
      WHERE m.id = staff_meal_menu_days.menu_id
        AND m.organization_id = public.current_staff_organization_id()
        AND (
          public.current_user_is_staff_admin()
          OR public.staff_has_app_permission('yemek_listesi_olustur')
        )
    )
  );

COMMIT;
