-- KBS konaklama kayıtları: ops.guest_stays REST yazımı (283 yalnızca SELECT veriyordu).
-- 281 RLS politikaları vardı; tablo düzeyinde INSERT/UPDATE grant eksikti → 42501 permission denied.

BEGIN;

GRANT INSERT, UPDATE ON ops.guest_stays TO authenticated;
GRANT INSERT ON ops.guest_correction_history TO authenticated;

-- ========== RLS: KBS yazma yetkisi (309 caller_can_write_kbs_guest_data ile uyumlu) ==========

DROP POLICY IF EXISTS ops_guest_stays_write ON ops.guest_stays;
DROP POLICY IF EXISTS ops_guest_stays_kbs_insert ON ops.guest_stays;
DROP POLICY IF EXISTS ops_guest_stays_kbs_update ON ops.guest_stays;

CREATE POLICY ops_guest_stays_kbs_insert ON ops.guest_stays
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

CREATE POLICY ops_guest_stays_kbs_update ON ops.guest_stays
  FOR UPDATE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  )
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS ops_guest_correction_history_insert ON ops.guest_correction_history;
CREATE POLICY ops_guest_correction_history_insert ON ops.guest_correction_history
  FOR INSERT TO authenticated
  WITH CHECK (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

COMMIT;
