-- TESK "Günlük Müşteri Listesi" seri/sıra numarası.
-- Sürekli artan, başlangıcı ayarlanabilir ve sıfırlanabilir.
-- Formül: sira(gün) = start_sira + (gün - anchor_date). Her güne bir sıra no.
-- "Sıfırla/yeni başlangıç" = anchor_date bugüne, start_sira istenen değere çekilir.

BEGIN;

CREATE TABLE IF NOT EXISTS public.maliye_tesk_serial (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  seri text NOT NULL DEFAULT 'A',
  start_sira bigint NOT NULL DEFAULT 1,
  anchor_date date NOT NULL DEFAULT current_date,
  per_page int NOT NULL DEFAULT 14,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.maliye_tesk_serial ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS maliye_tesk_serial_admin ON public.maliye_tesk_serial;
CREATE POLICY maliye_tesk_serial_admin ON public.maliye_tesk_serial
  FOR ALL TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

-- Seri başlangıcını belirle / sıfırla (yalnızca admin). anchor_date bugüne çekilir:
-- girilen start_sira bugünden itibaren geçerli olur, sonraki günler +1 artar.
CREATE OR REPLACE FUNCTION public.set_maliye_tesk_serial(
  p_seri text DEFAULT 'A',
  p_start_sira bigint DEFAULT 1,
  p_per_page int DEFAULT 14
)
RETURNS public.maliye_tesk_serial
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid := public.current_staff_organization_id();
  v_row public.maliye_tesk_serial;
BEGIN
  IF NOT public.current_user_is_staff_admin() THEN
    RAISE EXCEPTION 'Bu işlemi yalnızca yönetici yapabilir.' USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Organizasyon bulunamadı.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.maliye_tesk_serial (organization_id, seri, start_sira, anchor_date, per_page, updated_at, updated_by)
  VALUES (
    v_org,
    coalesce(nullif(btrim(p_seri), ''), 'A'),
    greatest(coalesce(p_start_sira, 1), 0),
    current_date,
    greatest(coalesce(p_per_page, 14), 2),
    now(),
    auth.uid()
  )
  ON CONFLICT (organization_id) DO UPDATE
    SET seri = EXCLUDED.seri,
        start_sira = EXCLUDED.start_sira,
        anchor_date = EXCLUDED.anchor_date,
        per_page = EXCLUDED.per_page,
        updated_at = now(),
        updated_by = auth.uid()
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.set_maliye_tesk_serial(text, bigint, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_maliye_tesk_serial(text, bigint, int) TO authenticated;

COMMENT ON TABLE public.maliye_tesk_serial IS
  'TESK Günlük Müşteri Listesi seri/sıra numarası (organizasyon başına). sira = start_sira + (gün - anchor_date).';

COMMIT;
