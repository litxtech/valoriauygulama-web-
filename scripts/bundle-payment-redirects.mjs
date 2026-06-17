/**
 * Expo web export sonrası ödeme köprü sayfalarını dist/ altına yazar.
 * Eski valoria.tr /payment/* linkleri → tam sayfa Supabase Edge yönlendirmes.
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

function bridgeHtml(edgeFunction, title) {
  const supabaseUrl = (
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ''
  ).replace(/\/$/, '');
  const edgeUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/${edgeFunction}` : '';

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
<title>${title}</title>
<meta name="robots" content="noindex"/>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0}
</style>
<script>
(function(){
  var edgeUrl=${JSON.stringify(edgeUrl)};
  var q=window.location.search||"";
  if(!q||(!new URLSearchParams(q).get("t")&&!new URLSearchParams(q).get("token"))){
    document.body.innerHTML="<p>Ödeme bağlantısı eksik.</p>";return;
  }
  if(!edgeUrl){document.body.innerHTML="<p>Ödeme servisi yapılandırılmamış.</p>";return;}
  window.location.replace(edgeUrl+q);
})();
</script>
</head>
<body>
  <p>Stripe güvenli ödeme sayfasına yönlendiriliyorsunuz…</p>
</body>
</html>`;
}

function writePaymentBridge(dirName, qrDirName, singleFn, qrFn, singleTitle, qrTitle) {
  const baseDir = path.join(dist, dirName);
  const qrDir = path.join(baseDir, qrDirName);
  fs.mkdirSync(qrDir, { recursive: true });
  fs.writeFileSync(path.join(baseDir, 'index.html'), bridgeHtml(singleFn, singleTitle));
  fs.writeFileSync(path.join(qrDir, 'index.html'), bridgeHtml(qrFn, qrTitle));
}

writePaymentBridge(
  'payment',
  'qr',
  'open-payment',
  'open-payment-qr',
  'Valoria — Ödeme',
  'Valoria — Ödeme QR'
);
writePaymentBridge(
  'odeme',
  'qr',
  'open-payment',
  'open-payment-qr',
  'Valoria — Ödeme',
  'Valoria — Ödeme QR'
);

console.log('[bundle-payment-redirects] dist/payment + dist/odeme köprü sayfaları hazır');
