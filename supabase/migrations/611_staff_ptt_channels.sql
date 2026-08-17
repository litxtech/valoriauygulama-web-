-- Bas-konuş (PTT) kanal kataloğu — varsayılan kanallar; LiveKit oda adı uygulama/edge tarafında üretilir.

CREATE TABLE IF NOT EXISTS public.ptt_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name_tr TEXT NOT NULL,
  name_en TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ptt_channels_slug_format CHECK (slug ~ '^[a-z0-9_]+$'),
  CONSTRAINT ptt_channels_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS ptt_channels_active_sort_idx
  ON public.ptt_channels (is_active, sort_order, created_at);

CREATE OR REPLACE FUNCTION public.set_ptt_channels_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ptt_channels_updated_at ON public.ptt_channels;
CREATE TRIGGER trg_ptt_channels_updated_at
BEFORE UPDATE ON public.ptt_channels
FOR EACH ROW
EXECUTE FUNCTION public.set_ptt_channels_updated_at();

ALTER TABLE public.ptt_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ptt_channels_select_active_staff ON public.ptt_channels;
CREATE POLICY ptt_channels_select_active_staff
ON public.ptt_channels
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.is_active = true
      AND s.deleted_at IS NULL
  )
);

DROP POLICY IF EXISTS ptt_channels_admin_write ON public.ptt_channels;
CREATE POLICY ptt_channels_admin_write
ON public.ptt_channels
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.role = 'admin'
      AND s.is_active = true
      AND s.deleted_at IS NULL
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid()
      AND s.role = 'admin'
      AND s.is_active = true
      AND s.deleted_at IS NULL
  )
);

INSERT INTO public.ptt_channels (slug, name_tr, name_en, sort_order)
VALUES
  ('all_staff', 'Tüm personel', 'All staff', 10),
  ('reception', 'Resepsiyon', 'Reception', 20),
  ('housekeeping', 'Kat hizmetleri', 'Housekeeping', 30),
  ('technical', 'Teknik', 'Technical', 40),
  ('security', 'Güvenlik', 'Security', 50),
  ('kitchen', 'Mutfak', 'Kitchen', 60)
ON CONFLICT (slug) DO NOTHING;

COMMENT ON TABLE public.ptt_channels IS 'Staff push-to-talk channel catalog (LiveKit rooms are named ptt_{org}_{slug}).';
