-- OPS schema: Official check-in / check-out operations (KBS-ready)
-- This migration intentionally creates a separate schema ("ops") to avoid conflicts with existing public.rooms/public.guests tables.
-- Production rules: strict hotel scoping, RLS mandatory, granular permissions, encrypted credentials only.

BEGIN;

-- ========== SCHEMA ==========
CREATE SCHEMA IF NOT EXISTS ops;

-- ========== TABLES ==========

CREATE TABLE IF NOT EXISTS ops.hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ops_hotels_code_uidx ON ops.hotels(code);

CREATE TABLE IF NOT EXISTS ops.app_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  full_name text,
  role text NOT NULL CHECK (role IN ('admin','manager','receptionist','accountant')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_app_users_hotel_id_idx ON ops.app_users(hotel_id);
CREATE INDEX IF NOT EXISTS ops_app_users_role_idx ON ops.app_users(role);

CREATE TABLE IF NOT EXISTS ops.rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  room_number text NOT NULL,
  floor text,
  capacity int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, room_number)
);
CREATE INDEX IF NOT EXISTS ops_rooms_hotel_id_idx ON ops.rooms(hotel_id);

CREATE TABLE IF NOT EXISTS ops.arrival_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  title text NOT NULL,
  reservation_code text,
  notes text,
  total_guest_count int,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','completed','cancelled')),
  created_by uuid REFERENCES ops.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_arrival_groups_hotel_id_idx ON ops.arrival_groups(hotel_id);
CREATE INDEX IF NOT EXISTS ops_arrival_groups_status_idx ON ops.arrival_groups(status);

CREATE TABLE IF NOT EXISTS ops.guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  arrival_group_id uuid REFERENCES ops.arrival_groups(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  first_name text,
  last_name text,
  middle_name text,
  nationality_code text,
  gender text,
  birth_date date,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_guests_hotel_id_idx ON ops.guests(hotel_id);
CREATE INDEX IF NOT EXISTS ops_guests_arrival_group_id_idx ON ops.guests(arrival_group_id);

CREATE TABLE IF NOT EXISTS ops.guest_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES ops.guests(id) ON DELETE CASCADE,
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('passport','id_card','residence_permit','other')),
  document_number text,
  issuing_country_code text,
  nationality_code text,
  expiry_date date,
  raw_mrz text,
  parsed_payload jsonb,
  scan_confidence numeric,
  scan_status text NOT NULL DEFAULT 'draft' CHECK (scan_status IN ('draft','scanned','incomplete','ready_to_submit','submitted','checkout_pending','checked_out','failed')),
  image_thumb_path text,
  image_full_path text,
  submitted_at timestamptz,
  checked_out_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_guest_documents_hotel_id_idx ON ops.guest_documents(hotel_id);
CREATE INDEX IF NOT EXISTS ops_guest_documents_guest_id_idx ON ops.guest_documents(guest_id);
CREATE INDEX IF NOT EXISTS ops_guest_documents_scan_status_idx ON ops.guest_documents(scan_status);
CREATE INDEX IF NOT EXISTS ops_guest_documents_document_number_idx ON ops.guest_documents(document_number);

CREATE TABLE IF NOT EXISTS ops.stay_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL REFERENCES ops.guests(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES ops.rooms(id) ON DELETE RESTRICT,
  arrival_group_id uuid REFERENCES ops.arrival_groups(id) ON DELETE SET NULL,
  check_in_at timestamptz NOT NULL DEFAULT now(),
  check_out_at timestamptz,
  stay_status text NOT NULL DEFAULT 'assigned' CHECK (stay_status IN ('assigned','checked_in','checkout_pending','checked_out','cancelled')),
  created_by uuid REFERENCES ops.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_stay_assignments_room_id_idx ON ops.stay_assignments(room_id);
CREATE INDEX IF NOT EXISTS ops_stay_assignments_guest_id_idx ON ops.stay_assignments(guest_id);
CREATE INDEX IF NOT EXISTS ops_stay_assignments_status_idx ON ops.stay_assignments(stay_status);

CREATE TABLE IF NOT EXISTS ops.official_submission_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  guest_id uuid NOT NULL REFERENCES ops.guests(id) ON DELETE RESTRICT,
  guest_document_id uuid NOT NULL REFERENCES ops.guest_documents(id) ON DELETE RESTRICT,
  stay_assignment_id uuid REFERENCES ops.stay_assignments(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('check_in','check_out','update')),
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','processing','submitted','failed','retrying','cancelled')),
  idempotency_key text,
  request_payload jsonb,
  response_payload jsonb,
  retry_count int NOT NULL DEFAULT 0,
  external_reference text,
  error_message text,
  created_by uuid REFERENCES ops.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);
