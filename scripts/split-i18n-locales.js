/** Tek seferlik: i18n/index.ts içindeki dil bloklarını i18n/locales/*.ts dosyalarına ayırır. */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'i18n/index.ts');
const OUT_DIR = path.join(ROOT, 'i18n/locales');

const lines = fs.readFileSync(SRC, 'utf8').split('\n');

/** translation: { … } içindeki anahtar satırları (wrapper hariç) */
const ranges = {
  tr: [25, 1845],
  en: [1850, 3666],
  ar: [3671, 4611],
  de: [4616, 5514],
  fr: [5519, 6425],
  ru: [6430, 7318],
  es: [7323, 8233],
};

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const [code, [start, end]] of Object.entries(ranges)) {
  const body = lines.slice(start - 1, end).join('\n');
  const out = `/** @generated from i18n/index.ts — ${code} */\nconst translation = {\n${body}\n} as const;\n\nexport default translation as Record<string, string>;\n`;
  fs.writeFileSync(path.join(OUT_DIR, `${code}.ts`), out, 'utf8');
  console.log('wrote', code, end - start + 1, 'keys-lines');
}
