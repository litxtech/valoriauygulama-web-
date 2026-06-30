-- Temizlik ekranında "bu odaları kimler temizleyecek" listesi için:
-- Bir plana atanan personel, aynı plandaki DİĞER atanan temizlikçileri de görebilmeli.
-- Mevcut SELECT politikası yalnızca kendi atama satırını görmeye izin veriyordu.
BEGIN;

-- Aynı tabloya referans veren politikada RLS özyinelemesini önlemek için
-- SECURITY DEFINER yardımcı fonksiyon (sahibi postgres → RLS bypass).
CREATE OR REPLACE FUNCTION public.current_staff_assigned_to_cleaning_plan(p_plan_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.room_cleaning_plan_assignments a
    WHERE a.plan_id = p_plan_id
      AND a.staff_id = public.current_staff_id()
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_staff_assigned_to_cleaning_plan(uuid) TO authenticated;

DROP POLICY IF EXISTS "room_cleaning_plan_assignments_select_authenticated" ON public.room_cleaning_plan_assignments;
CREATE POLICY "room_cleaning_plan_assignments_select_authenticated" ON public.room_cleaning_plan_assignments
  FOR SELECT TO authenticated
  USING (
    public.current_user_is_staff_admin()
    OR public.staff_has_app_permission('yarin_oda_temizlik_listesi')
    OR staff_id = public.current_staff_id()
    OR public.current_staff_assigned_to_cleaning_plan(plan_id)
  );

COMMIT;
