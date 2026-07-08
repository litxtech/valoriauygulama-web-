-- Arıza Kayıt Sistemi (Fault Records)
-- Personel giderdiği arızayı, ne yaptığını, sonucu, kullanılan malzemeyi ve
-- hangi odada olduğunu kaydeder. Org bazlı RLS; tüm aktif personel görüntüler/oluşturur.

BEGIN;

CREATE TABLE IF NOT EXISTS public.fault_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  record_no text,
  room_number text,
  location_label text,
  category text NOT NULL DEFAULT 'other' CHECK (
    category IN ('electrical', 'plumbing', 'furniture', 'electronics', 'hvac', 'appliance', 'other')
  ),
  fault_description text NOT NULL,
  work_done text,
  materials_used text,
  result_note text,
  status text NOT NULL DEFAULT 'resolved' CHECK (
    status IN ('resolved', 'pending', 'unresolved')
  ),
  occurred_at timestamptz,
  resolved_at timestamptz,
  created_by_staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fault_records_description_not_blank CHECK (length(trim(fault_description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_fault_records_org_created
  ON public.fault_records (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fault_records_org_status
  ON public.fault_records (organization_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fault_records_org_room
  ON public.fault_records (organization_id, room_number);
CREATE INDEX IF NOT EXISTS idx_fault_records_created_by
  ON public.fault_records (created_by_staff_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fault_records_org_record_no
  ON public.fault_records (organization_id, record_no)
  WHERE record_no IS NOT NULL;

-- updated_at otomatik güncelleme
CREATE OR REPLACE FUNCTION public.fault_records_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fault_records_updated_at ON public.fault_records;
CREATE TRIGGER trg_fault_records_updated_at
  BEFORE UPDATE ON public.fault_records
  FOR EACH ROW EXECUTE FUNCTION public.fault_records_set_updated_at();

-- Okunabilir kayıt numarası (ARZ-YY-0001) — org bazlı sayaç.
CREATE OR REPLACE FUNCTION public.fault_records_set_record_no()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_seq integer;
BEGIN
  IF NEW.record_no IS NULL OR length(trim(NEW.record_no)) = 0 THEN
    SELECT COUNT(*) + 1 INTO v_seq
    FROM public.fault_records
    WHERE organization_id = NEW.organization_id;
    NEW.record_no := 'ARZ-' || to_char(now(), 'YY') || '-' || lpad(v_seq::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fault_records_record_no ON public.fault_records;
CREATE TRIGGER trg_fault_records_record_no
  BEFORE INSERT ON public.fault_records
  FOR EACH ROW EXECUTE FUNCTION public.fault_records_set_record_no();

ALTER TABLE public.fault_records ENABLE ROW LEVEL SECURITY;

-- Tüm aktif personel kendi organizasyonundaki arıza kayıtlarını görebilir.
DROP POLICY IF EXISTS "fault_records_select_staff" ON public.fault_records;
CREATE POLICY "fault_records_select_staff"
  ON public.fault_records FOR SELECT TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
  );

DROP POLICY IF EXISTS "fault_records_insert_staff" ON public.fault_records;
CREATE POLICY "fault_records_insert_staff"
  ON public.fault_records FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
    AND created_by_staff_id = public.current_staff_id()
  );

-- Kaydı oluşturan personel veya yöneticiler güncelleyebilir.
DROP POLICY IF EXISTS "fault_records_update_staff" ON public.fault_records;
CREATE POLICY "fault_records_update_staff"
  ON public.fault_records FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND (
      created_by_staff_id = public.current_staff_id()
      OR public.current_user_is_staff_admin()
    )
  )
  WITH CHECK (
    organization_id = public.current_staff_organization_id()
  );

-- Silme yalnızca yönetici.
DROP POLICY IF EXISTS "fault_records_delete_admin" ON public.fault_records;
CREATE POLICY "fault_records_delete_admin"
  ON public.fault_records FOR DELETE TO authenticated
  USING (
    organization_id = public.current_staff_organization_id()
    AND public.current_user_is_staff_admin()
  );

COMMIT;
