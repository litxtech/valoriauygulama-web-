-- Oda servisi: admin panelinden menü / kategori yönetimi

BEGIN;

DROP POLICY IF EXISTS "room_service_categories_admin" ON public.room_service_categories;
CREATE POLICY "room_service_categories_admin"
  ON public.room_service_categories FOR ALL TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

DROP POLICY IF EXISTS "room_service_menu_admin" ON public.room_service_menu_items;
CREATE POLICY "room_service_menu_admin"
  ON public.room_service_menu_items FOR ALL TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

DROP POLICY IF EXISTS "room_service_orders_update" ON public.room_service_orders;
CREATE POLICY "room_service_orders_update"
  ON public.room_service_orders FOR UPDATE TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

COMMIT;
