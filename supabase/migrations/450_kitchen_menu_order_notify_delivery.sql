-- Dijital menü siparişi: seçili personele push + teslimat konumu / otel adı

BEGIN;

ALTER TABLE public.kitchen_ops_settings
  ADD COLUMN IF NOT EXISTS menu_order_notify_staff_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.kitchen_ops_settings.menu_order_notify_staff_ids IS
  'QR menü siparişi ödendiğinde bildirim alacak mutfak personeli. Boşsa bildirim gönderilmez.';

ALTER TABLE public.kitchen_menu_orders
  ADD COLUMN IF NOT EXISTS guest_hotel_name text,
  ADD COLUMN IF NOT EXISTS delivery_lat double precision,
  ADD COLUMN IF NOT EXISTS delivery_lng double precision,
  ADD COLUMN IF NOT EXISTS delivery_address text;

CREATE OR REPLACE FUNCTION public.staff_ids_kitchen_menu_order_notify(p_org_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(DISTINCT s.id), ARRAY[]::uuid[])
  FROM public.kitchen_ops_settings kos
  JOIN public.staff s ON s.id = ANY (kos.menu_order_notify_staff_ids)
  WHERE kos.organization_id = p_org_id
    AND s.organization_id = p_org_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.staff_ids_kitchen_menu_order_notify(uuid) IS
  'Admin panelinde seçilen dijital menü sipariş bildirim alıcıları.';

COMMIT;
