-- Pasaport/kimlik arşivi: yetkili personel belge ve (gerekirse) misafir kaydını silebilir.

BEGIN;

GRANT DELETE ON ops.guest_documents TO authenticated;
GRANT DELETE ON ops.guests TO authenticated;

DROP POLICY IF EXISTS "ops_guest_documents_kbs_delete" ON ops.guest_documents;
CREATE POLICY "ops_guest_documents_kbs_delete" ON ops.guest_documents
  FOR DELETE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

DROP POLICY IF EXISTS "ops_guests_kbs_delete" ON ops.guests;
CREATE POLICY "ops_guests_kbs_delete" ON ops.guests
  FOR DELETE TO authenticated
  USING (
    hotel_id = ops.current_hotel_id()
    AND ops.caller_can_write_kbs_guest_data()
  );

COMMIT;
