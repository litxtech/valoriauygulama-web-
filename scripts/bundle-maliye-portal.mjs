/**
 * Expo web export sonrası maliye statik portalını dist/ altına kopyalar.
 * valoria.tr/maliye → dist/maliye/index.html (Expo SPA yerine gerçek HTML)
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const maliyeSrc = path.join(root, 'netlify-maliye');

if (!fs.existsSync(dist)) {
  console.error('[bundle-maliye-portal] dist/ yok — önce expo export -p web çalıştırın.');
  process.exit(1);
}

execSync('node scripts/gen-maliye-config.mjs', {
  cwd: maliyeSrc,
  env: process.env,
  stdio: 'inherit',
});

const maliyeOut = path.join(dist, 'maliye');
fs.mkdirSync(maliyeOut, { recursive: true });
fs.copyFileSync(path.join(maliyeSrc, 'index.html'), path.join(maliyeOut, 'index.html'));
fs.copyFileSync(path.join(maliyeSrc, 'maliye-config.js'), path.join(dist, 'maliye-config.js'));

console.log('[bundle-maliye-portal] dist/maliye/index.html + dist/maliye-config.js hazır');
