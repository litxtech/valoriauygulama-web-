-- Kriter seed: yeni işletmeler ve kriteri olmayan bölümler için varsayılanları tamamla.

BEGIN;

CREATE OR REPLACE FUNCTION public._audit_seed_criteria_for_category(p_cat_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.audit_criteria WHERE category_id = p_cat_id LIMIT 1) THEN
    RETURN;
  END IF;

  IF p_slug = 'reception' THEN
    INSERT INTO public.audit_criteria (category_id, title, max_points, weight, sort_order) VALUES
      (p_cat_id, 'Karşılama & iletişim', 20, 1, 10),
      (p_cat_id, 'Resepsiyon düzeni', 20, 1, 20),
      (p_cat_id, 'Bekleme alanı', 20, 1, 30),
      (p_cat_id, 'Kayıt süreçleri', 20, 1, 40),
      (p_cat_id, 'Genel görünüm', 20, 1, 50);
  ELSIF p_slug = 'kitchen' THEN
    INSERT INTO public.audit_criteria (category_id, title, description, max_points, weight, is_critical, sort_order) VALUES
      (p_cat_id, 'Yüzey hijyeni', 'Tezgâh, zemin, ekipman temizliği', 25, 1, false, 10),
      (p_cat_id, 'Soğuk zincir', 'Sıcaklık ve saklama kuralları', 20, 1, true, 20),
      (p_cat_id, 'Personel kıyafeti', NULL, 15, 1, false, 30),
      (p_cat_id, 'Atık ayrıştırma', NULL, 15, 1, false, 40),
      (p_cat_id, 'Ekipman bakımı', NULL, 15, 1, false, 50),
      (p_cat_id, 'Genel düzen', NULL, 10, 1, false, 60);
  ELSIF p_slug = 'office' THEN
    INSERT INTO public.audit_criteria (category_id, title, max_points, weight, sort_order) VALUES
      (p_cat_id, 'Çalışma düzeni', 25, 1, 10),
      (p_cat_id, 'Dosyalama', 25, 1, 20),
      (p_cat_id, 'Temizlik', 25, 1, 30),
      (p_cat_id, 'Ekipman & IT', 25, 1, 40);
  ELSIF p_slug = 'housekeeping' THEN
    INSERT INTO public.audit_criteria (category_id, title, max_points, weight, sort_order) VALUES
      (p_cat_id, 'Oda standardı', 30, 1, 10),
      (p_cat_id, 'Koridor & ortak alan', 25, 1, 20),
      (p_cat_id, 'Çamaşırhane', 25, 1, 30),
      (p_cat_id, 'Depo & malzeme', 20, 1, 40);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.seed_audit_defaults_for_org(p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat_id uuid;
  rec record;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('reception', 'Reception', 'desktop-outline', 10),
      ('kitchen', 'Mutfak', 'restaurant-outline', 20),
      ('office', 'Ofis', 'business-outline', 30),
      ('housekeeping', 'Kat hizmetleri', 'bed-outline', 40)
    ) AS t(slug, name, icon, sort_order)
  LOOP
    SELECT id INTO v_cat_id
    FROM public.audit_categories
    WHERE organization_id = p_org_id AND slug = rec.slug
    LIMIT 1;

    IF v_cat_id IS NULL THEN
      INSERT INTO public.audit_categories (organization_id, slug, name, icon, sort_order)
      VALUES (p_org_id, rec.slug, rec.name, rec.icon, rec.sort_order)
      RETURNING id INTO v_cat_id;
    END IF;

    PERFORM public._audit_seed_criteria_for_category(v_cat_id, rec.slug);
    v_cat_id := NULL;
  END LOOP;

  -- Slug'ı bilinen diğer bölümlere genel kriter şablonu (boşsa)
  FOR rec IN
    SELECT c.id, c.slug
    FROM public.audit_categories c
    WHERE c.organization_id = p_org_id
      AND c.is_active = true
      AND NOT EXISTS (SELECT 1 FROM public.audit_criteria cr WHERE cr.category_id = c.id)
  LOOP
    INSERT INTO public.audit_criteria (category_id, title, max_points, weight, sort_order) VALUES
      (rec.id, 'Genel standart', 50, 1, 10),
      (rec.id, 'Temizlik & düzen', 50, 1, 20);
  END LOOP;
END;
$$;

-- Mevcut tüm işletmelerde kriterleri tamamla
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_audit_defaults_for_org(r.id);
  END LOOP;
END;
$$;

-- FOR ALL politikaları bazı ortamlarda SELECT'i gölgeleyebilir; yazmayı ayır.
DROP POLICY IF EXISTS audit_categories_write ON public.audit_categories;
CREATE POLICY audit_categories_insert ON public.audit_categories
  FOR INSERT TO authenticated
  WITH CHECK (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()));
CREATE POLICY audit_categories_update ON public.audit_categories
  FOR UPDATE TO authenticated
  USING (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()))
  WITH CHECK (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()));
CREATE POLICY audit_categories_delete ON public.audit_categories
  FOR DELETE TO authenticated
  USING (public.staff_is_admin_active() AND organization_id = ANY (public.staff_org_ids_for_auth()));

DROP POLICY IF EXISTS audit_criteria_write ON public.audit_criteria;
CREATE POLICY audit_criteria_insert ON public.audit_criteria
  FOR INSERT TO authenticated
  WITH CHECK (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_categories c
      WHERE c.id = category_id AND c.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );
CREATE POLICY audit_criteria_update ON public.audit_criteria
  FOR UPDATE TO authenticated
  USING (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_categories c
      WHERE c.id = category_id AND c.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  )
  WITH CHECK (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_categories c
      WHERE c.id = category_id AND c.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );
CREATE POLICY audit_criteria_delete ON public.audit_criteria
  FOR DELETE TO authenticated
  USING (
    public.staff_is_admin_active()
    AND EXISTS (
      SELECT 1 FROM public.audit_categories c
      WHERE c.id = category_id AND c.organization_id = ANY (public.staff_org_ids_for_auth())
    )
  );

COMMIT;
