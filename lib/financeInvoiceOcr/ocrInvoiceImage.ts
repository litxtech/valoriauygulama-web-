/**
 * Fatura / not kağıdı OCR — tam sayfa, yüksek çözünürlük.
 * Kimlik MRZ kesiti kullanmaz (POS fiş hattı ile aynı motor).
 */
import { cleanupPosOcrText } from '@/lib/posReceiptInvoice/cleanupPosOcrText';
import { ocrPosReceiptImage } from '@/lib/posReceiptInvoice/ocrPosReceiptImage';

function scoreInvoiceOcrText(text: string): number {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length >= 2);
  if (!lines.length) return 0;
  let score = Math.min(50, lines.length * 2);
  const joined = text.toLowerCase();
  if (/(?:genel\s*)?toplam|ödenecek|odenecek|yekün|yekun|net\s*tutar/i.test(joined)) score += 40;
  if (/(?:fatura|irsaliye|borç|borc|fiyat|tutar|adet|malzeme)/i.test(joined)) score += 25;
  if (/(?:tl|try|₺)/i.test(joined)) score += 20;
  if (/\d{1,2}[./\-]\d{1,2}[./\-]\d{2,4}/.test(joined)) score += 15;
  const moneyHits = (joined.match(/\d+[.,]\d{2}/g) ?? []).length;
  score += Math.min(60, moneyHits * 6);
  const looseMoney = (joined.match(/\b\d{2,7}(?:[.,]\d{1,2})?\b/g) ?? []).length;
  score += Math.min(30, looseMoney * 2);
  return score;
}

/**
 * Tam sayfa OCR — el yazısı / not kağıdı / fatura fotoğrafı.
 * POS akıllı motorunu kullanır (ML Kit + expo, ölçek, döndürme).
 */
export async function ocrInvoiceImage(uri: string): Promise<{ text: string; engine: string; lines: string[] }> {
  try {
    const best = await ocrPosReceiptImage(uri);
    const cleaned = cleanupPosOcrText(best.text);
    if (cleaned.trim().length >= 8 && scoreInvoiceOcrText(cleaned) >= 20) {
      return {
        text: cleaned,
        engine: best.engine || 'invoice-ocr',
        lines: cleaned
          .split(/\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      };
    }
    // Zayıf sonuç olsa bile metin varsa döndür — parser toplamı çıkarabilir
    if (cleaned.trim()) {
      return {
        text: cleaned,
        engine: `${best.engine || 'invoice-ocr'}+weak`,
        lines: cleaned
          .split(/\n/)
          .map((l) => l.trim())
          .filter(Boolean),
      };
    }
  } catch {
    /* yedek */
  }

  // Yedek: genel belge OCR (expo / mlkit)
  const { ocrLinesFromImage, ocrLinesFromImageExpoOnly } = await import('@/lib/scanner/ocrLinesFromImage');
  try {
    const { lines, engine } = await ocrLinesFromImage(uri, { document: true, fast: false });
    const text = cleanupPosOcrText(lines.join('\n'));
    if (text.trim()) {
      return { text, engine, lines: text.split(/\n/).map((l) => l.trim()).filter(Boolean) };
    }
  } catch {
    /* */
  }
  const { lines, engine } = await ocrLinesFromImageExpoOnly(uri, { document: true, fast: false });
  const text = cleanupPosOcrText(lines.join('\n'));
  if (!text.trim()) {
    throw new Error('Belge metni okunamadı. Tüm sayfayı net, ışıklı ve dik çekin.');
  }
  return {
    text,
    engine,
    lines: text.split(/\n/).map((l) => l.trim()).filter(Boolean),
  };
}
