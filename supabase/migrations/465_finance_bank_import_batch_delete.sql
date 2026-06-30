-- Banka ekstresi partisini sil: bağlı ödeme hareketleri + ekstre satırları (cascade)

BEGIN;

CREATE OR REPLACE FUNCTION public.finance_delete_bank_import_batch(
  p_organization_id uuid,
  p_batch_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_mov_count int := 0;
BEGIN
  IF NOT (
    public.staff_is_admin_active()
    OR p_organization_id = ANY (public.staff_org_ids_for_auth())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.finance_bank_import_batches
    WHERE id = p_batch_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'batch not found';
  END IF;

  DELETE FROM public.finance_movements m
  USING public.finance_bank_statement_lines l
  WHERE l.batch_id = p_batch_id
    AND l.organization_id = p_organization_id
    AND m.bank_statement_line_id = l.id;

  GET DIAGNOSTICS v_mov_count = ROW_COUNT;

  DELETE FROM public.finance_bank_import_batches
  WHERE id = p_batch_id AND organization_id = p_organization_id;

  RETURN jsonb_build_object('movement_count', v_mov_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finance_delete_bank_import_batch(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.finance_delete_bank_import_batch IS
  'Banka ekstresi içe aktarma partisini ve bağlı finance_movements kayıtlarını siler';

COMMIT;