CREATE INDEX IF NOT EXISTS ops_official_tx_hotel_created_idx ON ops.official_submission_transactions(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ops_official_tx_status_idx ON ops.official_submission_transactions(status, transaction_type);
CREATE UNIQUE INDEX IF NOT EXISTS ops_official_tx_idempotency_uidx
  ON ops.official_submission_transactions(hotel_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND btrim(idempotency_key) <> '';

CREATE TABLE IF NOT EXISTS ops.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  actor_user_id uuid REFERENCES ops.app_users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ops_audit_logs_hotel_created_idx ON ops.audit_logs(hotel_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ops_audit_logs_actor_user_idx ON ops.audit_logs(actor_user_id);

CREATE TABLE IF NOT EXISTS ops.hotel_kbs_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL UNIQUE REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  facility_code text NOT NULL,
  username text NOT NULL,
  password_encrypted text NOT NULL,
  api_key_encrypted text,
  provider_type text NOT NULL DEFAULT 'default',
  is_active boolean NOT NULL DEFAULT true,
  last_updated_by uuid REFERENCES ops.app_users(id) ON DELETE SET NULL,
  last_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.app_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES ops.app_users(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES ops.app_permissions(code) ON DELETE RESTRICT,
  is_allowed boolean NOT NULL DEFAULT true,
  assigned_by uuid REFERENCES ops.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(hotel_id, user_id, permission_code)
);
CREATE INDEX IF NOT EXISTS ops_user_permissions_user_idx ON ops.user_permissions(user_id);
CREATE INDEX IF NOT EXISTS ops_user_permissions_hotel_idx ON ops.user_permissions(hotel_id);

CREATE TABLE IF NOT EXISTS ops.hotel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL UNIQUE REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  submit_mode text NOT NULL DEFAULT 'manual' CHECK (submit_mode IN ('manual','auto_after_room_assign','bulk_first')),
  enable_full_image_storage boolean NOT NULL DEFAULT false,
  enable_serial_scan_mode boolean NOT NULL DEFAULT true,
  enable_realtime_room_updates boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ========== HELPERS (AUTH CONTEXT + PERMISSIONS) ==========
CREATE OR REPLACE FUNCTION ops.current_hotel_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT au.hotel_id
  FROM ops.app_users au
  WHERE au.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION ops.current_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT au.role
  FROM ops.app_users au
  WHERE au.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION ops.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT ops.current_role() = 'admin'
$$;

CREATE OR REPLACE FUNCTION ops.has_permission(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    CASE
      WHEN ops.is_admin() THEN true
      ELSE EXISTS (
        SELECT 1
        FROM ops.user_permissions up
        WHERE up.hotel_id = ops.current_hotel_id()
          AND up.user_id = auth.uid()
          AND up.permission_code = p_code
          AND up.is_allowed = true
      )
    END
$$;

-- ========== UPDATED_AT TRIGGERS ==========
CREATE OR REPLACE FUNCTION ops.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ops_arrival_groups_updated ON ops.arrival_groups;
CREATE TRIGGER trg_ops_arrival_groups_updated BEFORE UPDATE ON ops.arrival_groups
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ops_guests_updated ON ops.guests;
CREATE TRIGGER trg_ops_guests_updated BEFORE UPDATE ON ops.guests
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ops_guest_documents_updated ON ops.guest_documents;
CREATE TRIGGER trg_ops_guest_documents_updated BEFORE UPDATE ON ops.guest_documents
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ops_stay_assignments_updated ON ops.stay_assignments;
CREATE TRIGGER trg_ops_stay_assignments_updated BEFORE UPDATE ON ops.stay_assignments
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ops_official_tx_updated ON ops.official_submission_transactions;
CREATE TRIGGER trg_ops_official_tx_updated BEFORE UPDATE ON ops.official_submission_transactions
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ops_hotel_kbs_credentials_updated ON ops.hotel_kbs_credentials;
CREATE TRIGGER trg_ops_hotel_kbs_credentials_updated BEFORE UPDATE ON ops.hotel_kbs_credentials
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ops_user_permissions_updated ON ops.user_permissions;
CREATE TRIGGER trg_ops_user_permissions_updated BEFORE UPDATE ON ops.user_permissions
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

DROP TRIGGER IF EXISTS trg_ops_hotel_settings_updated ON ops.hotel_settings;
CREATE TRIGGER trg_ops_hotel_settings_updated BEFORE UPDATE ON ops.hotel_settings
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

-- ========== RLS ENABLE ==========
ALTER TABLE ops.hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.arrival_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.guest_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.stay_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.official_submission_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.hotel_kbs_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.app_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.hotel_settings ENABLE ROW LEVEL SECURITY;

-- ========== RLS POLICIES ==========

-- Hotels: user sees only own hotel
DROP POLICY IF EXISTS "ops_hotels_select_own" ON ops.hotels;
CREATE POLICY "ops_hotels_select_own" ON ops.hotels
  FOR SELECT TO authenticated
  USING (id = ops.current_hotel_id());

-- app_users: self read; admin reads same-hotel users
DROP POLICY IF EXISTS "ops_app_users_select_own" ON ops.app_users;
CREATE POLICY "ops_app_users_select_own" ON ops.app_users
  FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "ops_app_users_select_admin_hotel" ON ops.app_users;
CREATE POLICY "ops_app_users_select_admin_hotel" ON ops.app_users
  FOR SELECT TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- rooms: read same hotel; write admin-only
DROP POLICY IF EXISTS "ops_rooms_select" ON ops.rooms;
CREATE POLICY "ops_rooms_select" ON ops.rooms
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_rooms_admin_write" ON ops.rooms;
CREATE POLICY "ops_rooms_admin_write" ON ops.rooms
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- arrival_groups: read same hotel; write any authenticated in same hotel
DROP POLICY IF EXISTS "ops_arrival_groups_select" ON ops.arrival_groups;
CREATE POLICY "ops_arrival_groups_select" ON ops.arrival_groups
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_arrival_groups_insert" ON ops.arrival_groups;
CREATE POLICY "ops_arrival_groups_insert" ON ops.arrival_groups
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS "ops_arrival_groups_update" ON ops.arrival_groups;
CREATE POLICY "ops_arrival_groups_update" ON ops.arrival_groups
  FOR UPDATE TO authenticated
  USING (hotel_id = ops.current_hotel_id())
  WITH CHECK (hotel_id = ops.current_hotel_id());

-- guests
DROP POLICY IF EXISTS "ops_guests_select" ON ops.guests;
CREATE POLICY "ops_guests_select" ON ops.guests
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_guests_insert" ON ops.guests;
CREATE POLICY "ops_guests_insert" ON ops.guests
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_guests_update" ON ops.guests;
CREATE POLICY "ops_guests_update" ON ops.guests
  FOR UPDATE TO authenticated
  USING (hotel_id = ops.current_hotel_id())
  WITH CHECK (hotel_id = ops.current_hotel_id());

-- guest_documents
DROP POLICY IF EXISTS "ops_guest_documents_select" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_select" ON ops.guest_documents
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_guest_documents_insert" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_insert" ON ops.guest_documents
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_guest_documents_update" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_update" ON ops.guest_documents
  FOR UPDATE TO authenticated
  USING (hotel_id = ops.current_hotel_id())
  WITH CHECK (hotel_id = ops.current_hotel_id());

-- stay_assignments
DROP POLICY IF EXISTS "ops_stay_assignments_select" ON ops.stay_assignments;
CREATE POLICY "ops_stay_assignments_select" ON ops.stay_assignments
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_stay_assignments_insert" ON ops.stay_assignments;
CREATE POLICY "ops_stay_assignments_insert" ON ops.stay_assignments
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS "ops_stay_assignments_update" ON ops.stay_assignments;
CREATE POLICY "ops_stay_assignments_update" ON ops.stay_assignments
  FOR UPDATE TO authenticated
  USING (hotel_id = ops.current_hotel_id())
  WITH CHECK (hotel_id = ops.current_hotel_id());

-- transactions: view requires permission; write allowed for authenticated in hotel (service-role preferred)
DROP POLICY IF EXISTS "ops_official_tx_select" ON ops.official_submission_transactions;
CREATE POLICY "ops_official_tx_select" ON ops.official_submission_transactions
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id() AND ops.has_permission('kbs.view.transactions'));

DROP POLICY IF EXISTS "ops_official_tx_insert" ON ops.official_submission_transactions;
CREATE POLICY "ops_official_tx_insert" ON ops.official_submission_transactions
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_official_tx_update" ON ops.official_submission_transactions;
CREATE POLICY "ops_official_tx_update" ON ops.official_submission_transactions
  FOR UPDATE TO authenticated
  USING (hotel_id = ops.current_hotel_id())
  WITH CHECK (hotel_id = ops.current_hotel_id());

-- audit logs: select requires permission; insert hotel scoped
DROP POLICY IF EXISTS "ops_audit_logs_select" ON ops.audit_logs;
CREATE POLICY "ops_audit_logs_select" ON ops.audit_logs
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id() AND ops.has_permission('kbs.view.transactions'));

DROP POLICY IF EXISTS "ops_audit_logs_insert" ON ops.audit_logs;
CREATE POLICY "ops_audit_logs_insert" ON ops.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (hotel_id = ops.current_hotel_id());

-- credentials: admin only
DROP POLICY IF EXISTS "ops_kbs_credentials_admin_select" ON ops.hotel_kbs_credentials;
CREATE POLICY "ops_kbs_credentials_admin_select" ON ops.hotel_kbs_credentials
  FOR SELECT TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_kbs_credentials_admin_write" ON ops.hotel_kbs_credentials;
CREATE POLICY "ops_kbs_credentials_admin_write" ON ops.hotel_kbs_credentials
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- permission catalog: readable
DROP POLICY IF EXISTS "ops_app_permissions_select" ON ops.app_permissions;
CREATE POLICY "ops_app_permissions_select" ON ops.app_permissions
  FOR SELECT TO authenticated
  USING (true);

-- user permissions: self read; admin manage
DROP POLICY IF EXISTS "ops_user_permissions_select_own" ON ops.user_permissions;
CREATE POLICY "ops_user_permissions_select_own" ON ops.user_permissions
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id() AND user_id = auth.uid());

DROP POLICY IF EXISTS "ops_user_permissions_admin_manage" ON ops.user_permissions;
CREATE POLICY "ops_user_permissions_admin_manage" ON ops.user_permissions
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- hotel settings: readable; admin write
DROP POLICY IF EXISTS "ops_hotel_settings_select" ON ops.hotel_settings;
CREATE POLICY "ops_hotel_settings_select" ON ops.hotel_settings
  FOR SELECT TO authenticated
  USING (hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_hotel_settings_admin_write" ON ops.hotel_settings;
CREATE POLICY "ops_hotel_settings_admin_write" ON ops.hotel_settings
  FOR ALL TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id())
  WITH CHECK (ops.is_admin() AND hotel_id = ops.current_hotel_id());

-- ========== SEED: permissions catalog ==========
INSERT INTO ops.app_permissions (code, name, description)
VALUES
  ('kbs.credentials.view', 'KBS credentials view', 'View KBS facility/user (no plaintext secrets)'),
  ('kbs.credentials.edit', 'KBS credentials edit', 'Edit KBS credentials (encrypted at rest)'),
  ('kbs.connection.test', 'KBS connection test', 'Test KBS connection via gateway'),
  ('kbs.submit.single', 'Submit single', 'Submit official check-in for one document'),
  ('kbs.submit.bulk', 'Submit bulk', 'Submit official check-in for many documents'),
  ('kbs.checkout.single', 'Checkout single', 'Submit official check-out for one stay'),
  ('kbs.checkout.bulk', 'Checkout bulk', 'Submit official check-out for many stays'),
  ('kbs.checkout.by_room', 'Checkout by room', 'Submit official check-out by room'),
  ('kbs.retry.failed', 'Retry failed', 'Retry failed official transactions'),
  ('kbs.view.transactions', 'View transactions', 'View official submission transactions'),
  ('kbs.view.failed', 'View failed', 'View failed transactions list'),
  ('kbs.view.submitted', 'View submitted', 'View submitted passports list'),
  ('kbs.manage.permissions', 'Manage permissions', 'Grant/revoke staff permissions')
ON CONFLICT (code) DO NOTHING;

-- ========== SEED: demo hotel + default settings ==========
INSERT INTO ops.hotels (name, code)
VALUES ('Valoria Hotel (OPS)', 'valoria-ops')
ON CONFLICT (code) DO NOTHING;

INSERT INTO ops.hotel_settings (hotel_id)
SELECT h.id
FROM ops.hotels h
WHERE h.code = 'valoria-ops'
ON CONFLICT (hotel_id) DO NOTHING;

-- NOTE: ops.app_users seed depends on auth.users. Create auth users via admin tooling,
-- then insert ops.app_users rows using service-role in backend.
-- TODO(seed): add an ops admin bootstrap endpoint (service_role) to create demo users + ops.app_users rows.

COMMIT;

