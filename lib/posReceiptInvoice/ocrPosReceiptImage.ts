import { cleanupPosOcrText } from '@/lib/posReceiptInvoice/cleanupPosOcrText';
import { ocrTextHasReceiptDate } from '@/lib/posReceiptInvoice/extractPosDate';
import {
  extractPaymentBank,
  extractReceiptNo,
  extractReceiptTotal,
} from '@/lib/posReceiptInvoice/extractPosFields';
import { ocrPosLinesFromMlKit } from '@/lib/posReceiptInvoice/ocrPosMlKit';
import { Image } from 'react-native';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export { cleanupPosOcrText };

type OcrMod = typeof import('@/lib/scanner/ocrLinesFromImage');
let ocrModPromise: Promise<OcrMod> | null = null;

function loadOcrMod(): Promise<OcrMod> {
  if (!ocrModPromise) ocrModPromise = import('@/lib/scanner/ocrLinesFromImage');
  return ocrModPromise;
}

async function prepareVariant(
  uri: string,
  opts: {
    targetShort: number;
    maxLong: number;
    compress: number;
    forceEncode?: boolean;
    rotate?: number;
    /** Üst kısım kırpma (0–1) — tarih genelde üstte */
    cropTopRatio?: number;
  }
): Promise<string> {
  try {
    let width = 0;
    let height = 0;
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        Image.getSize(uri, (w, h) => resolve({ width: w, height: h }), reject);
      });
      width = size.width;
      height = size.height;
    } catch {
      const out = await manipulateAsync(uri, opts.rotate ? [{ rotate: opts.rotate }] : [], {
        compress: opts.compress,
        format: SaveFormat.JPEG,
      });
      return out.uri;
    }

    const long = Math.max(width, height);
    const short = Math.min(width, height);
    const actions: (
      | { resize: { width?: number; height?: number } }
      | { rotate: number }
      | { crop: { originX: number; originY: number; width: number; height: number } }
    )[] = [];
    const { targetShort, maxLong, forceEncode, rotate, cropTopRatio } = opts;

    if (rotate) actions.push({ rotate });

    if (cropTopRatio && cropTopRatio > 0 && cropTopRatio < 1 && width > 0 && height > 0) {
      const cropH = Math.max(80, Math.floor(height * cropTopRatio));
      actions.push({
        crop: { originX: 0, originY: 0, width, height: cropH },
      });
      height = cropH;
    }

    const needsUpscale = short > 0 && short < targetShort;
    const needsDownscale = long > maxLong;

    if (!needsUpscale && !needsDownscale && !forceEncode && !rotate && !cropTopRatio) {
      return uri;
    }

    if (needsUpscale) {
      const scale = targetShort / short;
      const newLong = Math.round(long * scale);
      if (newLong > maxLong) {
        actions.push(width >= height ? { resize: { width: maxLong } } : { resize: { height: maxLong } });
      } else {
        actions.push(width <= height ? { resize: { width: targetShort } } : { resize: { height: targetShort } });
      }
    } else if (needsDownscale) {
      actions.push(width >= height ? { resize: { width: maxLong } } : { resize: { height: maxLong } });
    }

    const out = await manipulateAsync(uri, actions, {
      compress: opts.compress,
      format: SaveFormat.JPEG,
    });
    return out.uri;
  } catch {
    return uri;
  }
}

/** Birincil OCR hazırlığı — yüksek çözünürlük + kontrast koruması */
export async function preparePosReceiptImageUri(uri: string): Promise<string> {
  return prepareVariant(uri, {
    targetShort: 2000,
    maxLong: 4000,
    compress: 0.97,
    forceEncode: true,
  });
}

/** Depolama için küçült (OCR sonrası yükleme) */
export async function preparePosReceiptForUpload(uri: string): Promise<string> {
  return prepareVariant(uri, { targetShort: 1200, maxLong: 2000, compress: 0.72, forceEncode: true });
}

/** OCR modülünü önceden yükle (ekran açılışında) */
export function preloadPosOcrModule(): void {
  void loadOcrMod();
  void import('@/lib/posReceiptInvoice/ocrPosMlKit');
}

