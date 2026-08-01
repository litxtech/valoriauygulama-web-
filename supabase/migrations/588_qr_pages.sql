-- QR otomatik web sayfaları: metin / resim / video blokları
BEGIN;

CREATE TABLE IF NOT EXISTS public.qr_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Yeni sayfa',
  public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS qr_pages_public_token_uniq
  ON public.qr_pages (public_token);

CREATE INDEX IF NOT EXISTS qr_pages_org_updated_idx
  ON public.qr_pages (organization_id, updated_at DESC);

COMMENT ON TABLE public.qr_pages IS
  'QR ile açılan otomatik web sayfaları (valoria.tr/sayfa/{public_token}).';
COMMENT ON COLUMN public.qr_pages.public_token IS
  'Tahmin edilmesi zor herkese açık sayfa anahtarı.';
COMMENT ON COLUMN public.qr_pages.is_published IS
  'true ise get_public_qr_page anonim ziyaretçilere döner.';

CREATE TABLE IF NOT EXISTS public.qr_page_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id uuid NOT NULL REFERENCES public.qr_pages(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  block_type text NOT NULL CHECK (block_type IN ('text', 'image', 'video')),
  body text,
  media_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_page_blocks_content_check CHECK (
    (block_type = 'text' AND body IS NOT NULL AND length(trim(body)) > 0)
    OR (block_type IN ('image', 'video') AND media_url IS NOT NULL AND length(trim(media_url)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS qr_page_blocks_page_sort_idx
  ON public.qr_page_blocks (page_id, sort_order, created_at);

COMMENT ON TABLE public.qr_page_blocks IS
  'QR sayfa içerik blokları: text | image | video.';

ALTER TABLE public.qr_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_page_blocks ENABLE ROW LEVEL SECURITY;

-- Staff kendi org; admin tüm org
DROP POLICY IF EXISTS qr_pages_select ON public.qr_pages;
CREATE POLICY qr_pages_select ON public.qr_pages
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.role = 'admin'
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS qr_pages_insert ON public.qr_pages;
CREATE POLICY qr_pages_insert ON public.qr_pages
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.role = 'admin'
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS qr_pages_update ON public.qr_pages;
CREATE POLICY qr_pages_update ON public.qr_pages
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.role = 'admin'
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.role = 'admin'
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS qr_pages_delete ON public.qr_pages;
CREATE POLICY qr_pages_delete ON public.qr_pages
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.role = 'admin'
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS qr_page_blocks_select ON public.qr_page_blocks;
CREATE POLICY qr_page_blocks_select ON public.qr_page_blocks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.qr_pages p
      WHERE p.id = page_id
        AND (
          p.organization_id = public.current_staff_organization_id()
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.role = 'admin'
              AND s.is_active = true
              AND s.deleted_at IS NULL
          )
        )
    )
  );

DROP POLICY IF EXISTS qr_page_blocks_insert ON public.qr_page_blocks;
CREATE POLICY qr_page_blocks_insert ON public.qr_page_blocks
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qr_pages p
      WHERE p.id = page_id
        AND (
          p.organization_id = public.current_staff_organization_id()
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.role = 'admin'
              AND s.is_active = true
              AND s.deleted_at IS NULL
          )
        )
    )
  );

DROP POLICY IF EXISTS qr_page_blocks_update ON public.qr_page_blocks;
CREATE POLICY qr_page_blocks_update ON public.qr_page_blocks
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.qr_pages p
      WHERE p.id = page_id
        AND (
          p.organization_id = public.current_staff_organization_id()
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.role = 'admin'
              AND s.is_active = true
              AND s.deleted_at IS NULL
          )
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.qr_pages p
      WHERE p.id = page_id
        AND (
          p.organization_id = public.current_staff_organization_id()
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.role = 'admin'
              AND s.is_active = true
              AND s.deleted_at IS NULL
          )
        )
    )
  );

DROP POLICY IF EXISTS qr_page_blocks_delete ON public.qr_page_blocks;
CREATE POLICY qr_page_blocks_delete ON public.qr_page_blocks
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.qr_pages p
      WHERE p.id = page_id
        AND (
          p.organization_id = public.current_staff_organization_id()
          OR EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND s.role = 'admin'
              AND s.is_active = true
              AND s.deleted_at IS NULL
          )
        )
    )
  );

CREATE OR REPLACE FUNCTION public.get_public_qr_page(p_token uuid)
RETURNS TABLE (
  id uuid,
  title text,
  updated_at timestamptz,
  blocks jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.title,
    p.updated_at,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', b.id,
            'sort_order', b.sort_order,
            'block_type', b.block_type,
            'body', b.body,
            'media_url', b.media_url
          )
          ORDER BY b.sort_order ASC, b.created_at ASC
        )
        FROM public.qr_page_blocks b
        WHERE b.page_id = p.id
      ),
      '[]'::jsonb
    ) AS blocks
  FROM public.qr_pages p
  WHERE p.public_token = p_token
    AND p.is_published = true
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_public_qr_page(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_qr_page(uuid) TO anon, authenticated;

-- Public storage (resim + video)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'qr-page-media',
  'qr-page-media',
  true,
  104857600,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS qr_page_media_public_read ON storage.objects;
CREATE POLICY qr_page_media_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'qr-page-media');

DROP POLICY IF EXISTS qr_page_media_staff_write ON storage.objects;
CREATE POLICY qr_page_media_staff_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'qr-page-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS qr_page_media_staff_update ON storage.objects;
CREATE POLICY qr_page_media_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'qr-page-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS qr_page_media_staff_delete ON storage.objects;
CREATE POLICY qr_page_media_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'qr-page-media'
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.is_active = true
        AND s.deleted_at IS NULL
    )
  );

COMMIT;
