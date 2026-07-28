-- Partner portal: çamaşır kayıtlarının görünmesi (oturum / hotel id uyumu)

BEGIN;

-- Partner her zaman kendi oteline kilitlenir; staff org + isteğe bağlı otel filtresi.
DROP FUNCTION IF EXISTS public.breakfast_partner_laundry_ledger(int, uuid);

CREATE OR REPLACE FUNCTION public.breakfast_partner_laundry_ledger(
  p_limit int DEFAULT 60,
  p_partner_hotel_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  partner_hotel_id uuid,
  organization_id uuid,
  wash_date date,
  quantity numeric,
  unit_label text,
  unit_price_snapshot numeric,
  line_total numeric,
  guest_name text,
  room_number text,
  photo_urls text[],
  note text,
  agreement_id uuid,
  amount_remaining numeric,
  agreement_status text,
  hotel_name text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel_id uuid;
  v_org_id uuid;
  v_is_partner boolean := false;
BEGIN
  v_hotel_id := public.breakfast_partner_current_hotel_id();
  IF v_hotel_id IS NOT NULL THEN
    -- Partner: her zaman kendi oteli (istemci hotel id uyumsuzluğu yüzünden boş/exception olmasın)
    v_is_partner := true;
  ELSE
    v_org_id := public.breakfast_partner_provider_org_id();
    IF v_org_id IS NULL THEN
      RETURN;
    END IF;
    IF NOT public.staff_can_manage_partner_laundry(v_org_id)
       AND NOT public.staff_can_manage_breakfast_partners(v_org_id)
       AND NOT public.staff_can_view_breakfast_partner_board(v_org_id) THEN
      RAISE EXCEPTION 'Çamaşır kayıtlarını görüntüleme yetkiniz yok.';
    END IF;
    v_hotel_id := p_partner_hotel_id;
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.partner_hotel_id,
    e.organization_id,
    e.wash_date,
    e.quantity,
    e.unit_label,
    e.unit_price_snapshot,
    e.line_total,
    e.guest_name,
    e.room_number,
    coalesce(e.photo_urls, ARRAY[]::text[]) AS photo_urls,
    e.note,
    e.agreement_id,
    coalesce(a.amount_remaining, 0)::numeric AS amount_remaining,
    a.status AS agreement_status,
    h.name AS hotel_name,
    e.created_at,
    e.updated_at
  FROM public.breakfast_partner_laundry_entries e
  JOIN public.breakfast_partner_hotels h ON h.id = e.partner_hotel_id
  LEFT JOIN public.finance_counterparty_agreements a ON a.id = e.agreement_id AND a.is_active = true
  WHERE (
      (v_is_partner AND e.partner_hotel_id = v_hotel_id)
      OR (
        NOT v_is_partner
        AND e.organization_id = v_org_id
        AND (v_hotel_id IS NULL OR e.partner_hotel_id = v_hotel_id)
      )
    )
  ORDER BY e.wash_date DESC, e.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 60), 200));
END;
$$;

REVOKE ALL ON FUNCTION public.breakfast_partner_laundry_ledger(int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_laundry_ledger(int, uuid) TO authenticated;

-- Partner okuma politikası (tablo fallback için)
ALTER TABLE public.breakfast_partner_laundry_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "breakfast_partner_laundry_partner_read" ON public.breakfast_partner_laundry_entries;
CREATE POLICY "breakfast_partner_laundry_partner_read" ON public.breakfast_partner_laundry_entries
  FOR SELECT TO authenticated
  USING (partner_hotel_id = public.breakfast_partner_current_hotel_id());

GRANT SELECT ON public.breakfast_partner_laundry_entries TO authenticated;

-- guest/room/photo kolonları yoksa ekle (eski 557 kısmi deploy)
ALTER TABLE public.breakfast_partner_laundry_entries
  ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE public.breakfast_partner_laundry_entries
  ADD COLUMN IF NOT EXISTS room_number text;
ALTER TABLE public.breakfast_partner_laundry_entries
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

COMMIT;
