/**
 * Expo web export sonrası kahvaltı QR sayfasını dist/ altına yazar.
 * valoria.tr/breakfast-pass → dist/breakfast-pass/index.html (Expo SPA değil)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.error('[bundle-breakfast-pass] dist/ yok — önce expo export -p web');
  process.exit(1);
}

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
  /\/$/,
  ''
);
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const outDir = path.join(dist, 'breakfast-pass');
fs.mkdirSync(outDir, { recursive: true });

const configJs = `window.__VALORIA_BREAKFAST_PASS__=${JSON.stringify({ supabaseUrl: ${JSON.stringify(supabaseUrl)}, anonKey: ${JSON.stringify(anonKey)} })};`;
fs.writeFileSync(path.join(dist, 'breakfast-pass-config.js'), configJs, 'utf8');

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#eef2f7" />
  <meta name="robots" content="noindex" />
  <title>Valoria · Misafir kahvaltı bileti</title>
  <script src="/breakfast-pass-config.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #eef2f7;
      color: #0f172a;
      min-height: 100vh;
    }
    .wrap { max-width: 760px; margin: 0 auto; padding: 20px 16px 32px; }
    .eyebrow { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #64748b; }
    h1 { margin: 6px 0 4px; font-size: 28px; font-weight: 800; }
    .sub { margin: 0 0 20px; color: #64748b; font-size: 14px; line-height: 1.5; }
    .card {
      background: #fff;
      border-radius: 18px;
      border: 1px solid rgba(15, 23, 42, 0.08);
      box-shadow: 0 4px 24px rgba(15, 23, 42, 0.06);
      overflow: hidden;
    }
    .hero {
      background: linear-gradient(145deg, #14532d, #166534);
      color: #fff;
      padding: 24px 20px;
      text-align: center;
    }
    .hero-label { font-size: 12px; opacity: 0.75; font-weight: 700; text-transform: uppercase; }
    .hero-name { font-size: 30px; font-weight: 800; margin: 8px 0 0; word-break: break-word; }
    .hero-room { color: #bbf7d0; font-size: 16px; font-weight: 600; margin-top: 8px; }
    .banner { padding: 12px 16px; border-radius: 12px; margin-bottom: 14px; font-weight: 700; font-size: 14px; }
    .section { padding: 16px 18px; border-top: 1px solid #e2e8f0; }
    .section h2 {
      margin: 0 0 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 14px; }
    .row span:first-child { color: #64748b; flex-shrink: 0; }
    .row span:last-child { font-weight: 700; text-align: right; word-break: break-word; }
    .empty, .loading { text-align: center; padding: 36px 24px; }
    .empty h2, .loading h2 { margin: 0 0 8px; font-size: 20px; }
    .empty p, .loading p { margin: 0; color: #64748b; line-height: 1.6; }
    .spinner {
      width: 36px; height: 36px; border: 3px solid #dcfce7; border-top-color: #166534;
      border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 12px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .ok {
      margin-top: 14px;
      background: #dcfce7;
      border: 1px solid #86efac;
      color: #166534;
      border-radius: 12px;
      padding: 14px;
      text-align: center;
      font-weight: 800;
    }
    .foot { margin-top: 18px; text-align: center; color: #94a3b8; font-size: 12px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="eyebrow">Valoria · Partner kahvaltı</div>
    <h1 id="page-title">Misafir kahvaltı bileti</h1>
    <p class="sub" id="page-sub">QR ile açılan misafir bilgi kartı</p>
    <div id="content">
      <div class="card loading">
        <div class="spinner"></div>
        <h2>Yükleniyor</h2>
        <p>Misafir bilgileri getiriliyor…</p>
      </div>
    </div>
    <p class="foot">Bu bilet partner otel tarafından oluşturulmuştur. Sorularınız için resepsiyona başvurun.</p>
  </div>
  <script>
(function () {
  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    var p = String(iso).split('-').map(Number);
    if (p.length < 3 || !p[0] || !p[1] || !p[2]) return String(iso);
    return new Date(p[0], p[1]-1, p[2]).toLocaleDateString('tr-TR', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  }
  function fmtDt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'Europe/Istanbul' });
  }
  function statusLabel(s) {
    if (s === 'redeemed') return 'Onaylandı';
    if (s === 'cancelled') return 'İptal';
    return 'Bekliyor';
  }
  function statusBanner(s) {
    if (s === 'redeemed') return { text:'Kahvaltı onaylandı', bg:'#dcfce7', color:'#166534' };
    if (s === 'cancelled') return { text:'Bilet iptal edildi', bg:'#f1f5f9', color:'#64748b' };
    return { text:'Resepsiyon onayı bekliyor', bg:'#fef3c7', color:'#b45309' };
  }
  function rowHtml(items) {
    return items.map(function (r) {
      return '<div class="row"><span>' + esc(r[0]) + '</span><span>' + esc(r[1]) + '</span></div>';
    }).join('');
  }
  function showError(title, msg) {
    document.getElementById('page-title').textContent = title;
    document.getElementById('page-sub').textContent = msg;
    document.getElementById('content').innerHTML =
      '<div class="card empty"><h2>' + esc(title) + '</h2><p>' + esc(msg) + '</p></div>';
  }
  function renderPass(pass) {
    var status = String(pass.status || 'pending');
    var banner = statusBanner(status);
    document.getElementById('page-title').textContent = pass.guestName || 'Misafir kahvaltı bileti';
    var rows = [
      ['Kahvaltı tarihi', fmtDate(pass.recordDate)],
      ['Durum', statusLabel(status)],
      ['Bilet oluşturma', fmtDt(pass.createdAt)]
    ];
    if (pass.redeemedAt) rows.push(['Resepsiyon onayı', fmtDt(pass.redeemedAt)]);
    var hotelRows = [['Otel adı', pass.partnerHotelName || '—']];
    if (pass.partnerHotelCity) hotelRows.push(['Şehir', pass.partnerHotelCity]);
    if (pass.partnerHotelContact) hotelRows.push(['Yetkili', pass.partnerHotelContact]);
    if (pass.partnerHotelPhone) hotelRows.push(['Telefon', pass.partnerHotelPhone]);
    document.getElementById('content').innerHTML =
      '<div class="banner" style="background:' + banner.bg + ';color:' + banner.color + '">' + esc(banner.text) + '</div>' +
      '<div class="card"><div class="hero"><div class="hero-label">Misafir</div><div class="hero-name">' + esc(pass.guestName) + '</div>' +
      (pass.roomNumber ? '<div class="hero-room">Oda ' + esc(pass.roomNumber) + '</div>' : '') +
      '</div><div class="section"><h2>Kahvaltı bilgileri</h2>' + rowHtml(rows) +
      '</div><div class="section"><h2>Partner otel</h2>' + rowHtml(hotelRows) + '</div></div>' +
      (status === 'redeemed' ? '<div class="ok">✓ Misafir kahvaltı yapabilir</div>' : '');
  }

  var params = new URLSearchParams(window.location.search || '');
  var token = (params.get('token') || params.get('t') || '').trim();
  if (!token) {
    showError('Geçersiz bağlantı', 'QR kodunda bilet bilgisi bulunamadı.');
    return;
  }

  var cfg = window.__VALORIA_BREAKFAST_PASS__ || {};
  if (!cfg.supabaseUrl || !cfg.anonKey) {
    showError('Yapılandırma hatası', 'Sunucu ayarları eksik. Lütfen daha sonra tekrar deneyin.');
    return;
  }

  fetch(cfg.supabaseUrl + '/rest/v1/rpc/breakfast_guest_pass_public_lookup', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: cfg.anonKey,
      Authorization: 'Bearer ' + cfg.anonKey
    },
    body: JSON.stringify({ p_token: token })
  })
    .then(function (res) {
      return res.text().then(function (text) {
        if (!res.ok) {
          var hint = text.indexOf('breakfast_guest_pass_public_lookup') >= 0
            ? 'Veritabanı migration uygulanmamış olabilir (527_breakfast_guest_pass_public_lookup.sql).'
            : (text.slice(0, 180) || ('HTTP ' + res.status));
          throw new Error(hint);
        }
        try { return text ? JSON.parse(text) : null; } catch (e) { return null; }
      });
    })
    .then(function (data) {
      if (!data) {
        showError('Bilet bulunamadı', 'QR kodu geçersiz, iptal edilmiş veya süresi dolmuş olabilir.');
        return;
      }
      renderPass(data);
    })
    .catch(function (err) {
      showError('Yüklenemedi', err && err.message ? err.message : 'Bağlantı hatası');
    });
})();
  </script>
</body>
</html>`;

fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
console.log('[bundle-breakfast-pass] dist/breakfast-pass/index.html + breakfast-pass-config.js hazır');
