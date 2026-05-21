-- MRZ/KBS: ops.guests + ops.guest_documents doğrudan REST yazımı (kbsDocumentUpsertLocal).
-- 283: authenticated → yalnızca SELECT; 141: deny_write → tüm yazımlar kapalı.
-- 307: guest_scan_* tabloları açıldı; guests / guest_documents eksikti.

BEGIN;

-- ========== Yetki kontrolü (SECURITY DEFINER — RLS içinde güvenli) ==========

CREATE OR REPLACE FUNCTION ops.caller_can_write_kbs_guest_data()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ops, public
AS $$
  SELECT COALESCE(
    (
      SELECT
        au.kbs_access_enabled
        AND au.is_active
        AND (
          au.role IN ('admin', 'manager')
          OR EXISTS (
            SELECT 1
            FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.is_active = true
              AND s.deleted_at IS NULL
              AND (
                s.role IN ('admin', 'manager')
                OR ops.staff_has_kbs_mrz_scan(s.app_permissions)
              )
          )
        )
      FROM ops.app_users au
      WHERE au.id = auth.uid()
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION ops.caller_can_write_kbs_guest_data() IS
  'KBS/MRZ: otelin ops.app_users kaydı + kbs_access_enabled; admin/manager veya staff kbs_mrz_scan.';

GRANT EXECUTE ON FUNCTION ops.caller_can_write_kbs_guest_data() TO authenticated, service_role;

-- ========== Tablo GRANT (PostgREST INSERT/UPDATE için zorunlu) ==========

GRANT INSERT, UPDATE ON ops.guests TO authenticated;
GRANT INSERT, UPDATE ON ops.guest_documents TO authenticated;

-- ========== RLS: 141 deny_write kaldır, KBS personeli yazabilsin ==========

DROP POLICY IF EXISTS "ops_guests_deny_write" ON ops.guests;
DROP POLICY IF EXISTS "ops_guest_documents_deny_write" ON ops.guest_documents;

DROP POLICY IF EXISTS "ops_guests_kbs_insert" ON ops.guests;
CREATE POLICY "ops_guests_kbs_insert" ON ops.guests
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS "ops_guests_kbs_update" ON ops.guests;
CREATE POLICY "ops_guests_kbs_update" ON ops.guests
  FOR UPDATE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  )
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS "ops_guest_documents_kbs_insert" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_kbs_insert" ON ops.guest_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS "ops_guest_documents_kbs_update" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_kbs_update" ON ops.guest_documents
  FOR UPDATE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  )
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

COMMIT;
