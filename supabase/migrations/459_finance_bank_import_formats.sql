-- Banka içe aktarma: xml ve pdf formatları

BEGIN;

ALTER TABLE public.finance_bank_import_batches
  DROP CONSTRAINT IF EXISTS finance_bank_import_batches_file_format_check;

ALTER TABLE public.finance_bank_import_batches
  ADD CONSTRAINT finance_bank_import_batches_file_format_check
  CHECK (file_format IN ('mt940', 'csv', 'xml', 'pdf', 'unknown'));

COMMIT;
