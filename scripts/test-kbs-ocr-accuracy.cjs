/**
 * Pasaport/kimlik okuma doğruluk golden testleri.
 * Çalıştır: node scripts/test-kbs-ocr-accuracy.cjs
 */

function mrzCharValue(c) {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  if (c === '<') return 0;
  return -1;
}

function mrzComputeCheckDigit(data) {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = mrzCharValue(data[i].toUpperCase());
    if (v < 0) return -1;
    sum += v * weights[i % 3];
  }
  return sum % 10;
}

function mrzCheckDigitMatches(data, checkChar) {
  if (!/^[0-9]$/.test(checkChar)) return false;
  const expected = mrzComputeCheckDigit(data);
  if (expected < 0) return false;
  return expected === Number(checkChar);
}

/** TD3 sabit konum: index 10 = uyruk → doc = [0..9), check = [9] */
function extractDocNumberBeforeNat(line, natIndex) {
  const upper = line.toUpperCase();
  if (natIndex === 10) {
    const field = upper.slice(0, 9);
    const check = upper[9] ?? '';
    const doc = field.replace(/<+$/, '');
    if (doc.length >= 5 && mrzCheckDigitMatches(field, check)) return doc;
    if (doc.length >= 5 && /^[A-Z0-9]+$/.test(doc)) return doc;
  }
  const candidates = [];
  for (const fieldLen of [9, 8, 7, 6]) {
    const checkIdx = natIndex - 1;
    const start = checkIdx - fieldLen;
    if (start < 0 || checkIdx >= upper.length) continue;
    const field = upper.slice(start, checkIdx);
    const check = upper[checkIdx] ?? '';
    const doc = field.replace(/<+$/, '');
    if (doc.length < 5 || !/^[A-Z0-9]+$/.test(doc)) continue;
    let score = doc.length;
    if (fieldLen === 9 && mrzCheckDigitMatches(field.padEnd(9, '<'), check)) score += 40;
    candidates.push({ doc, score });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score || b.doc.length - a.doc.length);
  return candidates[0].doc;
}

