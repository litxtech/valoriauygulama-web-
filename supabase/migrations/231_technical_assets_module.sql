-- Akıllı Tesis Envanteri / Teknik QR: binalar, lokasyonlar, varlıklar, ilişkiler, müdahale logları
-- QR yalnızca valoria://tech-asset/<uuid> taşır; ayrıntılar Supabase'den okunur.

BEGIN;

CREATE OR REPLACE FUNCTION public.staff_tech_asset_manage_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.role = 'admin')
        OR (s.app_permissions->>'teknik_varlik_yonetimi') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.staff_tech_asset_operate_allowed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (s.role = 'admin')
        OR (s.app_permissions->>'teknik_varlik_yonetimi') IN ('true', 't', '1', 'True', 'TRUE')
        OR (s.app_permissions->>'teknik_varliklar') IN ('true', 't', '1', 'True', 'TRUE')
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
      LIMIT 1
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_tech_asset_manage_allowed() IS
  'Teknik varlık: bina/lokasyon/varlık CRUD (admin veya teknik_varlik_yonetimi).';
COMMENT ON FUNCTION public.staff_tech_asset_operate_allowed() IS
  'Teknik varlık: müdahale kaydı ve durum güncelleme (admin, teknik_varlik_yonetimi veya teknik_varliklar).';

-- ---------- Binalar (tesis altı: Ana Otel, Bungalov 1, …) ----------
CREATE TABLE IF NOT EXISTS public.tech_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name text NOT NULL,
  building_type text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_buildings_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT tech_buildings_org_name_uniq UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tech_buildings_org_sort
  ON public.tech_buildings (organization_id, sort_order ASC, name ASC);

