-- Web menü genel misafir yorumları (otel seviyesi — yemek yorumundan ayrı)

BEGIN;

CREATE TABLE IF NOT EXISTS public.kitchen_menu_guest_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  comment text NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'hidden')),
  client_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT kitchen_menu_guest_comments_names_chk CHECK (
    char_length(btrim(first_name)) >= 1
    AND char_length(btrim(last_name)) >= 1
    AND char_length(btrim(first_name)) <= 60
    AND char_length(btrim(last_name)) <= 60
  ),
  CONSTRAINT kitchen_menu_guest_comments_body_chk CHECK (
    char_length(btrim(comment)) >= 2
    AND char_length(btrim(comment)) <= 800
  )
);

CREATE INDEX IF NOT EXISTS kitchen_menu_guest_comments_org_idx
  ON public.kitchen_menu_guest_comments (organization_id, created_at DESC)
  WHERE status = 'published';

COMMENT ON TABLE public.kitchen_menu_guest_comments IS
  'Web menü genel misafir defteri yorumları (organization scoped; login yok).';

ALTER TABLE public.kitchen_menu_guest_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "kitchen_menu_guest_comments_public_read" ON public.kitchen_menu_guest_comments;
CREATE POLICY "kitchen_menu_guest_comments_public_read"
  ON public.kitchen_menu_guest_comments
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

DROP POLICY IF EXISTS "kitchen_menu_guest_comments_staff_update" ON public.kitchen_menu_guest_comments;
CREATE POLICY "kitchen_menu_guest_comments_staff_update"
  ON public.kitchen_menu_guest_comments
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
  );

GRANT SELECT ON public.kitchen_menu_guest_comments TO anon, authenticated;
GRANT UPDATE ON public.kitchen_menu_guest_comments TO authenticated;

COMMIT;
