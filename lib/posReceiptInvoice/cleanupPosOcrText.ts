/** OCR karakter hatalarını fiş metninde yumuşat (RN bağımsız) */
export function cleanupPosOcrText(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[|]/g, 'I')
    .replace(/\bT0PLAM\b/gi, 'TOPLAM')
    .replace(/\bTOFLAM\b/gi, 'TOPLAM')
    .replace(/\bTOPIAM\b/gi, 'TOPLAM')
    .replace(/\bTOP1AM\b/gi, 'TOPLAM')
    .replace(/\bT0P1AM\b/gi, 'TOPLAM')
    .replace(/\bTOPLAN\b/gi, 'TOPLAM')
    .replace(/\bTOPLAH\b/gi, 'TOPLAM')
    .replace(/\bTOPLAMI\b/gi, 'TOPLAM')
    .replace(/\b7OPLAM\b/gi, 'TOPLAM')
    .replace(/\bTOP\.?\s*LAM\b/gi, 'TOPLAM')
    .replace(/\bGENEL\s*T0PLAM\b/gi, 'GENEL TOPLAM')
    .replace(/\bGENELTOPLAM\b/gi, 'GENEL TOPLAM')
    .replace(/\bODENECEK\b/gi, 'ÖDENECEK')
    .replace(/\bODENEGEK\b/gi, 'ÖDENECEK')
    .replace(/\bODENFCEK\b/gi, 'ÖDENECEK')
    .replace(/\bODENECFK\b/gi, 'ÖDENECEK')
    .replace(/\bODENECEKTUTAR\b/gi, 'ÖDENECEK TUTAR')
    .replace(/\bODEME\b/gi, 'ÖDEME')
    // Banka POS — satış / işlem tutarı
    .replace(/\bISLEMTUTARI\b/gi, 'ISLEM TUTARI')
    .replace(/\b[İI][ŞS]LEMTUTARI\b/gi, 'ISLEM TUTARI')
    .replace(/\b1SLEM\s*TUTAR[İI1]?\b/gi, 'ISLEM TUTARI')
    .replace(/\bSATISTUTARI\b/gi, 'SATIS TUTARI')
    .replace(/\bSAT[İI1][ŞS5]TUTARI?\b/gi, 'SATIS TUTARI')
    .replace(/\bSAT[İI1][ŞS5]\s*TUTAR[İI1]?\b/gi, 'SATIS TUTARI')
    .replace(/\bSAT[İI1][ŞS5]\s*TUTAP\b/gi, 'SATIS TUTARI')
    .replace(/\bTUTAP\b/gi, 'TUTAR')
    .replace(/\bTUTAR1\b/gi, 'TUTARI')
    .replace(/\bSALES?\s*AMOUNT\b/gi, 'SATIS TUTARI')
    .replace(/\bTRANSACTION\s*AMOUNT\b/gi, 'ISLEM TUTARI')
    .replace(/\bAMOUNT\s*[:.]?\s*(?=[\d])/gi, 'TUTAR ')
    // Müşteri / işyeri etiketleri
    .replace(/\bM[ÜU][ŞS]TER[İI]\b/gi, 'MUSTERI')
    .replace(/\bCARD\s*HOLDER\b/gi, 'MUSTERI')
    .replace(/\bKART\s*HAM[İI]L[İI]\b/gi, 'MUSTERI')
    .replace(/\b[ÜU]YE\s*[İI][ŞS]YER[İI]\b/gi, 'ISYERI')
    .replace(/\b[İI][ŞS]YER[İI]\s*AD[İI]\b/gi, 'ISYERI')
    .replace(/\bMERCHANT\b/gi, 'ISYERI')
    .replace(/\b[ÜU]NVAN\b/gi, 'ISYERI')
    .replace(
      /\b(TOPLAM|ÖDENECEK|ODENECEK|GENEL\s*TOPLAM|SATIS\s*TUTARI?|ISLEM\s*TUTARI?|TUTAR)(?=[\d*])/gi,
      '$1 '
    )
    .replace(/\bFIS\s*NO\b/gi, 'FIS NO')
    .replace(/\bF[İI][ŞS]\s*NO\b/gi, 'FIS NO')
    .replace(/\bFlS\b/gi, 'FIS')
    .replace(/\bFlŞ\b/gi, 'FIS')
    .replace(/\bTAR!H\b/gi, 'TARIH')
    .replace(/\bTAR[İI1l!]H\b/gi, 'TARIH')
    .replace(/\bTARI[H8]\b/gi, 'TARIH')
    .replace(/\bTARIH\/SAAT\b/gi, 'TARIH')
    .replace(/\b[İI1][ŞS5]LEM\s*TAR[İI1l!]H[İI1]?\b/gi, 'ISLEM TARIHI')
    .replace(/\bFIS\s*TAR[İI1l!]H[İI1]?\b/gi, 'FIS TARIHI')
    .replace(/\bSLIP\s*DATE\b/gi, 'TARIH')
    .replace(/\bTRANSACTION\s*DATE\b/gi, 'TARIH')
    .replace(/\bDATE\b/gi, 'TARIH')
    // Yapışık: TARIH29.07.2026 / TARIH:29072026
    .replace(/\bTARIH\s*[:\-]?\s*(?=\d)/gi, 'TARIH ')
    .replace(/(\d)\s+([.,])\s+(\d{2})\b/g, '$1$2$3')
    .replace(/(\d{1,3})\s+(\d{3})\s*([.,])\s*(\d{2})\b/g, '$1.$2$3$4')
    .replace(/(\d{1,3})\s+(\d{3})\b(?!\d)/g, '$1.$2')
    .replace(/(\d{1,2})\s+(\d{3})\s*([.,])\s*(\d{2})\b/g, '$1.$2$3$4')
    .replace(/\*+([\d.,]+)/g, '$1')
    // Silik rakam: boşluklu binlik (7 000,50 / 1 250,75)
    .replace(/(\d{1,3})\s+(\d{3})\s*,\s*(\d{2})\b/g, '$1.$2,$3')
    // Yarım kesilen TL: "TI" "Tl" "T|" → TL
    .replace(/\bT[I|l]\b/g, 'TL')
    // Boşluklu / OCR kırık tarihler: 2 9 . 0 7 . 2 0 2 6 → 29.07.2026
    .replace(
      /(\d)\s+(\d)\s*[./\-]\s*(\d)\s+(\d)\s*[./\-]\s*(\d)\s+(\d)(?:\s+(\d)\s+(\d))?/g,
      (_, a, b, c, d, e, f, g, h) =>
        g != null && h != null ? `${a}${b}.${c}${d}.${e}${f}${g}${h}` : `${a}${b}.${c}${d}.${e}${f}`
    )
    .replace(/(\d{1,2})\s*[./\-]\s*(\d{1,2})\s*[./\-]\s*(\d{2,4})/g, '$1.$2.$3')
    // 29 07 2026 (yalnızca 1–2 + 1–2 + 2/4 hane boşluklu)
    .replace(/\b(\d{1,2})\s+([01]\d|1[0-2]|[1-9])\s+(20\d{2}|\d{2})\b/g, '$1.$2.$3')
    .replace(/(\d{1,2})\s*:\s*(\d{2})(?:\s*:\s*(\d{2}))?/g, (_, h, m, s) =>
      s ? `${h}:${m}:${s}` : `${h}:${m}`
    );
}

