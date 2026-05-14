-- Personel uygulamasında sözleşme onayları (size atanan) anında yenilensin: Realtime yayını

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'contract_acceptances'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.contract_acceptances;
  END IF;
END $$;
