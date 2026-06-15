-- Mutfak gün sonu / finans RPC'leri için execute izni (403 → sonsuz yükleme)

BEGIN;

GRANT EXECUTE ON FUNCTION public.kitchen_day_closure_summary(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_cari_net_balance() TO authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_check_pos_mismatch(DATE) TO authenticated;

COMMIT;
