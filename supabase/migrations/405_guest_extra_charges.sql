-- Misafir ekstra ücretlendirme: admin kataloğu (battaniye, su vb.) + Stripe ödeme

BEGIN;

CREATE TABLE IF NOT EXISTS public.hotel_extra_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) >= 2),
  description text,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  currency text NOT NULL DEFAULT 'try',
  category text NOT NULL DEFAULT 'amenity' CHECK (
    category IN ('amenity', 'beverage', 'minibar', 'laundry', 'other')
  ),
  sort_order integer NOT NULL DEFAULT 0,
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hotel_extra_catalog_org_idx
  ON public.hotel_extra_catalog (organization_id, sort_order, name);

CREATE OR REPLACE FUNCTION public.hotel_extra_catalog_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_hotel_extra_catalog_updated_at ON public.hotel_extra_catalog;
CREATE TRIGGER trg_hotel_extra_catalog_updated_at
  BEFORE UPDATE ON public.hotel_extra_catalog
  FOR EACH ROW EXECUTE FUNCTION public.hotel_extra_catalog_set_updated_at();

CREATE TABLE IF NOT EXISTS public.guest_extra_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_number text,
  status text NOT NULL DEFAULT 'pending_payment' CHECK (
    status IN ('pending_payment', 'paid', 'cancelled', 'expired')
  ),
  total_amount numeric(12, 2) NOT NULL CHECK (total_amount > 0),
  currency text NOT NULL DEFAULT 'try',
  payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE SET NULL,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_extra_orders_guest_idx
  ON public.guest_extra_orders (guest_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_extra_orders_org_status_idx
  ON public.guest_extra_orders (organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.guest_extra_orders_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_extra_orders_updated_at ON public.guest_extra_orders;
CREATE TRIGGER trg_guest_extra_orders_updated_at
  BEFORE UPDATE ON public.guest_extra_orders
  FOR EACH ROW EXECUTE FUNCTION public.guest_extra_orders_set_updated_at();

CREATE OR REPLACE FUNCTION public.guest_extra_orders_fill_from_guest()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_room uuid;
  v_room_no text;
BEGIN
  IF NEW.organization_id IS NULL OR NEW.room_id IS NULL OR NEW.room_number IS NULL THEN
    SELECT g.organization_id, g.room_id, r.room_number::text
    INTO v_org, v_room, v_room_no
    FROM public.guests g
    LEFT JOIN public.rooms r ON r.id = g.room_id
    WHERE g.id = NEW.guest_id;
    NEW.organization_id := COALESCE(NEW.organization_id, v_org);
    NEW.room_id := COALESCE(NEW.room_id, v_room);
    NEW.room_number := COALESCE(NEW.room_number, v_room_no);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_extra_orders_fill_guest ON public.guest_extra_orders;
CREATE TRIGGER trg_guest_extra_orders_fill_guest
  BEFORE INSERT ON public.guest_extra_orders
  FOR EACH ROW EXECUTE FUNCTION public.guest_extra_orders_fill_from_guest();

CREATE TABLE IF NOT EXISTS public.guest_extra_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.guest_extra_orders(id) ON DELETE CASCADE,
  catalog_item_id uuid REFERENCES public.hotel_extra_catalog(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 1) DEFAULT 1,
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12, 2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_extra_order_items_order_idx
  ON public.guest_extra_order_items (order_id);

ALTER TABLE public.hotel_extra_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_extra_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_extra_order_items ENABLE ROW LEVEL SECURITY;

-- Katalog: misafir kendi otelindeki aktif ürünleri görür
DROP POLICY IF EXISTS hotel_extra_catalog_guest_read ON public.hotel_extra_catalog;
CREATE POLICY hotel_extra_catalog_guest_read ON public.hotel_extra_catalog
  FOR SELECT TO authenticated
  USING (
    is_available = true
    AND organization_id IN (
      SELECT g.organization_id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL AND g.organization_id IS NOT NULL
    )
  );

DROP POLICY IF EXISTS hotel_extra_catalog_staff_read ON public.hotel_extra_catalog;
CREATE POLICY hotel_extra_catalog_staff_read ON public.hotel_extra_catalog
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_active, true) = true
        AND (s.role = 'admin' OR s.organization_id = hotel_extra_catalog.organization_id)
    )
  );

DROP POLICY IF EXISTS hotel_extra_catalog_admin_write ON public.hotel_extra_catalog;
CREATE POLICY hotel_extra_catalog_admin_write ON public.hotel_extra_catalog
  FOR ALL TO authenticated
  USING (public.current_user_is_staff_admin())
  WITH CHECK (public.current_user_is_staff_admin());

-- Siparişler
DROP POLICY IF EXISTS guest_extra_orders_guest_select ON public.guest_extra_orders;
CREATE POLICY guest_extra_orders_guest_select ON public.guest_extra_orders
  FOR SELECT TO authenticated
  USING (
    guest_id IN (
      SELECT g.id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS guest_extra_orders_staff_select ON public.guest_extra_orders;
CREATE POLICY guest_extra_orders_staff_select ON public.guest_extra_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_active, true) = true
        AND (s.role = 'admin' OR s.organization_id = guest_extra_orders.organization_id)
    )
  );

DROP POLICY IF EXISTS guest_extra_order_items_guest_select ON public.guest_extra_order_items;
CREATE POLICY guest_extra_order_items_guest_select ON public.guest_extra_order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM public.guest_extra_orders o
      JOIN public.guests g ON g.id = o.guest_id
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS guest_extra_order_items_staff_select ON public.guest_extra_order_items;
CREATE POLICY guest_extra_order_items_staff_select ON public.guest_extra_order_items
  FOR SELECT TO authenticated
  USING (
    order_id IN (
      SELECT o.id FROM public.guest_extra_orders o
      WHERE EXISTS (
        SELECT 1 FROM public.staff s
        WHERE s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
          AND COALESCE(s.is_active, true) = true
          AND (s.role = 'admin' OR s.organization_id = o.organization_id)
      )
    )
  );

GRANT SELECT ON public.hotel_extra_catalog TO authenticated;
GRANT SELECT ON public.guest_extra_orders TO authenticated;
GRANT SELECT ON public.guest_extra_order_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.hotel_extra_catalog TO authenticated;

-- Realtime: admin katalog değişince misafir ekranı güncellenir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'hotel_extra_catalog'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.hotel_extra_catalog;
  END IF;
END $$;

COMMENT ON TABLE public.hotel_extra_catalog IS 'Otel ekstra ücret kataloğu (battaniye, su vb.) — admin yönetir, misafir anlık görür.';
COMMENT ON TABLE public.guest_extra_orders IS 'Misafir ekstra ürün siparişi + Stripe ödeme bağlantısı.';

COMMIT;
