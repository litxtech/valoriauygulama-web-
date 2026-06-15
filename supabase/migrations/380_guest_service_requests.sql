-- Misafir ev hizmetleri / kayıp eşya talepleri (şikayet modülünden ayrı, durum takibi)

BEGIN;

CREATE TABLE IF NOT EXISTS public.guest_service_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id uuid NOT NULL REFERENCES public.guests(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (
    request_type IN (
      'room_cleaning',
      'towels',
      'maintenance',
      'late_checkout',
      'lost_item',
      'amenities',
      'other'
    )
  ),
  description text NOT NULL CHECK (char_length(btrim(description)) >= 3),
  room_number text,
  image_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'in_progress', 'completed', 'cancelled')
  ),
  staff_note text,
  handled_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guest_service_requests_guest_idx
  ON public.guest_service_requests (guest_id, created_at DESC);

CREATE INDEX IF NOT EXISTS guest_service_requests_org_status_idx
  ON public.guest_service_requests (organization_id, status, created_at DESC);

CREATE OR REPLACE FUNCTION public.guest_service_requests_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_service_requests_updated_at ON public.guest_service_requests;
CREATE TRIGGER trg_guest_service_requests_updated_at
  BEFORE UPDATE ON public.guest_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.guest_service_requests_set_updated_at();

CREATE OR REPLACE FUNCTION public.guest_service_requests_set_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_id IS NULL AND NEW.guest_id IS NOT NULL THEN
    SELECT COALESCE(g.organization_id, public.current_guest_organization_id())
    INTO NEW.organization_id
    FROM public.guests g
    WHERE g.id = NEW.guest_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_service_requests_set_organization ON public.guest_service_requests;
CREATE TRIGGER trg_guest_service_requests_set_organization
  BEFORE INSERT OR UPDATE OF guest_id ON public.guest_service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guest_service_requests_set_organization_id();

ALTER TABLE public.guest_service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS guest_service_requests_select_own ON public.guest_service_requests;
CREATE POLICY guest_service_requests_select_own ON public.guest_service_requests
  FOR SELECT TO authenticated
  USING (
    guest_id IN (
      SELECT g.id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS guest_service_requests_insert_own ON public.guest_service_requests;
CREATE POLICY guest_service_requests_insert_own ON public.guest_service_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IN (
      SELECT g.id FROM public.guests g
      WHERE g.auth_user_id = auth.uid() AND g.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS guest_service_requests_staff_read ON public.guest_service_requests;
CREATE POLICY guest_service_requests_staff_read ON public.guest_service_requests
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (
          s.role = 'admin'
          OR s.organization_id IS NOT DISTINCT FROM guest_service_requests.organization_id
        )
    )
  );

DROP POLICY IF EXISTS guest_service_requests_staff_update ON public.guest_service_requests;
CREATE POLICY guest_service_requests_staff_update ON public.guest_service_requests
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
        AND (
          s.role = 'admin'
          OR s.organization_id IS NOT DISTINCT FROM guest_service_requests.organization_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('guest-service-requests', 'guest-service-requests', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS guest_service_requests_bucket_read ON storage.objects;
CREATE POLICY guest_service_requests_bucket_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'guest-service-requests');

DROP POLICY IF EXISTS guest_service_requests_bucket_insert ON storage.objects;
CREATE POLICY guest_service_requests_bucket_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'guest-service-requests'
    AND auth.uid() IS NOT NULL
    AND split_part(name, '/', 1) = auth.uid()::text
  );

GRANT SELECT, INSERT ON public.guest_service_requests TO authenticated;
GRANT UPDATE ON public.guest_service_requests TO authenticated;

COMMENT ON TABLE public.guest_service_requests IS
  'Misafir oda/ev hizmetleri ve kayıp eşya talepleri — şikayetten ayrı iş akışı.';

COMMIT;
