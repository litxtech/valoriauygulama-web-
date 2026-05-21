const fs = require('fs');
const path = require('path');

const lines = fs.readFileSync(path.join(__dirname, '../i18n/index.ts'), 'utf8').split('\n');

function keysInRange(startLine, endLine) {
  const keys = {};
  const slice = lines.slice(startLine - 1, endLine);
  let currentKey = null;
  let buf = '';
  let inString = false;
  let quote = '';

  for (const line of slice) {
    const keyMatch = line.match(/^\s+(\w+):\s*(.*)$/);
    if (keyMatch && !inString) {
      if (currentKey && buf) keys[currentKey] = buf;
      currentKey = keyMatch[1];
      const rest = keyMatch[2].trim();
      if (rest.startsWith("'")) {
        quote = "'";
        buf = rest.slice(1);
        if (rest.endsWith("',") && !rest.endsWith("\\',")) {
          keys[currentKey] = buf.slice(0, -2).replace(/\\'/g, "'");
          currentKey = null;
          buf = '';
        } else {
          inString = true;
        }
      } else if (rest.startsWith('"')) {
        quote = '"';
        buf = rest.slice(1);
        if (rest.endsWith('",')) {
          keys[currentKey] = buf.slice(0, -2);
          currentKey = null;
          buf = '';
        } else {
          inString = true;
        }
      } else {
        currentKey = null;
      }
      continue;
    }
    if (inString && currentKey) {
      buf += (buf ? '\n' : '') + line.trim();
      const endSingle = buf.endsWith("',");
      const endDouble = buf.endsWith('",');
      if ((quote === "'" && endSingle) || (quote === '"' && endDouble)) {
        keys[currentKey] = buf.slice(0, -2).replace(/\\'/g, "'");
        currentKey = null;
        buf = '';
        inString = false;
      }
    }
  }
  return keys;
}

const tr = keysInRange(23, 1492);
const en = keysInRange(1496, 2960);
const ar = keysInRange(2964, 3900);

const missAr = Object.keys(tr).filter((k) => !(k in ar));
const missEn = Object.keys(tr).filter((k) => !(k in en));

console.log('tr', Object.keys(tr).length);
console.log('en', Object.keys(en).length, 'missing vs tr', missEn.length);
console.log('ar', Object.keys(ar).length, 'missing vs tr', missAr.length);

fs.writeFileSync(
  path.join(__dirname, '../i18n/_ar_gap_en.json'),
  JSON.stringify(missAr.map((k) => ({ key: k, en: en[k] || tr[k] })), null, 2)
);
