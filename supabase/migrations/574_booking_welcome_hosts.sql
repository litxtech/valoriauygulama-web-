-- Booking welcome hosts: young-energy faces for guest room detail

CREATE TABLE IF NOT EXISTS public.booking_welcome_hosts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role_label TEXT,
  photo_url TEXT,
  vibe_tag TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_welcome_hosts_org_active
  ON public.booking_welcome_hosts (organization_id, is_active, sort_order);

ALTER TABLE public.booking_welcome_hosts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS booking_welcome_hosts_staff_all ON public.booking_welcome_hosts;
CREATE POLICY booking_welcome_hosts_staff_all ON public.booking_welcome_hosts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true
        AND s.role IN ('admin', 'manager', 'reception')
    )
  );

CREATE OR REPLACE FUNCTION public.list_booking_welcome_hosts(
  p_org_slug TEXT DEFAULT 'valoria'
)
RETURNS TABLE (
  id UUID,
  display_name TEXT,
  role_label TEXT,
  photo_url TEXT,
  vibe_tag TEXT,
  sort_order INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.id, h.display_name, h.role_label, h.photo_url, h.vibe_tag, h.sort_order
  FROM public.booking_welcome_hosts h
  JOIN public.organizations o ON o.id = h.organization_id
  WHERE o.slug = lower(trim(coalesce(p_org_slug, 'valoria')))
    AND h.is_active = true
  ORDER BY h.sort_order ASC, h.created_at ASC;
$$;

GRANT EXECUTE ON FUNCTION public.list_booking_welcome_hosts(TEXT) TO anon, authenticated;
