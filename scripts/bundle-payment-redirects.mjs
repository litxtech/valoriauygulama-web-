/**
 * Expo web export sonrası ödeme köprü sayfalarını dist/ altına yazar (yerel önizleme).
 * Canlıda Vercel /payment → api/payment edge proxy kullanır.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.error('[bundle-payment-redirects] dist/ yok — önce expo export -p web');
  process.exit(1);
}

function bridgeHtml(publicPath, title) {
  const publicBase = (
    process.env.EXPO_PUBLIC_APP_URL ||
    process.env.PAYMENT_PUBLIC_BASE_URL ||
    'https://valoria.tr'
  ).replace(/\/$/, '');
  const targetBase = `${publicBase}/${publicPath}`;
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
    <p>Stripe güvenli ödeme sayfasına yönlendiriliyorsunuz…</p>
    <div class="spinner" aria-hidden="true"></div>
  </div>
</body>
</html>`;
}

function writePaymentBridge(dirName, qrDirName, singlePath, qrPath, singleTitle, qrTitle) {
  const baseDir = path.join(dist, dirName);
  const qrDir = path.join(baseDir, qrDirName);
  fs.mkdirSync(qrDir, { recursive: true });
  fs.writeFileSync(path.join(baseDir, 'index.html'), bridgeHtml(singlePath, singleTitle));
  fs.writeFileSync(path.join(qrDir, 'index.html'), bridgeHtml(qrPath, qrTitle));
}

writePaymentBridge('payment', 'qr', 'payment', 'payment/qr', 'Valoria — Ödeme', 'Valoria — Ödeme QR');
writePaymentBridge('odeme', 'qr', 'odeme', 'odeme/qr', 'Valoria — Ödeme', 'Valoria — Ödeme QR');

console.log('[bundle-payment-redirects] dist/payment + dist/odeme köprü sayfaları hazır');
