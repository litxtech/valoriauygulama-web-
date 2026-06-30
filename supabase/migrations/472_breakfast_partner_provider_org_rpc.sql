-- Partner modülü: provider işletme id (admin istemci)

BEGIN;

GRANT EXECUTE ON FUNCTION public.breakfast_partner_provider_org_id() TO authenticated;

COMMIT;
