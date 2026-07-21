/**
 * Kimlik OCR durum / ad doğrulama golden testleri (jest yok — node ile çalışır).
 * Çalıştır: node scripts/test-kbs-ocr-status.cjs
 */

const OCR_LABEL_ONLY_NAME_RE =
  /^(?:SURNAME|SURNAMES|GIVEN|GIVEN\s*NAMES?|FORENAMES?|FIRST\s*NAMES?|FAMILY\s*NAMES?|NAME|NAMES|SOYAD[İI]?|SOYADI|AD[İI]|ADI|NOM|PRENOMS?|APELLIDOS?)$/i;

function sanitizePersonName(raw) {
  if (raw == null) return null;
  let t = String(raw)
    .replace(/</g, ' ')
    .replace(/>/g, ' ')
    .replace(/[|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || /^<+$/.test(t.replace(/\s/g, ''))) return null;
  t = t.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü\s'.-]/g, '').trim();
  if (t.length < 2) return null;
  if (/^\d+$/.test(t.replace(/\s/g, ''))) return null;
  return t.toUpperCase();
}

function isOcrLabelOnlyName(raw) {
  const s = sanitizePersonName(raw);
  if (!s) return true;
  return OCR_LABEL_ONLY_NAME_RE.test(s.replace(/\s+/g, ' ').trim());
}

function isUsablePersonName(raw) {
  const s = sanitizePersonName(raw);
  if (!s || s.length < 2) return false;
  if (isOcrLabelOnlyName(s)) return false;
  if (/^(?:VALORIA|HOTEL|OTEL|WIFI|RECEPTION|TABLE|MASA|MENU|WHATSAPP|INSTAGRAM|SPECIMEN|DOCUMENT|IDENTITY|CARD)$/i.test(s)) {
    return false;
  }
  return true;
}

function hasPlausibleDoc(docNumber, documentType) {
  const raw = (docNumber ?? '').trim().toUpperCase();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, '');
  if (/^[1-9]\d{10}$/.test(digits) && !/[A-Z]/.test(raw.replace(/[^A-Z0-9]/g, ''))) return true;
  const alnum = raw.replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 5 || alnum.length > 14) return false;
  if (/[A-Z]/.test(alnum) && /\d/.test(alnum) && alnum.length >= 5) return true;
  if (/^\d{6,14}$/.test(digits)) return true;
  if (documentType === 'passport' && alnum.length >= 5) return true;
  return false;
}

function kbsCaptureHasReadableData(p) {
  if (!p || typeof p !== 'object') return false;
  if (isUsablePersonName(p.firstName) || isUsablePersonName(p.lastName)) return true;
  if (hasPlausibleDoc(p.documentNumber, p.documentType)) return true;
  if (p.birthDate || p.expiryDate || p.nationalityCode) return true;
  if (p.rawMrz) return true;
  if (p.gender === 'M' || p.gender === 'F' || p.gender === 'X') return true;
  return false;
}

function listCoreMissing(p) {
  const missing = [];
  if (!isUsablePersonName(p.firstName)) missing.push('Ad');
  if (!isUsablePersonName(p.lastName)) missing.push('Soyad');
  if (!hasPlausibleDoc(p.documentNumber, p.documentType)) missing.push('Kimlik / pasaport no');
  if (!p.birthDate) missing.push('Doğum tarihi');
  if (!p.nationalityCode) missing.push('Uyruk');
  if (!p.expiryDate) missing.push('Son kullanım tarihi');
  return missing;
}

function cardStatus(p, activelyReading = false) {
  if (!p) return null;
  const w = Array.isArray(p.warnings) ? p.warnings : [];
  if (listCoreMissing(p).length === 0) return { label: 'Tamam', tone: 'ok' };
  if (w.includes('ocr_manual_review')) return { label: 'Manuel kontrol', tone: 'warn' };
  const busy = w.includes('ocr_pending') || w.includes('ocr_processing');
  if (busy && activelyReading) return { label: 'Okunuyor…', tone: 'progress' };
  if (kbsCaptureHasReadableData(p) || w.includes('ocr_partial')) return { label: 'Eksik', tone: 'warn' };
  if (w.includes('ocr_failed') || busy || !kbsCaptureHasReadableData(p)) {
    return { label: 'Okunamadı', tone: 'muted' };
  }
  return null;
}

let failed = 0;
function assert(name, cond) {
  if (!cond) {
    failed += 1;
    console.error('FAIL:', name);
  } else {
    console.log('ok:', name);
  }
}

// 1) Boş parse readable değil (documentType tek başına yetmez)
assert(
  'empty id_card not readable',
  kbsCaptureHasReadableData({ documentType: 'id_card', warnings: [] }) === false
);

// 2) Sadece belge no → readable + Eksik
{
  const p = { documentType: 'id_card', documentNumber: '12345678901', firstName: null, lastName: null };
  assert('tc digits readable', kbsCaptureHasReadableData(p) === true);
  assert('tc digits status Eksik', cardStatus(p)?.label === 'Eksik');
}

// 3) Tam çekirdek → Tamam
{
  const p = {
    documentType: 'id_card',
    firstName: 'AHMET',
    lastName: 'YILMAZ',
    documentNumber: '12345678901',
    birthDate: '1990-01-01',
    nationalityCode: 'TC',
    expiryDate: '2030-01-01',
    warnings: [],
  };
  assert('core complete Tamam', cardStatus(p)?.label === 'Tamam');
}

// 4) Manuel review
assert(
  'manual review badge',
  cardStatus({ documentType: 'id_card', warnings: ['ocr_manual_review'] })?.label === 'Manuel kontrol'
);

// 5) Etiket isim değil
assert('SURNAME not usable', isUsablePersonName('SURNAME') === false);
assert('GIVEN NAMES not usable', isUsablePersonName('GIVEN NAMES') === false);
assert('AHMET usable', isUsablePersonName('AHMET') === true);
assert('VALORIA not usable', isUsablePersonName('VALORIA') === false);

// 6) Pasaport alfanümerik
assert('passport AP902390 ok', hasPlausibleDoc('AP902390', 'passport') === true);

// 7) partial warning
assert(
  'partial badge',
  cardStatus({
    documentType: 'passport',
    firstName: 'JOHN',
    warnings: ['ocr_partial'],
  })?.label === 'Eksik'
);

// 7b) Bayat Okunuyor → Okunamadı; yalnız aktif kuyrukta Okunuyor
assert(
  'stale pending not Okunuyor',
  cardStatus({ documentType: 'passport', warnings: ['ocr_pending'] })?.label === 'Okunamadı'
);
assert(
  'active queue shows Okunuyor',
  cardStatus({ documentType: 'passport', warnings: ['ocr_processing'] }, true)?.label === 'Okunuyor…'
);

// 8) 3 deneme sonrası manual — state machine simülasyonu
function nextStatus(attempt, coreReady, maxAttempts = 3) {
  if (coreReady) return 'succeeded';
  if (attempt >= maxAttempts) return 'manual_review';
  return 'partial';
}
assert('attempt1 partial', nextStatus(1, false) === 'partial');
assert('attempt2 partial', nextStatus(2, false) === 'partial');
assert('attempt3 manual', nextStatus(3, false) === 'manual_review');
assert('attempt2 success', nextStatus(2, true) === 'succeeded');

if (failed > 0) {
  console.error(`\n${failed} test(s) failed`);
  process.exit(1);
}
console.log('\nAll kbs OCR status tests passed.');
