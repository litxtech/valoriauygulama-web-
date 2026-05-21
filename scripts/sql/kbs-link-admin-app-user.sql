-- Mevcut admin oturumunu ops.app_users ile bağla (KBS Ayarları kaydı için).
-- Yöntem A — E-posta ile (önerilen):
-- 1) Aşağıdaki e-postayı kendi admin hesabınızla değiştirin.
-- 2) SQL Editor’de çalıştırın.

BEGIN;

SELECT ops.bootstrap_demo_hotel('valoria-ops', 'Valoria Hotel (OPS)', '', 101, 8);

INSERT INTO ops.app_users (id, hotel_id, full_name, role, is_active, kbs_access_enabled)
SELECT
  u.id,
  h.id,
  COALESCE(s.full_name, u.email, 'Admin'),
  CASE WHEN s.role = 'manager' THEN 'manager' ELSE 'admin' END,
  true,
  true
FROM auth.users u
LEFT JOIN public.staff s ON s.auth_id = u.id AND s.is_active = true AND s.deleted_at IS NULL
CROSS JOIN ops.hotels h
WHERE h.code = 'valoria-ops'
  AND u.email = 'ADMIN_EPOSTA@ornek.com'  -- ← burayı değiştirin
LIMIT 1
ON CONFLICT (id) DO UPDATE SET
  hotel_id = EXCLUDED.hotel_id,
  role = EXCLUDED.role,
  is_active = true,
  kbs_access_enabled = true,
  full_name = COALESCE(EXCLUDED.full_name, ops.app_users.full_name);

COMMIT;

-- Yöntem B — UUID ile: Authentication → Users → User UID kopyala, kbs-ops-test-provision.sql kullanın.

-- Doğrulama:
-- SELECT au.id, au.role, au.is_active, h.code
-- FROM ops.app_users au
-- JOIN ops.hotels h ON h.id = au.hotel_id;