/** OCR satırlarını tutar çıkarımı için genişlet (birleşik etiket+tutar, sütunlu fiş) */
export function expandReceiptOcrLines(lines: string[]): string[] {
  const out: string[] = [];
  for (const raw of lines) {
    let line = raw
      .replace(/([A-Za-zÇĞİÖŞÜçğıöşü])([\d*])/g, '$1 $2')
      .replace(/([\d.,]+)([A-Za-zÇĞİÖŞÜçğıöşü]{2,})/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
    if (!line) continue;

    const col = line.match(/^(.{2,45}?)\s{2,}([\d*][\d\s.,]*(?:\s*(?:TL|TRY|₺))?)\s*$/i);
    if (col && /[\d,.]/.test(col[2])) {
      const label = col[1].trim();
      const amt = col[2].trim();
      if (label.length >= 2) out.push(label);
      if (amt.length >= 2) out.push(amt);
      continue;
    }

    const tabCol = line.match(/^(.+?)[\t|]{1,}([\d*][\d\s.,]+(?:\s*(?:TL|TRY|₺))?)\s*$/i);
    if (tabCol && /[\d,.]/.test(tabCol[2])) {
      out.push(tabCol[1].trim());
      out.push(tabCol[2].trim());
      continue;
    }

    out.push(line);
  }
  return out;
}
