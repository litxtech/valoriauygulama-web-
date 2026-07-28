-- Valoria sabit oda envanteri → ops.rooms (KBS) senkronu
-- Supabase SQL Editor'de Run.
--
-- Odalar:
--   101–106, 201–206, 301–306
--   B-101–B-107, B-201–B-204
-- Listedekiler aktif; diğerleri pasif.

BEGIN;

WITH hotel AS (
  SELECT id
  FROM ops.hotels
  WHERE code IN ('valoria-ops', 'valoria')
  ORDER BY CASE WHEN code = 'valoria-ops' THEN 0 ELSE 1 END
  LIMIT 1
),
wanted(room_number, floor) AS (
  VALUES
    ('101', '1'), ('102', '1'), ('103', '1'), ('104', '1'), ('105', '1'), ('106', '1'),
    ('201', '2'), ('202', '2'), ('203', '2'), ('204', '2'), ('205', '2'), ('206', '2'),
    ('301', '3'), ('302', '3'), ('303', '3'), ('304', '3'), ('305', '3'), ('306', '3'),
    ('B-101', '1'), ('B-102', '1'), ('B-103', '1'), ('B-104', '1'), ('B-105', '1'), ('B-106', '1'), ('B-107', '1'),
    ('B-201', '2'), ('B-202', '2'), ('B-203', '2'), ('B-204', '2')
)
INSERT INTO ops.rooms (hotel_id, room_number, floor, is_active)
SELECT h.id, w.room_number, w.floor, true
FROM hotel h
CROSS JOIN wanted w
ON CONFLICT (hotel_id, room_number) DO UPDATE
SET
  is_active = true,
  floor = EXCLUDED.floor;

-- Listede olmayan aktif odaları kapat (fazla / demo odalar)
UPDATE ops.rooms r
SET is_active = false
FROM ops.hotels h
WHERE r.hotel_id = h.id
  AND h.code IN ('valoria-ops', 'valoria')
  AND r.is_active = true
  AND r.room_number NOT IN (
    '101','102','103','104','105','106',
    '201','202','203','204','205','206',
    '301','302','303','304','305','306',
    'B-101','B-102','B-103','B-104','B-105','B-106','B-107',
    'B-201','B-202','B-203','B-204'
  );

COMMIT;

-- Doğrulama:
-- SELECT room_number, floor, is_active
-- FROM ops.rooms r
-- JOIN ops.hotels h ON h.id = r.hotel_id
-- WHERE h.code IN ('valoria-ops','valoria') AND r.is_active
-- ORDER BY room_number;
