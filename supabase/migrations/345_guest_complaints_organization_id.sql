BEGIN;

-- Misafir şikayetleri: işletme filtresi (admin paneli) için denormalize kolon
ALTER TABLE public.guest_complaints
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL;

UPDATE public.guest_complaints gc
SET organization_id = g.organization_id
FROM public.guests g
WHERE g.id = gc.guest_id
  AND gc.organization_id IS NULL
  AND g.organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS guest_complaints_org_status_created_idx
  ON public.guest_complaints (organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.guest_complaints_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.guest_id IS NOT NULL THEN
    SELECT g.organization_id INTO NEW.organization_id
    FROM public.guests g
    WHERE g.id = NEW.guest_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_complaints_set_organization ON public.guest_complaints;
CREATE TRIGGER trg_guest_complaints_set_organization
  BEFORE INSERT OR UPDATE OF guest_id ON public.guest_complaints
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_complaints_set_organization_id();

COMMIT;