function sanitizePersonName(raw) {
  if (raw == null) return null;
  let t = String(raw)
    .normalize('NFKC')
    .replace(/</g, ' ')
    .replace(/>/g, ' ')
    .replace(/[|/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || /^<+$/.test(t.replace(/\s/g, ''))) return null;
  t = t.replace(/([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])0([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])/g, '$1O$2');
  t = t.replace(/([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])1([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])/g, '$1I$2');
  t = t.replace(/([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])5([A-Za-zÀ-ÿÇĞİÖŞÜçğıöşü])/g, '$1S$2');
  if (/\d/.test(t)) return null;
  const beforeLen = t.replace(/\s/g, '').length;
  t = t
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\s'.-]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  const afterLen = t.replace(/\s/g, '').length;
  if (afterLen < 2) return null;
  if (beforeLen >= 4 && afterLen / beforeLen < 0.6) return null;
  return t.toLocaleUpperCase('tr-TR');
}

function looksLikePassportNo(docNumber) {
  const alnum = (docNumber ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (alnum.length < 6 || alnum.length > 12) return false;
  if (!/[A-Z]/.test(alnum) || !/\d/.test(alnum)) return false;
  if (/^[A-Z]{1,3}\d{4,9}$/.test(alnum)) return true;
  if (/^[A-Z]\d{6,9}$/.test(alnum)) return true;
  if (/^[A-Z0-9]{6,9}$/.test(alnum)) return true;
  return false;
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

// --- Check digit ---
{
  // FA5213328 → check digit hesapla, satır oluştur
  const field = 'FA5213328';
  const check = String(mrzComputeCheckDigit(field));
  assert('check digit 0-9', /^[0-9]$/.test(check));
  assert('check matches self', mrzCheckDigitMatches(field, check) === true);
  assert('check rejects wrong', mrzCheckDigitMatches(field, String((Number(check) + 1) % 10)) === false);
}

// --- B: belge no OCR onarımı (O/0) ---
{
  const CONFUSABLES = {
    O: ['0'], '0': ['O'], I: ['1'], L: ['1'], '1': ['I', 'L'],
    S: ['5'], '5': ['S'], B: ['8'], '8': ['B'], Z: ['2'], '2': ['Z'], G: ['6'], '6': ['G'],
  };
  function repairField(fieldRaw, checkDigit) {
    const field = fieldRaw.toUpperCase().padEnd(9, '<').slice(0, 9);
    if (mrzCheckDigitMatches(field, checkDigit)) {
      return { doc: field.replace(/<+$/, ''), repaired: false };
    }
    const hits = [];
    const seen = new Set();
    function walk(chars, idx, changes) {
      if (changes > 2) return;
      if (idx >= chars.length) {
        const f = chars.join('');
        if (seen.has(f)) return;
        seen.add(f);
        if (mrzCheckDigitMatches(f, checkDigit)) {
          hits.push({ field: f, doc: f.replace(/<+$/, ''), changes });
        }
        return;
      }
      walk(chars, idx + 1, changes);
      if (changes >= 2) return;
      const alts = CONFUSABLES[chars[idx]];
      if (!alts) return;
      for (const alt of alts) {
        const next = chars.slice();
        next[idx] = alt;
        walk(next, idx + 1, changes + 1);
      }
    }
    walk(field.split(''), 0, 0);
    hits.sort((a, b) => a.changes - b.changes);
    if (!hits.length) return null;
    const best = hits[0];
    const tier = hits.filter((h) => h.changes === best.changes);
    if (new Set(tier.map((h) => h.doc)).size > 1) return null;
    return { doc: best.doc, repaired: best.doc !== field.replace(/<+$/, '') };
  }

  const good = 'AB0123456';
  const check = String(mrzComputeCheckDigit(good));
  const corrupted = 'ABO123456'; // 0 → O
  assert('corrupted check fails', mrzCheckDigitMatches(corrupted, check) === false);
  const fixed = repairField(corrupted, check);
  assert('repair O→0 restores AB0123456', fixed && fixed.doc === 'AB0123456' && fixed.repaired === true);
  assert('already good not repaired', repairField(good, check).repaired === false);
}

// --- TD3 doc number: ilk karakter düşmesin ---
{
  const field = 'FA5213328';
  const check = String(mrzComputeCheckDigit(field));
  const line = `${field}${check}UZB9001011M3001010<<<<<<<<<<<<<<06`;
  // UZB at index 10
  assert('UZB at 10', line.slice(10, 13) === 'UZB');
  const doc = extractDocNumberBeforeNat(line, 10);
  assert('TD3 doc FA5213328 not A5213328', doc === 'FA5213328');
  assert('old bug A5213328 rejected', doc !== 'A5213328');
}

// --- Name sanitization ---
assert('MOHAMMED from M0HAMMED', sanitizePersonName('M0HAMMED') === 'MOHAMMED');
assert('JOSE from José', sanitizePersonName('José') === 'JOSE' || sanitizePersonName('José') === 'JOSÉ'.normalize('NFD').replace(/\p{M}/gu, '').toLocaleUpperCase('tr-TR'));
assert('digit garbage rejected', sanitizePersonName('AHMET123') === null);
assert('AHMET ok', sanitizePersonName('AHMET') === 'AHMET');
assert('SURNAME label null usable path', sanitizePersonName('SURNAME') === 'SURNAME');

// --- Passport number strict ---
assert('AP902390 passport ok', looksLikePassportNo('AP902390') === true);
assert('ABCDE not passport', looksLikePassportNo('ABCDE') === false);
assert('12345 not passport', looksLikePassportNo('12345') === false);
assert('P1234567 ok', looksLikePassportNo('P1234567') === true);

if (failed > 0) {
  console.error(`\n${failed} accuracy test(s) failed`);
  process.exit(1);
}
console.log('\nAll kbs OCR accuracy tests passed.');