-- ---------- Lokasyonlar (bina içi yer) ----------
CREATE TABLE IF NOT EXISTS public.tech_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  building_id uuid NOT NULL REFERENCES public.tech_buildings(id) ON DELETE CASCADE,
  name text NOT NULL,
  floor text,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_locations_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT tech_locations_org_building_name_uniq UNIQUE (organization_id, building_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tech_locations_org_building
  ON public.tech_locations (organization_id, building_id, sort_order ASC, name ASC);

-- ---------- Teknik varlık (QR hedefi) ----------
CREATE TABLE IF NOT EXISTS public.tech_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_code text NOT NULL,
  name text NOT NULL,
  category_group text NOT NULL,
  category_label text NOT NULL,
  building_id uuid NOT NULL REFERENCES public.tech_buildings(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.tech_locations(id) ON DELETE RESTRICT,
  description text,
  function_text text,
  if_closed_effects text,
  affected_areas text,
  emergency_action text,
  warning_text text,
  who_can_close text,
  who_can_open text,
  criticality text NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance', 'fault')),
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  qr_payload text NOT NULL DEFAULT '',
  label_tagline text,
  created_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by_staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_assets_code_not_blank CHECK (length(trim(asset_code)) > 0),
  CONSTRAINT tech_assets_name_not_blank CHECK (length(trim(name)) > 0),
  CONSTRAINT tech_assets_org_code_uniq UNIQUE (organization_id, asset_code),
  CONSTRAINT tech_assets_qr_payload_not_blank CHECK (length(trim(qr_payload)) > 0)
);

CREATE OR REPLACE FUNCTION public.tech_assets_set_qr_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.qr_payload IS NULL OR length(trim(NEW.qr_payload)) = 0 THEN
    NEW.qr_payload := 'valoria://tech-asset/' || NEW.id::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tech_assets_qr_payload ON public.tech_assets;
CREATE TRIGGER trg_tech_assets_qr_payload
  BEFORE INSERT ON public.tech_assets
  FOR EACH ROW EXECUTE FUNCTION public.tech_assets_set_qr_payload();

CREATE INDEX IF NOT EXISTS idx_tech_assets_org_status
  ON public.tech_assets (organization_id, status, criticality, name);
CREATE INDEX IF NOT EXISTS idx_tech_assets_org_building
  ON public.tech_assets (organization_id, building_id);

-- ---------- Varlık ilişkileri ----------
CREATE TABLE IF NOT EXISTS public.tech_asset_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.tech_assets(id) ON DELETE CASCADE,
  related_asset_id uuid NOT NULL REFERENCES public.tech_assets(id) ON DELETE CASCADE,
  relation_type text NOT NULL DEFAULT 'affects',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_asset_relations_no_self CHECK (asset_id <> related_asset_id),
  CONSTRAINT tech_asset_relations_pair_uniq UNIQUE (asset_id, related_asset_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_tech_asset_relations_asset
  ON public.tech_asset_relations (asset_id);
CREATE INDEX IF NOT EXISTS idx_tech_asset_relations_related
  ON public.tech_asset_relations (related_asset_id);

-- ---------- Müdahale / kontrol logları ----------
CREATE TABLE IF NOT EXISTS public.tech_maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_id uuid NOT NULL REFERENCES public.tech_assets(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  action_type text NOT NULL,
  note text,
  photo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tech_maintenance_logs_action_not_blank CHECK (length(trim(action_type)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tech_maintenance_logs_asset_created
  ON public.tech_maintenance_logs (asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_maintenance_logs_org_created
  ON public.tech_maintenance_logs (organization_id, created_at DESC);

-- ---------- updated_at ----------
CREATE OR REPLACE FUNCTION public.tech_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tech_buildings_updated ON public.tech_buildings;
CREATE TRIGGER trg_tech_buildings_updated
  BEFORE UPDATE ON public.tech_buildings
  FOR EACH ROW EXECUTE FUNCTION public.tech_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tech_locations_updated ON public.tech_locations;
CREATE TRIGGER trg_tech_locations_updated
  BEFORE UPDATE ON public.tech_locations
  FOR EACH ROW EXECUTE FUNCTION public.tech_touch_updated_at();

DROP TRIGGER IF EXISTS trg_tech_assets_updated ON public.tech_assets;
CREATE TRIGGER trg_tech_assets_updated
  BEFORE UPDATE ON public.tech_assets
  FOR EACH ROW EXECUTE FUNCTION public.tech_touch_updated_at();

-- ---------- RLS ----------
DROP POLICY IF EXISTS "tech_buildings_mutate_manage" ON public.tech_buildings;
DROP POLICY IF EXISTS "tech_locations_mutate_manage" ON public.tech_locations;
DROP POLICY IF EXISTS "tech_asset_relations_mutate_manage" ON public.tech_asset_relations;

ALTER TABLE public.tech_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_asset_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tech_maintenance_logs ENABLE ROW LEVEL SECURITY;

-- Okuma: aynı işletmedeki tüm aktif personel (QR + talimat)
DROP POLICY IF EXISTS "tech_buildings_select_org" ON public.tech_buildings;
CREATE POLICY "tech_buildings_select_org" ON public.tech_buildings
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "tech_buildings_insert_manage" ON public.tech_buildings;
CREATE POLICY "tech_buildings_insert_manage" ON public.tech_buildings
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_buildings_update_manage" ON public.tech_buildings;
CREATE POLICY "tech_buildings_update_manage" ON public.tech_buildings
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_buildings_delete_manage" ON public.tech_buildings;
CREATE POLICY "tech_buildings_delete_manage" ON public.tech_buildings
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_locations_select_org" ON public.tech_locations;
CREATE POLICY "tech_locations_select_org" ON public.tech_locations
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "tech_locations_insert_manage" ON public.tech_locations;
CREATE POLICY "tech_locations_insert_manage" ON public.tech_locations
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_locations_update_manage" ON public.tech_locations;
CREATE POLICY "tech_locations_update_manage" ON public.tech_locations
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_locations_delete_manage" ON public.tech_locations;
CREATE POLICY "tech_locations_delete_manage" ON public.tech_locations
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_assets_select_org" ON public.tech_assets;
CREATE POLICY "tech_assets_select_org" ON public.tech_assets
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "tech_assets_insert_manage" ON public.tech_assets;
CREATE POLICY "tech_assets_insert_manage" ON public.tech_assets
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_assets_update_manage_or_operate" ON public.tech_assets;
CREATE POLICY "tech_assets_update_manage_or_operate" ON public.tech_assets
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      public.staff_tech_asset_manage_allowed()
      OR public.staff_tech_asset_operate_allowed()
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND (
      public.staff_tech_asset_manage_allowed()
      OR public.staff_tech_asset_operate_allowed()
    )
  );

DROP POLICY IF EXISTS "tech_assets_delete_manage" ON public.tech_assets;
CREATE POLICY "tech_assets_delete_manage" ON public.tech_assets
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_asset_relations_select_org" ON public.tech_asset_relations;
CREATE POLICY "tech_asset_relations_select_org" ON public.tech_asset_relations
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "tech_asset_relations_insert_manage" ON public.tech_asset_relations;
CREATE POLICY "tech_asset_relations_insert_manage" ON public.tech_asset_relations
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_asset_relations_update_manage" ON public.tech_asset_relations;
CREATE POLICY "tech_asset_relations_update_manage" ON public.tech_asset_relations
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_asset_relations_delete_manage" ON public.tech_asset_relations;
CREATE POLICY "tech_asset_relations_delete_manage" ON public.tech_asset_relations
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_manage_allowed()
  );

DROP POLICY IF EXISTS "tech_maintenance_logs_select_org" ON public.tech_maintenance_logs;
CREATE POLICY "tech_maintenance_logs_select_org" ON public.tech_maintenance_logs
  FOR SELECT TO authenticated
  USING (organization_id = public.current_staff_organization_id());

DROP POLICY IF EXISTS "tech_maintenance_logs_insert_operate" ON public.tech_maintenance_logs;
CREATE POLICY "tech_maintenance_logs_insert_operate" ON public.tech_maintenance_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND public.staff_tech_asset_operate_allowed()
    AND staff_id = public.current_staff_id()
  );

REVOKE ALL ON FUNCTION public.staff_tech_asset_manage_allowed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.staff_tech_asset_operate_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_tech_asset_manage_allowed() TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_tech_asset_operate_allowed() TO authenticated;

COMMENT ON TABLE public.tech_buildings IS 'Tesis altı yapı birimleri (Ana Bina, Bungalov, Ortak Alan).';
COMMENT ON TABLE public.tech_locations IS 'Bina içi lokasyon (kat, pano odası, dış pano).';
COMMENT ON TABLE public.tech_assets IS 'QR ile okunan teknik varlık (sigorta, vana, NVR vb.).';
COMMENT ON TABLE public.tech_asset_relations IS 'Varlıklar arası etki / bağlantı.';
COMMENT ON TABLE public.tech_maintenance_logs IS 'Müdahale ve kontrol kayıtları.';

COMMIT;
