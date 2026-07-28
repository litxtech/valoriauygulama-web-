/**
 * Valoria otel — temizlik / KBS için sabit oda envanteri.
 * Planla listesi bu numaralarla birebir hizalanır.
 */
export const VALORIA_FIXED_ROOM_NUMBERS = [
  '101',
  '102',
  '103',
  '104',
  '105',
  '106',
  '201',
  '202',
  '203',
  '204',
  '205',
  '206',
  '301',
  '302',
  '303',
  '304',
  '305',
  '306',
  'B-101',
  'B-102',
  'B-103',
  'B-104',
  'B-105',
  'B-106',
  'B-107',
  'B-201',
  'B-202',
  'B-203',
  'B-204',
] as const;

export type ValoriaFixedRoomNumber = (typeof VALORIA_FIXED_ROOM_NUMBERS)[number];

const VALORIA_ORG_SLUGS = new Set(['valoria', 'valoria-ops']);

export function isValoriaOrgSlug(slug: string | null | undefined): boolean {
  const s = (slug ?? '').trim().toLowerCase();
  return VALORIA_ORG_SLUGS.has(s);
}

/** Kat: 1xx→1, 2xx→2, 3xx→3, B-1xx→1, B-2xx→2 */
export function floorForValoriaRoom(roomNumber: string): number | null {
  const n = roomNumber.trim().toUpperCase();
  const m = n.match(/^(?:B-)?(\d)/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  return Number.isFinite(d) ? d : null;
}
