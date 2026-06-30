-- Bildirim alıcısı seçilmemişse mutfak departmanına varsayılan push

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_ids_kitchen_menu_order_notify(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  WITH notify_cfg AS (
    SELECT coalesce(kos.menu_order_notify_staff_ids, ARRAY[]::uuid[]) AS ids
    FROM public.kitchen_ops_settings kos
    WHERE kos.organization_id = p_org_id
    LIMIT 1
  ),
  has_explicit AS (
    SELECT EXISTS (
      SELECT 1 FROM notify_cfg WHERE cardinality(ids) > 0
    ) AS v
  )
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.staff s
  CROSS JOIN has_explicit he
  LEFT JOIN notify_cfg nc ON true
  WHERE s.organization_id = p_org_id
    AND COALESCE(s.is_active, true) = true
    AND s.deleted_at IS NULL
    AND (
      (he.v AND s.id = ANY (nc.ids))
      OR (
        NOT he.v
        AND (
          COALESCE(s.app_permissions @> '{"mutfak_operasyon": true}'::jsonb, false)
          OR public.staff_hotel_kitchen_menu_perm_ok(COALESCE(s.app_permissions, '{}'::jsonb), s.role)
          OR lower(trim(coalesce(s.department, ''))) = ANY (
            ARRAY['kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry']
          )
        )
      )
    );
$$;

COMMENT ON FUNCTION public.staff_ids_kitchen_menu_order_notify(uuid) IS
  'Dijital menü sipariş bildirimi — seçili personel veya (boşsa) mutfak departmanı.';

COMMIT;
