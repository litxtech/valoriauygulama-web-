export const config = { runtime: 'edge' };

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateTr(isoDate) {
  if (!isoDate) return '—';
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return String(isoDate);
  return new Date(y, m - 1, d).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTimeTr(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Istanbul',
  });
}

function statusLabel(status) {
  if (status === 'redeemed') return 'Onaylandı';
  if (status === 'cancelled') return 'İptal';
  return 'Bekliyor';
}

function statusBanner(status) {
  if (status === 'redeemed') {
    return { text: 'Kahvaltı onaylandı', bg: '#dcfce7', color: '#166534' };
  }
  if (status === 'cancelled') {
    return { text: 'Bilet iptal edildi', bg: '#f1f5f9', color: '#64748b' };
  }
  return { text: 'Resepsiyon onayı bekliyor', bg: '#fef3c7', color: '#b45309' };
}

function renderPage({ title, subtitle, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#eef2f7" />
  <title>${escapeHtml(title)} · Valoria</title>
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
    .hero-name { font-size: 30px; font-weight: 800; margin: 8px 0 0; }
    .hero-room { color: #bbf7d0; font-size: 16px; font-weight: 600; margin-top: 8px; }
    .banner { padding: 12px 16px; border-radius: 12px; margin-bottom: 14px; font-weight: 700; font-size: 14px; }
    .section { padding: 16px 18px; border-top: 1px solid #e2e8f0; }
    .section:first-of-type { border-top: 0; }
    .section h2 {
      margin: 0 0 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: #64748b;
    }
    .row { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 14px; }
    .row span:first-child { color: #64748b; }
    .row span:last-child { font-weight: 700; text-align: right; }
    .empty { text-align: center; padding: 36px 24px; }
    .empty h2 { margin: 0 0 8px; font-size: 20px; }
    .empty p { margin: 0; color: #64748b; line-height: 1.6; }
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
    <h1>${escapeHtml(title)}</h1>
    <p class="sub">${escapeHtml(subtitle)}</p>
    ${bodyHtml}
    <p class="foot">Bu bilet partner otel tarafından oluşturulmuştur. Sorularınız için resepsiyona başvurun.</p>
  </div>
</body>
</html>`;
}

async function lookupPass(token, supabaseUrl, anonKey) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/breakfast_guest_pass_public_lookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ p_token: token }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Supabase ${res.status}`);
  }

  const data = await res.json();
  if (!data || typeof data !== 'object') return null;
  return data;
}

export default async function handler(request) {
  const url = new URL(request.url);
  const token = (url.searchParams.get('token') || url.searchParams.get('t') || '').trim();

  if (!token) {
    return new Response(
      renderPage({
        title: 'Geçersiz bağlantı',
        subtitle: 'QR kodunda bilet bilgisi bulunamadı.',
        bodyHtml: `<div class="card empty"><h2>Token yok</h2><p>Lütfen partner otelin verdiği güncel QR kodunu okutun.</p></div>`,
      }),
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return new Response(
      renderPage({
        title: 'Yapılandırma hatası',
        subtitle: 'Sunucu ayarları eksik.',
        bodyHtml: `<div class="card empty"><h2>Geçici hata</h2><p>Lütfen biraz sonra tekrar deneyin.</p></div>`,
      }),
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const pass = await lookupPass(token, supabaseUrl, anonKey);
    if (!pass) {
      return new Response(
        renderPage({
          title: 'Bilet bulunamadı',
          subtitle: 'QR kodu geçersiz, iptal edilmiş veya süresi dolmuş olabilir.',
          bodyHtml: `<div class="card empty"><h2>Kayıt yok</h2><p>Partner otelden yeni bir QR oluşturulması gerekebilir.</p></div>`,
        }),
        { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
      );
    }

    const status = String(pass.status ?? 'pending');
    const banner = statusBanner(status);
    const rows = [
      ['Kahvaltı tarihi', formatDateTr(pass.recordDate)],
      ['Durum', statusLabel(status)],
      ['Bilet oluşturma', formatDateTimeTr(pass.createdAt)],
    ];
    if (pass.redeemedAt) rows.push(['Resepsiyon onayı', formatDateTimeTr(pass.redeemedAt)]);

    const hotelRows = [['Otel adı', pass.partnerHotelName || '—']];
    if (pass.partnerHotelCity) hotelRows.push(['Şehir', pass.partnerHotelCity]);
    if (pass.partnerHotelContact) hotelRows.push(['Yetkili', pass.partnerHotelContact]);
    if (pass.partnerHotelPhone) hotelRows.push(['Telefon', pass.partnerHotelPhone]);

    const rowHtml = (items) =>
      items.map(([k, v]) => `<div class="row"><span>${escapeHtml(k)}</span><span>${escapeHtml(v)}</span></div>`).join('');

    const bodyHtml = `
      <div class="banner" style="background:${banner.bg};color:${banner.color}">${escapeHtml(banner.text)}</div>
      <div class="card">
        <div class="hero">
          <div class="hero-label">Misafir</div>
          <div class="hero-name">${escapeHtml(pass.guestName)}</div>
          ${pass.roomNumber ? `<div class="hero-room">Oda ${escapeHtml(pass.roomNumber)}</div>` : ''}
        </div>
        <div class="section"><h2>Kahvaltı bilgileri</h2>${rowHtml(rows)}</div>
        <div class="section"><h2>Partner otel</h2>${rowHtml(hotelRows)}</div>
      </div>
      ${status === 'redeemed' ? '<div class="ok">✓ Misafir kahvaltı yapabilir</div>' : ''}
    `;

    return new Response(
      renderPage({
        title: pass.guestName || 'Misafir kahvaltı bileti',
        subtitle: 'QR ile açılan misafir bilgi kartı',
        bodyHtml,
      }),
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Bilinmeyen hata';
    const hint = msg.includes('breakfast_guest_pass_public_lookup')
      ? 'Veritabanı migration henüz uygulanmamış olabilir (527_breakfast_guest_pass_public_lookup.sql).'
      : 'Lütfen biraz sonra tekrar deneyin.';
    return new Response(
      renderPage({
        title: 'Yüklenemedi',
        subtitle: hint,
        bodyHtml: `<div class="card empty"><h2>Sunucu hatası</h2><p>${escapeHtml(msg.slice(0, 240))}</p></div>`,
      }),
      { status: 502, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
    );
  }
}
