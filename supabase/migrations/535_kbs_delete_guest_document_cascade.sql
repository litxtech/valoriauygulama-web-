-- Kimlik/pasaport silme: official_submission_transactions FK (RESTRICT) engelini kaldır.
-- authenticated doğrudan tx silemez (deny_write); SECURITY DEFINER RPC ile temizlenir.

BEGIN;

-- Belge silinince işlem satırları da düşsün (servis / admin yolları için).
ALTER TABLE ops.official_submission_transactions
  DROP CONSTRAINT IF EXISTS official_submission_transactions_guest_document_id_fkey;

ALTER TABLE ops.official_submission_transactions
  ADD CONSTRAINT official_submission_transactions_guest_document_id_fkey
  FOREIGN KEY (guest_document_id)
  REFERENCES ops.guest_documents(id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.kbs_delete_guest_document(
  p_guest_document_id uuid,
  p_guest_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_hotel uuid;
  v_doc_hotel uuid;
  v_doc_guest uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'AUTH', 'message', 'Oturum gerekli')
    );
  END IF;

  IF NOT ops.caller_can_write_kbs_guest_data() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'FORBIDDEN', 'message', 'KBS silme yetkisi yok')
    );
  END IF;

  v_hotel := ops.current_hotel_id();
  IF v_hotel IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'HOTEL', 'message', 'Otel kapsamı çözülemedi')
    );
  END IF;

  SELECT d.hotel_id, d.guest_id
  INTO v_doc_hotel, v_doc_guest
  FROM ops.guest_documents d
  WHERE d.id = p_guest_document_id;

  IF v_doc_hotel IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_gone', true);
  END IF;

  IF v_doc_hotel IS DISTINCT FROM v_hotel THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'FORBIDDEN', 'message', 'Otel kapsamı uyuşmuyor')
    );
  END IF;

  IF p_guest_id IS NOT NULL AND v_doc_guest IS DISTINCT FROM p_guest_id THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'VALIDATION', 'message', 'Misafir / belge eşleşmiyor')
    );
  END IF;

  -- İşlem kayıtları (RLS deny_write — DEFINER ile)
  DELETE FROM ops.official_submission_transactions
  WHERE guest_document_id = p_guest_document_id
    AND hotel_id = v_hotel;

  DELETE FROM ops.guest_documents
  WHERE id = p_guest_document_id
    AND hotel_id = v_hotel;

  -- Başka belge yoksa misafir + kalan işlemler
  IF v_doc_guest IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM ops.guest_documents g
       WHERE g.guest_id = v_doc_guest
         AND g.hotel_id = v_hotel
     )
  THEN
    DELETE FROM ops.official_submission_transactions
    WHERE guest_id = v_doc_guest
      AND hotel_id = v_hotel;

    DELETE FROM ops.guests
    WHERE id = v_doc_guest
      AND hotel_id = v_hotel;
  END IF;

  RETURN jsonb_build_object('ok', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', jsonb_build_object('code', 'DB', 'message', SQLERRM)
    );
END;
$$;

COMMENT ON FUNCTION public.kbs_delete_guest_document(uuid, uuid) IS
  'KBS kimlik kaydı sil: official_submission_transactions + guest_documents (+ yalnız bu belgeye bağlı guest).';

GRANT EXECUTE ON FUNCTION public.kbs_delete_guest_document(uuid, uuid) TO authenticated, service_role;

COMMIT;
