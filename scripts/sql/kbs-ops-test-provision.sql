-- KBS test / demo: OPS oteli + odalar + gateway için ops.app_users (admin).
-- Kolay yol: scripts/sql/kbs-link-admin-app-user.sql (e-posta ile)
-- veya Edge deploy sonrası ilk KBS Kaydet otomatik oluşturur (migration 282 + staff admin).
--
-- Manuel UUID:
-- 1) Supabase Dashboard → Authentication → Users: admin UUID kopyala
-- 2) YOUR_AUTH_USER_UUID değiştir
-- 3) SQL Editor'de çalıştır

BEGIN;

-- Demo otel (code = valoria-ops) ve örnek odalar
SELECT ops.bootstrap_demo_hotel(
  'valoria-ops',
  'Valoria Hotel (OPS KBS test)',
  '',
  101,
  8
);

-- JWT kullanıcısını bu otelde admin yap (KBS ayarları + gateway auth için zorunlu)
INSERT INTO ops.app_users (id, hotel_id, full_name, role, is_active)
SELECT
  'YOUR_AUTH_USER_UUID'::uuid,
  h.id,
  'KBS test admin',
  'admin',
  true
FROM ops.hotels h
WHERE h.code = 'valoria-ops'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  hotel_id = EXCLUDED.hotel_id,
  role = 'admin',
  is_active = true,
  full_name = COALESCE(EXCLUDED.full_name, ops.app_users.full_name);

COMMIT;

-- Doğrulama (ops.app_users satırı görünmeli):
-- SELECT au.id, au.role, h.code FROM ops.app_users au JOIN ops.hotels h ON h.id = au.hotel_id WHERE h.code = 'valoria-ops';
