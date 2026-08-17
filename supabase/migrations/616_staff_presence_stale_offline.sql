-- Stuck staff.is_online flags: önceki presence bug'ı yüzünden herkes çevrim içi kalıyordu.
-- Uygulamada olmayan / uzun süredir last_active güncellenmeyen personeli çevrim dışı yap.

UPDATE public.staff
SET is_online = false
WHERE is_online IS TRUE
  AND (
    last_active IS NULL
    OR last_active < (timezone('utc', now()) - interval '3 minutes')
  );
