BEGIN;

-- Bir görev birden fazla personele aynı anda atanınca, her satır tüm görevlilerin
-- listesini taşır; böylece RLS nedeniyle başkalarının satırını göremeyen personel de
-- görevi birlikte aldığı kişileri kart üzerinde görebilir.
ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS group_staff_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.staff_assignments.group_staff_ids IS 'Aynı atama partisindeki tüm görevli personel id listesi (çoklu atama için).';

COMMIT;
