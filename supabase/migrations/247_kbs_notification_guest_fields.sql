-- KBS Kimlik Bildirim formu ile uyum: misafir/belge ek alanları + MRZ parti (batch) anahtarı.
-- Tek otel (hotel_id) kapsamında; mobil + gateway bu kolonları kullanır.

BEGIN;

ALTER TABLE ops.guests
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS mother_name text;

COMMENT ON COLUMN ops.guests.father_name IS 'KBS opsiyonel: Baba adı (MRZ dışı, elle).';
COMMENT ON COLUMN ops.guests.mother_name IS 'KBS opsiyonel: Ana adı (MRZ dışı, elle).';

ALTER TABLE ops.guest_documents
  ADD COLUMN IF NOT EXISTS kbs_person_kind text
    CHECK (kbs_person_kind IS NULL OR kbs_person_kind IN ('tc_citizen', 'ykn_foreign', 'foreign')),
  ADD COLUMN IF NOT EXISTS usage_kind text NOT NULL DEFAULT 'konaklama'
    CHECK (usage_kind IN ('konaklama', 'gunluk', 'afetzede')),
  ADD COLUMN IF NOT EXISTS document_series text,
  ADD COLUMN IF NOT EXISTS plate_number text,
  ADD COLUMN IF NOT EXISTS guest_phone_submitted text,
  ADD COLUMN IF NOT EXISTS forward_dated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mrz_batch_key uuid;

COMMENT ON COLUMN ops.guest_documents.kbs_person_kind IS 'KBS Müşteri İşlemleri: tc_citizen | ykn_foreign | foreign';
COMMENT ON COLUMN ops.guest_documents.usage_kind IS 'Kullanım şekli: konaklama | gunluk | afetzede';
COMMENT ON COLUMN ops.guest_documents.document_series IS 'Belge seri no (T.C./YKN vb. KBS alanı).';
COMMENT ON COLUMN ops.guest_documents.plate_number IS 'Opsiyonel: şahsi araç plaka.';
COMMENT ON COLUMN ops.guest_documents.guest_phone_submitted IS 'Opsiyonel: 10 haneli telefon.';
COMMENT ON COLUMN ops.guest_documents.forward_dated IS 'İleri tarihli konaklama işareti.';
COMMENT ON COLUMN ops.guest_documents.mrz_batch_key IS 'Aynı partide sırayla MRZ okunan kayıtları gruplar.';

CREATE INDEX IF NOT EXISTS ops_guest_documents_mrz_batch_key_idx
  ON ops.guest_documents (hotel_id, mrz_batch_key)
  WHERE mrz_batch_key IS NOT NULL;

COMMIT;