/** OCR kalite skoru — tutar + tarih + fiş no + banka ağırlıklı */
export function scoreOcrText(text: string): number {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);
  if (!lines.length) return 0;

  let score = Math.min(40, lines.length * 2);
  const joined = text.toLowerCase();
  if (
    /(?:ö|o)denecek|genel\s*t[o0]plam|yek[uü]n|islem\s*tutar|sat[iı][sş]\s*tutar|(?:^|\n)\s*t[o0]plam\b/i.test(
      joined
    )
  ) {
    score += 45;
  } else if (/toplam|tutar/.test(joined)) {
    score += 28;
  }
  if (/\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/.test(joined)) score += 20;
  if (/(?:tarih|date)/i.test(joined)) score += 15;
  if (/(?:tl|try|₺)/i.test(joined)) score += 20;
  if (/(?:kdv|vkn|fi[sş]|pos|kart)/i.test(joined)) score += 10;
  const moneyHits = (joined.match(/\d+[.,]\d{2}/g) ?? []).length;
  score += Math.min(50, moneyHits * 5);

  const total = extractReceiptTotal(lines);
  if (total != null) {
    score += 80;
    if (!Number.isInteger(total)) score += 25;
  }
  if (ocrTextHasReceiptDate(text)) score += 55;
  if (extractReceiptNo(lines, joined)) score += 30;
  if (extractPaymentBank(joined, lines)) score += 25;

  return score;
}

type EngineResult = {
  lines: string[];
  engine: string;
  text: string;
  score: number;
  hasTotal: boolean;
  hasDate: boolean;
  lineCount: number;
};

function toResult(engine: string, text: string): EngineResult {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const score = scoreOcrText(text);
  return {
    lines,
    engine,
    text,
    score,
    hasTotal: extractReceiptTotal(lines) != null,
    hasDate: ocrTextHasReceiptDate(text),
    lineCount: lines.length,
  };
}

/** Tutar + tarih birlikte yeterli olmalı; tarih yoksa erken çıkma */
function isGoodEnough(r: EngineResult): boolean {
  return r.hasTotal && r.hasDate && r.lineCount >= 4 && r.score >= 120;
}

async function runMlKitPos(
  prepared: string,
  quality: boolean
): Promise<EngineResult | null> {
  try {
    const r = await ocrPosLinesFromMlKit(prepared, { quality });
    if (!r?.lines.length) return null;
    const text = cleanupPosOcrText(r.lines.join('\n'));
    if (!text.trim()) return null;
    return toResult(r.engine, text);
  } catch {
    return null;
  }
}

async function runExpoPos(prepared: string): Promise<EngineResult | null> {
  try {
    const mod = await loadOcrMod();
    const r = await mod.ocrLinesFromImageExpoOnly(prepared, {
      document: true,
      fast: false,
      imagePrepared: true,
    });
    if (!r.lines.length) return null;
    const text = cleanupPosOcrText(r.lines.join('\n'));
    if (!text.trim()) return null;
    return toResult(r.engine, text);
  } catch {
    return null;
  }
}

function pickWinner(candidates: EngineResult[]): EngineResult | null {
  const list = candidates.filter(Boolean);
  if (!list.length) return null;
  return [...list].sort((a, b) => {
    const aBoth = a.hasTotal && a.hasDate ? 1 : 0;
    const bBoth = b.hasTotal && b.hasDate ? 1 : 0;
    if (bBoth !== aBoth) return bBoth - aBoth;
    if (a.hasTotal !== b.hasTotal) return a.hasTotal ? -1 : 1;
    if (a.hasDate !== b.hasDate) return a.hasDate ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return b.lineCount - a.lineCount;
  })[0];
}

function mergeResults(a: EngineResult | null, b: EngineResult | null): EngineResult | null {
  if (!a) return b;
  if (!b) return a;
  const lines = [...a.lines];
  const seen = new Set(a.lines.map((l) => l.toLowerCase()));
  for (const l of b.lines) {
    const k = l.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    lines.push(l);
  }
  const text = cleanupPosOcrText(lines.join('\n'));
  const merged = toResult(`${a.engine}+${b.engine}`, text);
  return pickWinner([a, b, merged]);
}

