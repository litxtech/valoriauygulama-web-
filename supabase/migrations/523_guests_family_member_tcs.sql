-- Sözleşme onayı: aile fertleri T.C. kimlik numaraları
-- (Türk kimlik fotokopisi alınmadığı için onaylayan kişi yazar)
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS family_member_tcs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.guests.family_member_tcs IS
  'Sözleşme onayında yazılan aile fertleri: [{full_name, tc}]. Türk kimlik fotokopisi yerine kullanılır.';
