/**
 * Expo web export sonrası ödeme köprü sayfalarını dist/ altına yazar.
 * valoria.tr/odeme ve /odeme/qr → Supabase Edge (Expo SPA yerine)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

const supabaseUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  ''
).replace(/\/$/, '');

if (!fs.existsSync(dist)) {
  console.error('[bundle-payment-redirects] dist/ yok — önce expo export -p web');
  process.exit(1);
}

if (!supabaseUrl) {
  console.warn('[bundle-payment-redirects] SUPABASE_URL yok — köprü sayfaları atlandı');
  process.exit(0);
}

function bridgeHtml(edgeFunction, title) {
  const targetBase = `${supabaseUrl}/functions/v1/${edgeFunction}`;
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${title}</title>
<meta name="robots" content="noindex"/>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0}
  .box{text-align:center;padding:24px}
  .spinner{width:32px;height:32px;border:3px solid #334155;border-top-color:#635bff;border-radius:50%;animation:spin .8s linear infinite;margin:16px auto}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
<script>
(function(){
  var base=${JSON.stringify(targetBase)};
  var q=window.location.search||"";
  if(!q){var p=new URLSearchParams(window.location.search);if(!p.get("t")){document.body.innerHTML="<p>Ödeme bağlantısı eksik.</p>";return;}}
  window.location.replace(base+q);
})();
</script>
</head>
<body>
  <div class="box">
    <p>Güvenli ödeme sayfasına yönlendiriliyorsunuz…</p>
    <div class="spinner" aria-hidden="true"></div>
  </div>
</body>
</html>`;
}

const odemeDir = path.join(dist, 'odeme');
const qrDir = path.join(odemeDir, 'qr');
fs.mkdirSync(qrDir, { recursive: true });
fs.writeFileSync(path.join(odemeDir, 'index.html'), bridgeHtml('open-payment', 'Valoria — Ödeme'));
fs.writeFileSync(path.join(qrDir, 'index.html'), bridgeHtml('open-payment-qr', 'Valoria — Ödeme QR'));

console.log('[bundle-payment-redirects] dist/odeme/index.html + dist/odeme/qr/index.html hazır');