async function runSmartOcr(
  uri: string
): Promise<{ text: string; engine: string; lines: string[]; score: number }> {
  const engines: string[] = [];
  const prepared = await preparePosReceiptImageUri(uri);
  /** Closure ataması yüzünden `let best` daralmıyor → kutu kullan */
  const state: { best: EngineResult | null } = { best: null };

  const consider = (r: EngineResult | null, tag?: string) => {
    if (!r) return;
    engines.push(tag ? `${r.engine}+${tag}` : r.engine);
    state.best = pickWinner([state.best, r].filter((x): x is EngineResult => !!x));
  };

  const needsMore = () => !state.best || !isGoodEnough(state.best);
  const needsDateEscalate = () => !!state.best?.hasTotal && !state.best.hasDate;

  const mlFast = await runMlKitPos(prepared, false);
  consider(mlFast);
  if (state.best && isGoodEnough(state.best)) {
    return {
      text: state.best.text,
      engine: state.best.engine,
      lines: state.best.lines,
      score: state.best.score,
    };
  }

  if (needsMore()) {
    const mlQ = await runMlKitPos(prepared, true);
    consider(mlQ, 'q');
    state.best = mergeResults(state.best, mlQ) ?? state.best;
    if (state.best && isGoodEnough(state.best)) {
      return {
        text: state.best.text,
        engine: [...new Set(engines)].join('+'),
        lines: state.best.lines,
        score: state.best.score,
      };
    }
  }

  {
    const ex = await runExpoPos(prepared);
    consider(ex, 'expo');
    state.best = mergeResults(state.best, ex) ?? state.best;
    if (state.best && isGoodEnough(state.best)) {
      return {
        text: state.best.text,
        engine: [...new Set(engines)].join('+'),
        lines: state.best.lines,
        score: state.best.score,
      };
    }
  }

  if (!state.best?.hasTotal || needsDateEscalate()) {
    try {
      const bigger = await prepareVariant(uri, {
        targetShort: 2600,
        maxLong: 5200,
        compress: 0.98,
        forceEncode: true,
      });
      const hiMl = await runMlKitPos(bigger, true);
      consider(hiMl, 'hi');
      state.best = mergeResults(state.best, hiMl) ?? state.best;
      if (!state.best?.hasTotal || !state.best.hasDate) {
        const hiEx = await runExpoPos(bigger);
        consider(hiEx, 'hi-expo');
        state.best = mergeResults(state.best, hiEx) ?? state.best;
      }
    } catch {
      /* ignore */
    }
  }

  if (needsDateEscalate() || !state.best?.hasDate) {
    try {
      const topStrip = await prepareVariant(uri, {
        targetShort: 2200,
        maxLong: 4400,
        compress: 0.97,
        forceEncode: true,
        cropTopRatio: 0.42,
      });
      const topMl = await runMlKitPos(topStrip, true);
      consider(topMl, 'top');
      state.best = mergeResults(state.best, topMl) ?? state.best;
      if (!state.best?.hasDate) {
        const topEx = await runExpoPos(topStrip);
        consider(topEx, 'top-expo');
        state.best = mergeResults(state.best, topEx) ?? state.best;
      }
    } catch {
      /* ignore */
    }
  }

  if (!state.best?.hasTotal || needsDateEscalate()) {
    for (const deg of [90, 270, 180]) {
      try {
        const rotated = await prepareVariant(uri, {
          targetShort: 1800,
          maxLong: 3600,
          compress: 0.94,
          forceEncode: true,
          rotate: deg,
        });
        const rotMl = await runMlKitPos(rotated, true);
        consider(rotMl, `rot${deg}`);
        state.best = mergeResults(state.best, rotMl) ?? state.best;
        if (state.best?.hasTotal && state.best.hasDate) break;
        const rotEx = await runExpoPos(rotated);
        consider(rotEx, `rot${deg}-expo`);
        state.best = mergeResults(state.best, rotEx) ?? state.best;
        if (state.best?.hasTotal && state.best.hasDate) break;
      } catch {
        /* sonraki açı */
      }
    }
  }

  if ((!state.best?.hasTotal || !state.best?.hasDate) && uri !== prepared) {
    try {
      const rawMl = await runMlKitPos(uri, true);
      consider(rawMl, 'raw');
      state.best = mergeResults(state.best, rawMl) ?? state.best;
      if (!state.best?.hasTotal || !state.best.hasDate) {
        const rawEx = await runExpoPos(uri);
        consider(rawEx, 'raw-expo');
        state.best = mergeResults(state.best, rawEx) ?? state.best;
      }
    } catch {
      /* ignore */
    }
  }

  if (!state.best?.text.trim()) {
    return { text: '', engine: '', lines: [], score: 0 };
  }

  return {
    text: state.best.text,
    engine: [...new Set(engines)].join('+') || state.best.engine || 'ocr',
    lines: state.best.lines,
    score: state.best.score,
  };
}

export async function ocrPosReceiptImageFast(
  uri: string
): Promise<{ text: string; engine: string; lines: string[] }> {
  const best = await runSmartOcr(uri);
  if (!best.text.trim()) {
    throw new Error('Fiş metni okunamadı');
  }
  return {
    text: best.text,
    engine: best.engine || 'ocr-fast',
    lines: best.lines,
  };
}

export async function ocrPosReceiptImage(uri: string): Promise<{ text: string; engine: string; lines: string[] }> {
  const best = await runSmartOcr(uri);
  if (!best.text.trim()) {
    throw new Error('Fiş metni okunamadı. Daha net, dik ve ışıklı fotoğraf çekin.');
  }
  return {
    text: best.text,
    engine: best.engine || 'ocr',
    lines: best.lines,
  };
}
