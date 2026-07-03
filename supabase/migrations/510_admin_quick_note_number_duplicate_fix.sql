BEGIN;

-- Not numarası üretimi: count(*) + 1 silinen notlarda ve eşzamanlı insertlerde duplicate üretiyordu.
-- MAX(seq) + 1 ve transaction advisory lock ile düzeltildi.

CREATE OR REPLACE FUNCTION public.admin_quick_note_next_number(p_org_id uuid)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_seq integer;
  v_year text;
BEGIN
  v_year := to_char(now() AT TIME ZONE 'UTC', 'YYYY');

  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text || ':' || v_year));

  SELECT COALESCE(
    MAX(
      NULLIF(substring(n.note_number FROM 'NOT-' || v_year || '-([0-9]+)$'), '')::integer
    ),
    0
  ) + 1
  INTO v_seq
  FROM public.admin_quick_notes n
  WHERE n.organization_id = p_org_id
    AND n.note_number LIKE 'NOT-' || v_year || '-%';

  RETURN 'NOT-' || v_year || '-' || lpad(v_seq::text, 4, '0');
END;
$$;

COMMENT ON FUNCTION public.admin_quick_note_next_number(uuid) IS
  'Organizasyon + yıl bazında NOT-YYYY-NNNN; MAX+1 ve advisory lock ile duplicate önlenir.';

COMMIT;
