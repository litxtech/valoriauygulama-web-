-- Sözleşme onayı: giriş yapmış (personel/misafir) tarayıcıda da INSERT (anon dışı oturumlarda 42501 önlenir)

BEGIN;

DROP POLICY IF EXISTS "contract_acceptances_insert_authenticated" ON public.contract_acceptances;
CREATE POLICY "contract_acceptances_insert_authenticated"
ON public.contract_acceptances FOR INSERT TO authenticated
WITH CHECK (true);

COMMIT;
