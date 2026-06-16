-- Public QR menu: cart orders + Stripe (anonymous guest checkout)

BEGIN;

CREATE TABLE IF NOT EXISTS public.kitchen_menu_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  org_slug text NOT NULL,
  guest_id uuid REFERENCES public.guests(id) ON DELETE SET NULL,
  customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) >= 2),
  customer_email text NOT NULL CHECK (char_length(btrim(customer_email)) >= 5),
  room_number text,
  table_number text,
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

CREATE INDEX IF NOT EXISTS kitchen_menu_orders_org_status_idx
  ON public.kitchen_menu_orders (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS kitchen_menu_orders_slug_idx
  ON public.kitchen_menu_orders (org_slug, created_at DESC);

CREATE OR REPLACE FUNCTION public.kitchen_menu_orders_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kitchen_menu_orders_updated_at ON public.kitchen_menu_orders;
CREATE TRIGGER trg_kitchen_menu_orders_updated_at
  BEFORE UPDATE ON public.kitchen_menu_orders
  FOR EACH ROW EXECUTE FUNCTION public.kitchen_menu_orders_set_updated_at();

CREATE TABLE IF NOT EXISTS public.kitchen_menu_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.kitchen_menu_orders(id) ON DELETE CASCADE,
  menu_item_id uuid REFERENCES public.hotel_kitchen_menu_items(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity >= 1 AND quantity <= 99) DEFAULT 1,
  unit_price numeric(12, 2) NOT NULL CHECK (unit_price >= 0),
  line_total numeric(12, 2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS kitchen_menu_order_items_order_idx
  ON public.kitchen_menu_order_items (order_id);

ALTER TABLE public.kitchen_menu_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kitchen_menu_order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kitchen_menu_orders_staff_select ON public.kitchen_menu_orders;
CREATE POLICY kitchen_menu_orders_staff_select ON public.kitchen_menu_orders
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_active, true) = true
        AND (
          s.role = 'admin'
          OR s.organization_id = kitchen_menu_orders.organization_id
        )
    )
  );

DROP POLICY IF EXISTS kitchen_menu_order_items_staff_select ON public.kitchen_menu_order_items;
CREATE POLICY kitchen_menu_order_items_staff_select ON public.kitchen_menu_order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.kitchen_menu_orders o
      JOIN public.staff s ON s.auth_id = auth.uid()
      WHERE o.id = kitchen_menu_order_items.order_id
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_active, true) = true
        AND (s.role = 'admin' OR s.organization_id = o.organization_id)
    )
  );

COMMIT;
