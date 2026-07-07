/**
 * Expo web export sonrası KBS (çekilen kimlikler) panelini dist/kbs altına kopyalar.
 * valoria.tr/kbs → dist/kbs/index.html (Vite + React SPA, Supabase ile açılır).
 *
 * Supabase değerleri build sırasında EXPO_PUBLIC_SUPABASE_* / VITE_SUPABASE_* env'lerinden
 * gömülür (vite.config.ts). Sayfa parolası için (opsiyonel): VITE_ACCESS_CODE.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const kbsSrc = path.join(root, 'web-kbs');
const kbsDist = path.join(kbsSrc, 'dist');

if (!fs.existsSync(dist)) {
  console.error('[bundle-web-kbs] dist/ yok — önce expo export -p web çalıştırın.');
  process.exit(1);
}

// web-kbs bağımlılıkları + build (base: '/kbs/').
execSync('npm install --no-audit --no-fund', { cwd: kbsSrc, env: process.env, stdio: 'inherit' });
execSync('npm run build', { cwd: kbsSrc, env: process.env, stdio: 'inherit' });

if (!fs.existsSync(kbsDist)) {
  console.error('[bundle-web-kbs] web-kbs/dist üretilemedi.');
  process.exit(1);
}

const kbsOut = path.join(dist, 'kbs');
fs.rmSync(kbsOut, { recursive: true, force: true });
fs.cpSync(kbsDist, kbsOut, { recursive: true });

console.log('[bundle-web-kbs] dist/kbs hazır → valoria.tr/kbs');
