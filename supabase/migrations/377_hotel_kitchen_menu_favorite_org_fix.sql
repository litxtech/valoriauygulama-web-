-- Favori RPC, misafir organization_id NULL iken menü RLS ile aynı oteli kullanmıyordu
-- (current_guest_organization_id → Valoria fallback; toggle ham NULL ile karşılaştırıyordu).

BEGIN;

CREATE OR REPLACE FUNCTION public.toggle_hotel_kitchen_menu_favorite(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id uuid;
  v_org uuid;
  v_item_org uuid;
  v_existing uuid;
BEGIN
  v_org := public.current_guest_organization_id();

  SELECT g.id INTO v_guest_id
  FROM public.guests g
  WHERE g.auth_user_id = auth.uid()
    AND g.deleted_at IS NULL
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Misafir kaydı bulunamadı';
  END IF;

  SELECT i.organization_id INTO v_item_org
  FROM public.hotel_kitchen_menu_items i
  WHERE i.id = p_item_id AND i.is_available = true;

  IF v_item_org IS NULL OR v_item_org IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Ürün bulunamadı';
  END IF;

  SELECT f.id INTO v_existing
  FROM public.hotel_kitchen_menu_favorites f
  WHERE f.guest_id = v_guest_id AND f.item_id = p_item_id;

  IF v_existing IS NOT NULL THEN
    DELETE FROM public.hotel_kitchen_menu_favorites WHERE id = v_existing;
    RETURN jsonb_build_object('favorited', false);
  END IF;

  INSERT INTO public.hotel_kitchen_menu_favorites (guest_id, item_id)
  VALUES (v_guest_id, p_item_id);

  RETURN jsonb_build_object('favorited', true);
END;
$$;

COMMIT;
