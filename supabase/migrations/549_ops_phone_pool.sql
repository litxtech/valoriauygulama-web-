-- KBS telefon rehberi havuzu: isimli veya isimsiz numara kaydı.

BEGIN;

CREATE TABLE IF NOT EXISTS ops.phone_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  phone text NOT NULL,
  phone_digits text NOT NULL,
  display_name text,
  note text,
  created_by_auth_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_staff_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ops_phone_pool_phone_not_blank CHECK (length(btrim(phone)) > 0),
  CONSTRAINT ops_phone_pool_digits_min CHECK (length(phone_digits) >= 7),
  CONSTRAINT ops_phone_pool_hotel_digits_uidx UNIQUE (hotel_id, phone_digits)
);

CREATE INDEX IF NOT EXISTS ops_phone_pool_hotel_created_idx
  ON ops.phone_pool (hotel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ops_phone_pool_hotel_name_idx
  ON ops.phone_pool (hotel_id, lower(btrim(display_name)))
  WHERE display_name IS NOT NULL AND btrim(display_name) <> '';

DROP TRIGGER IF EXISTS trg_ops_phone_pool_updated ON ops.phone_pool;
CREATE TRIGGER trg_ops_phone_pool_updated
  BEFORE UPDATE ON ops.phone_pool
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

ALTER TABLE ops.phone_pool ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.phone_pool TO authenticated;
GRANT ALL ON ops.phone_pool TO service_role;

DROP POLICY IF EXISTS "ops_phone_pool_select" ON ops.phone_pool;
CREATE POLICY "ops_phone_pool_select" ON ops.phone_pool
  FOR SELECT TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    OR public.kbs_web_can_view_all_hotels()
  );

DROP POLICY IF EXISTS "ops_phone_pool_insert" ON ops.phone_pool;
CREATE POLICY "ops_phone_pool_insert" ON ops.phone_pool
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS "ops_phone_pool_update" ON ops.phone_pool;
CREATE POLICY "ops_phone_pool_update" ON ops.phone_pool
  FOR UPDATE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  )
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS "ops_phone_pool_delete" ON ops.phone_pool;
CREATE POLICY "ops_phone_pool_delete" ON ops.phone_pool
  FOR DELETE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

COMMENT ON TABLE ops.phone_pool IS
  'KBS telefon rehberi havuzu — isimli veya isimsiz müşteri numaraları.';

COMMIT;
