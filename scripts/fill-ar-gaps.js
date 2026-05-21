/**
 * Eksik Arapça anahtarları EN metinden çevirip i18n/arGaps.ts üretir.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const indexPath = path.join(ROOT, 'i18n/index.ts');
const outPath = path.join(ROOT, 'i18n/arGaps.ts');

const lines = fs.readFileSync(indexPath, 'utf8').split('\n');

function parseBlock(startLine, endLine) {
  const out = {};
  const slice = lines.slice(startLine - 1, endLine - 1);
  let key = null;
  let val = '';
  let collecting = false;

  for (const line of slice) {
    if (!collecting) {
      const m = line.match(/^\s{6}(\w+):\s*'(.*)$/);
      if (m) {
        key = m[1];
        const rest = m[2];
        if (rest.endsWith("',")) {
          out[key] = rest.slice(0, -2).replace(/\\'/g, "'");
          key = null;
        } else {
          val = rest;
          collecting = true;
        }
      }
      continue;
    }
    if (key) {
      if (line.trim().endsWith("',")) {
        val += '\n' + line.trim().slice(0, -2);
        out[key] = val.replace(/\\'/g, "'");
        key = null;
        val = '';
        collecting = false;
      } else {
        val += '\n' + line.trim();
      }
    }
  }
  return out;
}

const tr = parseBlock(24, 1494);
const en = parseBlock(1496, 2962);
const ar = parseBlock(2964, 3902);

const missing = Object.keys(tr).filter((k) => !(k in ar));
console.log('missing ar keys:', missing.length);

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

async function translate(text) {
  if (!text?.trim()) return text;
  const url =
    'https://api.mymemory.translated.net/get?q=' +
    encodeURIComponent(text.slice(0, 480)) +
    '&langpair=en|ar';
  const res = await fetch(url);
  const json = await res.json();
  return json?.responseData?.translatedText || text;
}

async function main() {
  const gaps = {};
  let i = 0;
  for (const key of missing) {
    const source = en[key] || tr[key];
    if (!source) continue;
    gaps[key] = await translate(source);
    i++;
    if (i % 20 === 0) console.log(i, '/', missing.length);
    await new Promise((r) => setTimeout(r, 400));
  }

  const header =
    '/** Auto-generated — scripts/fill-ar-gaps.js */\nexport const arGaps: Record<string, string> = {\n';
  const body = Object.entries(gaps)
    .map(([k, v]) => `  ${k}: '${esc(v)}',`)
    .join('\n');
  fs.writeFileSync(outPath, header + body + '\n};\n', 'utf8');
  console.log('wrote', Object.keys(gaps).length, 'keys to', outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
