/** OCR satırını ICAO MRZ karakter kümesine yaklaştırır. */
export function normalizeMrzOcrLine(raw: string): string {
  return String(raw || '')
    .replace(/[\r\n\u2028\u2029]/g, '')
    .replace(/\s+/g, '')
    .toUpperCase()
    .replace(/«|»|‹|›/g, '<')
    .replace(/[|¦‖]/g, 'I')
    .replace(/[`'‘’"“”]/g, '')
    .replace(/[^A-Z0-9<]/g, '');
}

export function normalizeMrzOcrLines(lines: string[]): string[] {
  return lines.map(normalizeMrzOcrLine).filter((l) => l.length >= 18);
}

/** Checksum başarısızsa OCR karışıklıkları için birkaç varyant dene. */
export function mrzOcrAmbiguityVariants(mrz: string): string[] {
  const base = mrz
    .replace(/\r/g, '\n')
    .split('\n')
    .map((l) => normalizeMrzOcrLine(l))
    .filter(Boolean)
    .join('\n');
  if (!base) return [];

  const variants = new Set<string>([base]);

  const swap0O = base
    .split('\n')
    .map((line) => {
      let out = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '0' && i > 0 && /[A-Z<]/.test(line[i - 1] ?? '')) out += 'O';
        else if (c === 'O' && i > 0 && /\d/.test(line[i - 1] ?? '')) out += '0';
        else out += c;
      }
      return out;
    })
    .join('\n');
  variants.add(swap0O);

  const swap1I = base.replace(/([0-9])I/g, '$11').replace(/I([0-9])/g, '1$1');
  variants.add(swap1I);

  const swap8B = base
    .split('\n')
    .map((line) => line.replace(/8(?=[A-Z<]{2})/g, 'B').replace(/B(?=\d)/g, '8'))
    .join('\n');
  variants.add(swap8B);

  const swap5S = base
    .split('\n')
    .map((line) => line.replace(/5(?=[A-Z])/g, 'S').replace(/S(?=\d{2})/g, '5'))
    .join('\n');
  variants.add(swap5S);

  const swap2Z = base
    .split('\n')
    .map((line) => line.replace(/2(?=[A-Z<]{2})/g, 'Z').replace(/Z(?=\d)/g, '2'))
    .join('\n');
  variants.add(swap2Z);

  const swap6G = base
    .split('\n')
    .map((line) => line.replace(/6(?=[A-Z])/g, 'G').replace(/G(?=\d)/g, '6'))
    .join('\n');
  variants.add(swap6G);

  const fixChevrons = base
    .split('\n')
    .map((line) =>
      line
        .replace(/K{2,}/g, (m) => '<'.repeat(m.length))
        .replace(/<{3,}/g, (m) => '<'.repeat(Math.min(m.length, 8)))
    )
    .join('\n');
  variants.add(fixChevrons);

  const dropSpaces = base.replace(/ /g, '');
  if (dropSpaces !== base.replace(/\n/g, '')) variants.add(dropSpaces);

  return [...variants];
}
