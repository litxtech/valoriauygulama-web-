-- Cari kaldırma: pasifleştirirken banka eşleşme hafızasını (IBAN/TCKN/isim alias) da temizle.
-- Böylece deneme amaçlı toplu silmeden sonra yeniden içe aktarımda eski/pasif cariye
-- yanlış eşleşme olmaz ve aynı kişi için tek, taze cari oluşur.

BEGIN;

CREATE OR REPLACE FUNCTION public.finance_deactivate_counterparties(
  p_organization_id uuid,
  p_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT (
    public.staff_is_admin_active()
    OR p_organization_id = ANY (public.staff_org_ids_for_auth())
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_ids IS NULL OR array_length(p_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('deactivated', 0);
  END IF;

  DELETE FROM public.finance_counterparty_bank_aliases
  WHERE organization_id = p_organization_id
    AND counterparty_id = ANY (p_ids);

  UPDATE public.finance_counterparties
  SET is_active = false
  WHERE organization_id = p_organization_id
    AND id = ANY (p_ids)
    AND is_active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('deactivated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finance_deactivate_counterparties(uuid, uuid[]) TO authenticated;

COMMENT ON FUNCTION public.finance_deactivate_counterparties IS
  'Carileri pasifleştirir ve banka eşleşme alias kayıtlarını siler (yeniden içe aktarımda temiz eşleşme).';

COMMIT;
