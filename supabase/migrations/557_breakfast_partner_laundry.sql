-- Partner çamaşır: personel kaydı, aynı cari (finance agreement), portal okuma + PDF

BEGIN;

-- ---------- Fiyat alanları ----------
ALTER TABLE public.breakfast_partner_settings
  ADD COLUMN IF NOT EXISTS default_laundry_unit_price numeric(14, 2) NOT NULL DEFAULT 0
    CHECK (default_laundry_unit_price >= 0);

COMMENT ON COLUMN public.breakfast_partner_settings.default_laundry_unit_price IS
  'Varsayılan çamaşır birim fiyatı (TRY / Adet veya Kg).';

ALTER TABLE public.breakfast_partner_hotels
  ADD COLUMN IF NOT EXISTS laundry_unit_price numeric(14, 2)
    CHECK (laundry_unit_price IS NULL OR laundry_unit_price >= 0);

COMMENT ON COLUMN public.breakfast_partner_hotels.laundry_unit_price IS
  'Otel bazlı çamaşır birim fiyatı; null = org varsayılanı.';

-- ---------- Çamaşır kayıtları ----------
CREATE TABLE IF NOT EXISTS public.breakfast_partner_laundry_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_hotel_id uuid NOT NULL REFERENCES public.breakfast_partner_hotels(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  wash_date date NOT NULL,
  quantity numeric(14, 3) NOT NULL CHECK (quantity >= 0),
  unit_label text NOT NULL DEFAULT 'Adet',
  unit_price_snapshot numeric(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price_snapshot >= 0),
  line_total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (line_total >= 0),
  guest_name text,
  room_number text,
  photo_urls text[] NOT NULL DEFAULT '{}',
  note text,
  agreement_id uuid REFERENCES public.finance_counterparty_agreements(id) ON DELETE SET NULL,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT breakfast_partner_laundry_unit_label_not_blank CHECK (length(trim(unit_label)) > 0)
);

ALTER TABLE public.breakfast_partner_laundry_entries
  ADD COLUMN IF NOT EXISTS guest_name text;
ALTER TABLE public.breakfast_partner_laundry_entries
  ADD COLUMN IF NOT EXISTS room_number text;
ALTER TABLE public.breakfast_partner_laundry_entries
  ADD COLUMN IF NOT EXISTS photo_urls text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.breakfast_partner_laundry_entries.guest_name IS 'Misafir / kişi adı (isteğe bağlı).';
COMMENT ON COLUMN public.breakfast_partner_laundry_entries.room_number IS 'Oda numarası (isteğe bağlı).';
COMMENT ON COLUMN public.breakfast_partner_laundry_entries.photo_urls IS 'Çamaşır poşet/çanta fotoğrafları.';

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_laundry_hotel_date
  ON public.breakfast_partner_laundry_entries (partner_hotel_id, wash_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_laundry_org_date
  ON public.breakfast_partner_laundry_entries (organization_id, wash_date DESC);

CREATE INDEX IF NOT EXISTS idx_breakfast_partner_laundry_agreement
  ON public.breakfast_partner_laundry_entries (agreement_id)
  WHERE agreement_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_breakfast_partner_laundry_updated ON public.breakfast_partner_laundry_entries;
CREATE TRIGGER trg_breakfast_partner_laundry_updated
  BEFORE UPDATE ON public.breakfast_partner_laundry_entries
  FOR EACH ROW EXECUTE FUNCTION public.breakfast_partner_touch_updated_at();

-- ---------- Yetki: çamaşır yazma (admin + mutfak panosu + HK) ----------
CREATE OR REPLACE FUNCTION public.staff_can_manage_partner_laundry(p_org_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT
      s.role = 'admin'
      OR lower(coalesce(s.department, '')) IN (
        'kitchen', 'kitchen_staff', 'mutfak', 'chef', 'head_chef', 'pastry', 'restaurant',
        'housekeeping', 'hk', 'camasir', 'camasirhane', 'laundry', 'temizlik'
      )
      OR coalesce((s.app_permissions->>'mutfak_operasyon')::boolean, false)
      OR coalesce((s.app_permissions->>'yemek_listesi_mutfak_onay')::boolean, false)
      OR coalesce((s.app_permissions->>'housekeeping')::boolean, false)
      OR coalesce((s.app_permissions->>'oda_temizlik')::boolean, false)
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND coalesce(s.is_active, true) = true
      AND s.deleted_at IS NULL
      AND (p_org_id IS NULL OR s.organization_id = p_org_id)
    LIMIT 1
  ), false);
