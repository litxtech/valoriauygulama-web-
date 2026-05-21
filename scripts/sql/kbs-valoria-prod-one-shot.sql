-- Valoria Production — SQL Editor'de TEK SEFERDE Run (PGRST106 bypass için 284 RPC dahil).

BEGIN;

SELECT ops.bootstrap_demo_hotel('valoria-ops', 'Valoria Hotel (OPS)', '', 101, 8);

INSERT INTO ops.app_users (id, hotel_id, full_name, role, is_active, kbs_access_enabled)
SELECT
  u.id,
  h.id,
  COALESCE(s.full_name, u.email, 'Admin'),
  'admin',
  true,
  true
FROM auth.users u
LEFT JOIN public.staff s ON s.auth_id = u.id AND s.is_active = true AND s.deleted_at IS NULL
CROSS JOIN ops.hotels h
WHERE h.code = 'valoria-ops'
  AND (
    u.id = '8eabcee5-44bb-47c9-b05c-c98d9503b171'::uuid
    OR u.email ILIKE 'support@litxtech.com'
  )
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  hotel_id = EXCLUDED.hotel_id,
  role = 'admin',
  is_active = true,
  kbs_access_enabled = true;

-- 284: public RPC (Edge ops expose olmadan çalışır) — migration dosyasının tamamını da çalıştırın:
-- supabase/migrations/284_public_kbs_edge_rpc.sql

COMMIT;

SELECT id, role FROM ops.app_users;
