-- Çoklu işletme: public.rooms ve contract_acceptances için organization_id (uygulama 134+ sonrası bekleniyordu).
-- Eksik kolon → PostgREST 42703 "column organization_id does not exist" (admin panel, sözleşme onayları).

BEGIN;

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

UPDATE public.rooms r
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'valoria' LIMIT 1)
WHERE r.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_organization_id ON public.rooms(organization_id);

COMMENT ON COLUMN public.rooms.organization_id IS 'Oda hangi işletmeye ait (Valoria, Bavul Suite, …).';

-- ---------------------------------------------------------------------------

ALTER TABLE public.contract_acceptances
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE RESTRICT;

UPDATE public.contract_acceptances ca
SET organization_id = g.organization_id
FROM public.guests g
WHERE ca.guest_id = g.id
  AND g.organization_id IS NOT NULL
  AND ca.organization_id IS NULL;

UPDATE public.contract_acceptances ca
SET organization_id = r.organization_id
FROM public.rooms r
WHERE ca.room_id = r.id
  AND r.organization_id IS NOT NULL
  AND ca.organization_id IS NULL;

UPDATE public.contract_acceptances ca
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'valoria' LIMIT 1)
WHERE ca.organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contract_acceptances_organization_id
  ON public.contract_acceptances(organization_id);

COMMENT ON COLUMN public.contract_acceptances.organization_id IS 'Onay kaydının işletmesi; misafir veya oda üzerinden türetilir.';

CREATE OR REPLACE FUNCTION public.sync_contract_acceptance_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.guest_id IS NOT NULL THEN
    SELECT g.organization_id INTO NEW.organization_id
    FROM public.guests g
    WHERE g.id = NEW.guest_id;
  END IF;

  IF NEW.organization_id IS NULL AND NEW.room_id IS NOT NULL THEN
    SELECT r.organization_id INTO NEW.organization_id
    FROM public.rooms r
    WHERE r.id = NEW.room_id;
  END IF;

  IF NEW.organization_id IS NULL THEN
    SELECT id INTO NEW.organization_id
    FROM public.organizations
    WHERE slug = 'valoria'
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_acceptances_organization ON public.contract_acceptances;
CREATE TRIGGER trg_contract_acceptances_organization
  BEFORE INSERT OR UPDATE OF guest_id, room_id ON public.contract_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_contract_acceptance_organization_id();

COMMIT;