$$;

GRANT EXECUTE ON FUNCTION public.staff_can_manage_partner_laundry(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.breakfast_partner_resolve_laundry_unit_price(p_hotel_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_hotel_price numeric;
  v_default numeric;
BEGIN
  SELECT h.organization_id, h.laundry_unit_price
  INTO v_org, v_hotel_price
  FROM public.breakfast_partner_hotels h
  WHERE h.id = p_hotel_id;

  IF v_org IS NULL THEN
    RETURN 0;
  END IF;

  IF v_hotel_price IS NOT NULL AND v_hotel_price > 0 THEN
    RETURN v_hotel_price;
  END IF;

  SELECT s.default_laundry_unit_price INTO v_default
  FROM public.breakfast_partner_settings s
  WHERE s.organization_id = v_org;

  RETURN COALESCE(v_default, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_resolve_laundry_unit_price(uuid) TO authenticated;

-- ---------- Staff upsert (cari alacak) ----------
DROP FUNCTION IF EXISTS public.breakfast_partner_upsert_laundry_entry(uuid, date, numeric, text, numeric, text, uuid);
DROP FUNCTION IF EXISTS public.breakfast_partner_upsert_laundry_entry(uuid, date, numeric, text, numeric, text, uuid, text, text, text[]);

CREATE OR REPLACE FUNCTION public.breakfast_partner_upsert_laundry_entry(
  p_partner_hotel_id uuid,
  p_wash_date date,
  p_quantity numeric,
  p_unit_label text DEFAULT 'Adet',
  p_unit_price numeric DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_entry_id uuid DEFAULT NULL,
  p_guest_name text DEFAULT NULL,
  p_room_number text DEFAULT NULL,
  p_photo_urls text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_hotel record;
  v_staff_id uuid;
  v_unit_price numeric;
  v_line_total numeric;
  v_entry_id uuid;
  v_agreement_id uuid;
  v_title text;
  v_today date;
  v_unit_label text;
  v_qty numeric;
  v_guest_name text;
  v_room_number text;
  v_photo_urls text[];
  v_agreement_note text;
BEGIN
  SELECT * INTO v_hotel
  FROM public.breakfast_partner_hotels h
  WHERE h.id = p_partner_hotel_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partner otel bulunamadı.';
  END IF;

  IF NOT public.staff_can_manage_partner_laundry(v_hotel.organization_id)
     AND NOT public.staff_can_manage_breakfast_partners(v_hotel.organization_id) THEN
    RAISE EXCEPTION 'Çamaşır kaydı yetkiniz yok.';
  END IF;

  IF v_hotel.status <> 'active' THEN
    RAISE EXCEPTION 'Partner otel aktif değil.';
  END IF;

  SELECT s.id INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
    AND s.organization_id = v_hotel.organization_id
    AND coalesce(s.is_active, true) = true
    AND s.deleted_at IS NULL
  LIMIT 1;

  v_today := (timezone('Europe/Istanbul', now()))::date;
  IF p_wash_date > v_today + 1 THEN
    RAISE EXCEPTION 'İleri tarih için kayıt girilemez.';
  END IF;
  IF p_wash_date < v_today - 90 THEN
    RAISE EXCEPTION 'En fazla son 90 gün için kayıt girilebilir.';
  END IF;

  v_qty := coalesce(p_quantity, 0);
  IF v_qty < 0 THEN
    RAISE EXCEPTION 'Miktar geçersiz.';
  END IF;

  v_unit_label := coalesce(nullif(trim(p_unit_label), ''), 'Adet');
  -- Adet/Kg + poşet/çanta/makine + serbest etiket (max 24)
  IF lower(v_unit_label) IN ('adet', 'kg', 'poset', 'poşet', 'canta', 'çanta', 'makine') THEN
    IF lower(v_unit_label) IN ('kg') THEN
      v_unit_label := 'Kg';
    ELSIF lower(v_unit_label) IN ('adet') THEN
      v_unit_label := 'Adet';
    ELSIF lower(v_unit_label) IN ('poset', 'poşet') THEN
      v_unit_label := 'Poşet';
    ELSIF lower(v_unit_label) IN ('canta', 'çanta') THEN
      v_unit_label := 'Çanta';
    ELSE
      v_unit_label := 'Makine';
    END IF;
  ELSE
    v_unit_label := left(v_unit_label, 24);
  END IF;

  IF p_unit_price IS NOT NULL AND p_unit_price > 0 THEN
    v_unit_price := p_unit_price;
  ELSE
    v_unit_price := public.breakfast_partner_resolve_laundry_unit_price(p_partner_hotel_id);
  END IF;

  IF v_qty > 0 AND coalesce(v_unit_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Çamaşır birim fiyatı tanımlı değil.';
  END IF;

  v_guest_name := left(nullif(trim(coalesce(p_guest_name, '')), ''), 120);
  v_room_number := left(nullif(trim(coalesce(p_room_number, '')), ''), 32);
  v_photo_urls := coalesce(
    (
      SELECT array_agg(u ORDER BY ord)
      FROM (
        SELECT trim(x) AS u, ord
        FROM unnest(coalesce(p_photo_urls, ARRAY[]::text[])) WITH ORDINALITY AS t(x, ord)
        WHERE length(trim(x)) > 8
        LIMIT 6
      ) s
    ),
    ARRAY[]::text[]
  );

  v_line_total := round(v_qty * coalesce(v_unit_price, 0), 2);
  v_title := 'Çamaşır ' || to_char(p_wash_date, 'DD.MM.YYYY') || ' — '
    || trim(to_char(v_qty, 'FM999999990.###')) || ' ' || v_unit_label;
  IF v_room_number IS NOT NULL THEN
    v_title := v_title || ' · Oda ' || v_room_number;
  END IF;
  IF v_guest_name IS NOT NULL THEN
    v_title := v_title || ' · ' || v_guest_name;
  END IF;

  v_agreement_note := nullif(
    trim(concat_ws(
      ' · ',
      CASE WHEN v_guest_name IS NOT NULL THEN 'Kişi: ' || v_guest_name ELSE NULL END,
      CASE WHEN v_room_number IS NOT NULL THEN 'Oda: ' || v_room_number ELSE NULL END,
      nullif(trim(coalesce(p_note, '')), '')
    )),
    ''
  );

  IF p_entry_id IS NOT NULL THEN
    SELECT e.id, e.agreement_id
    INTO v_entry_id, v_agreement_id
    FROM public.breakfast_partner_laundry_entries e
    WHERE e.id = p_entry_id
      AND e.partner_hotel_id = p_partner_hotel_id;

    IF v_entry_id IS NULL THEN
      RAISE EXCEPTION 'Çamaşır kaydı bulunamadı.';
    END IF;

    UPDATE public.breakfast_partner_laundry_entries
    SET
      wash_date = p_wash_date,
      quantity = v_qty,
      unit_label = v_unit_label,
      unit_price_snapshot = coalesce(v_unit_price, 0),
      line_total = v_line_total,
      guest_name = v_guest_name,
      room_number = v_room_number,
      photo_urls = v_photo_urls,
      note = nullif(trim(coalesce(p_note, '')), ''),
      updated_by_auth_id = auth.uid()
    WHERE id = v_entry_id;
  ELSE
    INSERT INTO public.breakfast_partner_laundry_entries (
      partner_hotel_id, organization_id, wash_date, quantity, unit_label,
      unit_price_snapshot, line_total, guest_name, room_number, photo_urls, note,
      created_by_staff_id, created_by_auth_id, updated_by_auth_id
    )
    VALUES (
      p_partner_hotel_id, v_hotel.organization_id, p_wash_date, v_qty, v_unit_label,
      coalesce(v_unit_price, 0), v_line_total, v_guest_name, v_room_number, v_photo_urls,
      nullif(trim(coalesce(p_note, '')), ''),
      v_staff_id, auth.uid(), auth.uid()
    )
    RETURNING id, agreement_id INTO v_entry_id, v_agreement_id;
  END IF;

  IF v_qty <= 0 OR v_line_total <= 0 THEN
    IF v_agreement_id IS NOT NULL THEN
      UPDATE public.finance_counterparty_agreements
      SET status = 'cancelled', is_active = false, updated_at = now()
      WHERE id = v_agreement_id;
      UPDATE public.breakfast_partner_laundry_entries
      SET agreement_id = NULL WHERE id = v_entry_id;
    END IF;
    RETURN v_entry_id;
  END IF;

  IF v_agreement_id IS NULL THEN
    INSERT INTO public.finance_counterparty_agreements (
      organization_id, counterparty_id, title, target_amount,
      started_on, notes, movement_kind, is_active, status
    )
    VALUES (
      v_hotel.organization_id, v_hotel.counterparty_id, v_title, v_line_total,
      p_wash_date, v_agreement_note, 'income', true, 'open'
    )
    RETURNING id INTO v_agreement_id;

    UPDATE public.breakfast_partner_laundry_entries
    SET agreement_id = v_agreement_id
    WHERE id = v_entry_id;
  ELSE
    UPDATE public.finance_counterparty_agreements
    SET
      title = v_title,
      target_amount = v_line_total,
      started_on = p_wash_date,
      notes = v_agreement_note,
      status = CASE WHEN status = 'cancelled' THEN 'open' ELSE status END,
      is_active = true,
      updated_at = now()
    WHERE id = v_agreement_id;

    PERFORM public.finance_agreement_recalc(v_agreement_id);
  END IF;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.breakfast_partner_upsert_laundry_entry(uuid, date, numeric, text, numeric, text, uuid, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.breakfast_partner_upsert_laundry_entry(uuid, date, numeric, text, numeric, text, uuid, text, text, text[]) TO authenticated;

-- ---------- Ledger (partner veya staff) ----------
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
    -- Partner: her zaman kendi oteli
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

-- ---------- Partner bildirimi (yeni / güncellenen çamaşır) ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_notify_laundry_after_save()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel record;
  v_title text;
  v_body text;
  v_date_label text;
  v_payload jsonb;
  v_push_url text := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/send-expo-push';
  v_partner_user_ids uuid[];
BEGIN
  IF NEW.quantity IS NULL OR NEW.quantity <= 0 OR coalesce(NEW.line_total, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND NEW.line_total IS NOT DISTINCT FROM OLD.line_total
     AND NEW.wash_date IS NOT DISTINCT FROM OLD.wash_date THEN
    RETURN NEW;
  END IF;

  SELECT h.id, h.name, h.organization_id
  INTO v_hotel
  FROM public.breakfast_partner_hotels h
  WHERE h.id = NEW.partner_hotel_id;

  IF v_hotel.id IS NULL THEN
    RETURN NEW;
  END IF;

  v_date_label := to_char(NEW.wash_date, 'DD.MM.YYYY');
  v_title := 'Çamaşır kaydı — ' || v_hotel.name;
  v_body := v_date_label || ': '
    || trim(to_char(NEW.quantity, 'FM999999990.###')) || ' ' || NEW.unit_label
    || ' · ' || to_char(NEW.line_total, 'FM999G999G990D00') || ' ₺';
  IF NEW.room_number IS NOT NULL AND length(trim(NEW.room_number)) > 0 THEN
    v_body := v_body || ' · Oda ' || trim(NEW.room_number);
  END IF;
  IF NEW.guest_name IS NOT NULL AND length(trim(NEW.guest_name)) > 0 THEN
    v_body := v_body || ' · ' || left(trim(NEW.guest_name), 60);
  END IF;
  IF NEW.note IS NOT NULL AND length(trim(NEW.note)) > 0 THEN
    v_body := v_body || ' · ' || left(trim(NEW.note), 80);
  END IF;

  v_payload := jsonb_build_object(
    'notificationType', 'breakfast_partner_laundry',
    'screen', '/partner/(tabs)/history',
    'url', '/partner/(tabs)/history',
    'washDate', NEW.wash_date::text,
    'quantity', NEW.quantity,
    'unitLabel', NEW.unit_label,
    'lineTotal', NEW.line_total,
    'hotelName', v_hotel.name,
    'partnerHotelId', v_hotel.id::text,
    'entryId', NEW.id::text
  );

  PERFORM public.breakfast_partner_insert_notifications(
    v_hotel.id,
    'breakfast_partner_laundry',
    v_title,
    v_body,
    v_payload
  );

  SELECT coalesce(array_agg(u.id), ARRAY[]::uuid[])
  INTO v_partner_user_ids
  FROM public.breakfast_partner_users u
  WHERE u.partner_hotel_id = v_hotel.id AND u.is_active = true;

  IF v_partner_user_ids IS NOT NULL AND array_length(v_partner_user_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := v_push_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'partnerUserIds', to_jsonb(v_partner_user_ids),
        'title', v_title,
        'body', left(v_body, 240),
        'data', v_payload
      ),
      timeout_milliseconds := 15000
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_breakfast_partner_laundry_notify ON public.breakfast_partner_laundry_entries;
CREATE TRIGGER trg_breakfast_partner_laundry_notify
  AFTER INSERT OR UPDATE ON public.breakfast_partner_laundry_entries
  FOR EACH ROW EXECUTE FUNCTION public.breakfast_partner_notify_laundry_after_save();

-- ---------- Account snapshot: çamaşır özeti ekle ----------
CREATE OR REPLACE FUNCTION public.breakfast_partner_portal_account_snapshot(p_payment_limit integer DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hotel_id uuid;
  v_counterparty_id uuid;
  v_open_balance numeric;
  v_month_start date;
  v_month_guests bigint;
  v_month_amount numeric;
  v_lifetime_total numeric;
  v_month_laundry_qty numeric;
  v_month_laundry_amount numeric;
  v_lifetime_laundry_total numeric;
  v_payments jsonb;
BEGIN
  v_hotel_id := public.breakfast_partner_user_hotel_id();
  IF v_hotel_id IS NULL THEN
    RETURN jsonb_build_object(
      'openBalance', 0,
      'monthGuestTotal', 0,
      'monthAmountTotal', 0,
      'lifetimeTotal', 0,
      'monthLaundryQty', 0,
      'monthLaundryAmount', 0,
      'lifetimeLaundryTotal', 0,
      'payments', '[]'::jsonb
    );
  END IF;

  SELECT h.counterparty_id INTO v_counterparty_id
  FROM public.breakfast_partner_hotels h
  WHERE h.id = v_hotel_id;

  IF v_counterparty_id IS NULL THEN
    v_open_balance := 0;
  ELSE
    SELECT coalesce(sum(a.amount_remaining), 0)
    INTO v_open_balance
    FROM public.finance_counterparty_agreements a
    WHERE a.counterparty_id = v_counterparty_id
      AND a.movement_kind = 'income'
      AND a.status IN ('open', 'partial')
      AND a.is_active = true;
  END IF;

  v_month_start := date_trunc('month', current_date)::date;

  SELECT
    coalesce(sum(e.guest_count), 0),
    coalesce(sum(e.line_total), 0)
  INTO v_month_guests, v_month_amount
  FROM public.breakfast_partner_daily_entries e
  WHERE e.partner_hotel_id = v_hotel_id
    AND e.record_date >= v_month_start;

  SELECT coalesce(sum(e.line_total), 0)
  INTO v_lifetime_total
  FROM public.breakfast_partner_daily_entries e
  WHERE e.partner_hotel_id = v_hotel_id;

  SELECT
    coalesce(sum(l.quantity), 0),
    coalesce(sum(l.line_total), 0)
  INTO v_month_laundry_qty, v_month_laundry_amount
  FROM public.breakfast_partner_laundry_entries l
  WHERE l.partner_hotel_id = v_hotel_id
    AND l.wash_date >= v_month_start;

  SELECT coalesce(sum(l.line_total), 0)
  INTO v_lifetime_laundry_total
  FROM public.breakfast_partner_laundry_entries l
  WHERE l.partner_hotel_id = v_hotel_id;

  IF v_counterparty_id IS NULL THEN
    v_payments := '[]'::jsonb;
  ELSE
    SELECT coalesce(jsonb_agg(row_data ORDER BY movement_date DESC, created_at DESC), '[]'::jsonb)
    INTO v_payments
    FROM (
      SELECT jsonb_build_object(
        'id', m.id,
        'amount', m.amount,
        'movementDate', m.movement_date,
        'description', m.description,
        'paymentMethod', m.payment_method,
        'createdAt', m.created_at
      ) AS row_data,
      m.movement_date,
      m.created_at
      FROM public.finance_movements m
      WHERE m.counterparty_id = v_counterparty_id
        AND m.kind = 'income'
      ORDER BY m.movement_date DESC, m.created_at DESC
      LIMIT greatest(1, least(coalesce(p_payment_limit, 40), 100))
    ) sub;
  END IF;

  RETURN jsonb_build_object(
    'openBalance', coalesce(v_open_balance, 0),
    'monthGuestTotal', coalesce(v_month_guests, 0),
    'monthAmountTotal', coalesce(v_month_amount, 0),
    'lifetimeTotal', coalesce(v_lifetime_total, 0),
    'monthLaundryQty', coalesce(v_month_laundry_qty, 0),
    'monthLaundryAmount', coalesce(v_month_laundry_amount, 0),
    'lifetimeLaundryTotal', coalesce(v_lifetime_laundry_total, 0),
    'payments', coalesce(v_payments, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_portal_account_snapshot(integer) TO authenticated;

-- ---------- RLS ----------
ALTER TABLE public.breakfast_partner_laundry_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "breakfast_partner_laundry_staff" ON public.breakfast_partner_laundry_entries;
CREATE POLICY "breakfast_partner_laundry_staff" ON public.breakfast_partner_laundry_entries
  FOR ALL TO authenticated
  USING (
    public.staff_can_manage_partner_laundry(organization_id)
    OR public.staff_can_manage_breakfast_partners(organization_id)
    OR public.staff_can_view_breakfast_partner_board(organization_id)
  )
  WITH CHECK (
    public.staff_can_manage_partner_laundry(organization_id)
    OR public.staff_can_manage_breakfast_partners(organization_id)
  );

DROP POLICY IF EXISTS "breakfast_partner_laundry_partner_read" ON public.breakfast_partner_laundry_entries;
CREATE POLICY "breakfast_partner_laundry_partner_read" ON public.breakfast_partner_laundry_entries
  FOR SELECT TO authenticated
  USING (partner_hotel_id = public.breakfast_partner_current_hotel_id());

GRANT SELECT ON public.breakfast_partner_laundry_entries TO authenticated;

COMMIT;
