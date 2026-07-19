/**
 * Expo web export sonrası QR şikayet portalını dist/ altına yazar.
 * valoria.tr/sikayet → dist/sikayet/index.html
 * Giriş yok · zorunlu ad/telefon/oda · DeepSeek yazım desteği · sorumlu kartı
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

if (!fs.existsSync(dist)) {
  console.error('[bundle-sikayet] dist/ yok — önce expo export -p web');
  process.exit(1);
}

const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(
  /\/$/,
  ''
);
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const outDir = path.join(dist, 'sikayet');
fs.mkdirSync(outDir, { recursive: true });

const configJs = `window.__VALORIA_SIKAYET__=${JSON.stringify({
  supabaseUrl,
  anonKey,
  apiPath: '/functions/v1/public-complaint',
})};`;
fs.writeFileSync(path.join(dist, 'sikayet-config.js'), configJs, 'utf8');

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0c1222" />
  <meta name="robots" content="noindex" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <title>Valoria · Şikayet Hattı</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
  <script src="/sikayet-config.js"></script>
  <style>
    :root {
      --ink: #f4f0e8;
      --ink-soft: rgba(244, 240, 232, 0.72);
      --ink-muted: rgba(244, 240, 232, 0.48);
      --gold: #c9a227;
      --gold-soft: #e8d5a3;
      --panel: rgba(18, 24, 40, 0.72);
      --line: rgba(244, 240, 232, 0.12);
      --ok: #6ee7b7;
      --danger: #fca5a5;
      --radius: 22px;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: "DM Sans", system-ui, sans-serif;
      color: var(--ink);
      background: #070b14;
      -webkit-font-smoothing: antialiased;
    }
    .bg {
      position: fixed; inset: 0; z-index: 0; pointer-events: none;
      background:
        radial-gradient(ellipse 90% 60% at 10% -10%, rgba(201, 162, 39, 0.22), transparent 55%),
        radial-gradient(ellipse 70% 50% at 100% 0%, rgba(56, 89, 140, 0.28), transparent 50%),
        radial-gradient(ellipse 80% 50% at 50% 100%, rgba(12, 40, 48, 0.55), transparent 55%),
        linear-gradient(165deg, #0a0f1a 0%, #101827 45%, #0c1220 100%);
    }
    .bg::after {
      content: "";
      position: absolute; inset: 0; opacity: 0.035;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    }
    .wrap {
      position: relative; z-index: 1;
      max-width: 560px; margin: 0 auto;
      padding: max(20px, env(safe-area-inset-top)) 18px max(36px, env(safe-area-inset-bottom));
    }
    .brand { text-align: center; margin-bottom: 18px; animation: rise 0.7s ease both; }
    .brand-mark {
      display: inline-flex; align-items: center; gap: 10px;
      letter-spacing: 0.28em; text-transform: uppercase;
      font-size: 11px; font-weight: 600; color: var(--gold-soft);
    }
    .brand-mark span {
      width: 28px; height: 1px;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
    }
    h1 {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-weight: 600; font-size: clamp(34px, 8vw, 44px);
      margin: 14px 0 8px; letter-spacing: 0.02em; line-height: 1.05;
    }
    .lead {
      margin: 0 auto; max-width: 36ch;
      color: var(--ink-soft); font-size: 15px; line-height: 1.55;
    }
    .no-login {
      display: inline-flex; margin-top: 12px; padding: 7px 12px;
      border-radius: 999px; border: 1px solid rgba(110,231,183,0.28);
      background: rgba(110,231,183,0.08); color: var(--ok);
      font-size: 12px; font-weight: 700; letter-spacing: 0.04em;
    }
    .resp {
      display: flex; gap: 14px; align-items: center;
      margin: 18px 0 0; padding: 14px;
      border-radius: 18px; border: 1px solid var(--line);
      background: linear-gradient(135deg, rgba(201,162,39,0.12), rgba(18,24,40,0.55));
      animation: rise 0.8s ease 0.05s both;
    }
    .resp img, .resp .ph {
      width: 64px; height: 64px; border-radius: 50%;
      object-fit: cover; flex-shrink: 0;
      border: 2px solid rgba(201,162,39,0.45);
      background: #1a2236;
    }
    .resp .ph {
      display: grid; place-items: center;
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 26px; color: var(--gold-soft);
    }
    .resp .name {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 22px; font-weight: 600; margin: 0 0 2px;
    }
    .resp .title { margin: 0; color: var(--gold-soft); font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .resp .brands { margin: 4px 0 0; color: var(--ink-soft); font-size: 13px; }
    .resp .note { margin: 8px 0 0; color: var(--ink-muted); font-size: 12px; line-height: 1.45; }
    .card {
      margin-top: 18px; background: var(--panel);
      border: 1px solid var(--line); border-radius: var(--radius);
      backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
      box-shadow: 0 24px 60px rgba(0,0,0,0.35); overflow: hidden;
      animation: rise 0.85s ease 0.08s both;
    }
    .card-top {
      padding: 18px 18px 14px; border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(201,162,39,0.08), transparent);
    }
    .card-top h2 {
      margin: 0; font-size: 13px; font-weight: 700;
      letter-spacing: 0.08em; text-transform: uppercase; color: var(--gold-soft);
    }
    .card-top p { margin: 6px 0 0; color: var(--ink-muted); font-size: 13px; line-height: 1.45; }
    form { padding: 16px 18px 20px; display: grid; gap: 16px; }
    .label {
      display: block; margin-bottom: 8px;
      font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
      text-transform: uppercase; color: var(--ink-muted);
    }
    .req { color: var(--gold); }
    .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .seg button, .chips button {
      appearance: none; border: 1px solid var(--line);
      background: rgba(255,255,255,0.03); color: var(--ink-soft);
      border-radius: 14px; padding: 12px 10px; font: inherit;
      font-size: 13px; font-weight: 600; cursor: pointer;
      transition: border-color .2s, background .2s, color .2s, transform .15s;
    }
    .seg button:active, .chips button:active { transform: scale(0.98); }
    .seg button.on, .chips button.on {
      border-color: rgba(201,162,39,0.55);
      background: rgba(201,162,39,0.16); color: var(--gold-soft);
    }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chips button { padding: 10px 12px; border-radius: 999px; font-size: 12px; }
    .field {
      width: 100%; border: 1px solid var(--line); border-radius: 14px;
      background: rgba(0,0,0,0.28); color: var(--ink);
      padding: 14px; font: inherit; font-size: 15px; outline: none;
      transition: border-color .2s, box-shadow .2s;
    }
    .field:focus {
      border-color: rgba(201,162,39,0.5);
      box-shadow: 0 0 0 3px rgba(201,162,39,0.12);
    }
    textarea.field { min-height: 140px; resize: vertical; line-height: 1.5; }
    .desc-head {
      display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px;
    }
    .desc-head .label { margin: 0; }
    .ai-btn {
      appearance: none; border: 1px solid rgba(201,162,39,0.4);
      background: rgba(201,162,39,0.12); color: var(--gold-soft);
      border-radius: 999px; padding: 8px 12px; font: inherit;
      font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap;
    }
    .ai-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .ai-hint { margin: 8px 0 0; color: var(--ink-muted); font-size: 12px; line-height: 1.4; }
    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    @media (max-width: 420px) { .grid2 { grid-template-columns: 1fr; } }
    .media-zone {
      border: 1px dashed rgba(201,162,39,0.35); border-radius: 16px;
      padding: 16px; background: rgba(201,162,39,0.04); text-align: center;
    }
    .media-zone p { margin: 0 0 12px; color: var(--ink-soft); font-size: 13px; line-height: 1.45; }
    .media-actions { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; }
    .media-actions label {
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      padding: 11px 14px; border-radius: 999px; border: 1px solid var(--line);
      background: rgba(255,255,255,0.04); color: var(--ink);
      font-size: 13px; font-weight: 600; cursor: pointer;
    }
    .media-actions input { display: none; }
    .previews { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-top: 14px; }
    .preview {
      position: relative; border-radius: 14px; overflow: hidden;
      aspect-ratio: 1; background: #000; border: 1px solid var(--line);
    }
    .preview img, .preview video { width: 100%; height: 100%; object-fit: cover; display: block; }
    .preview .rm {
      position: absolute; top: 6px; right: 6px; width: 28px; height: 28px;
      border-radius: 50%; border: 0; background: rgba(0,0,0,0.65);
      color: #fff; font-size: 16px; cursor: pointer;
    }
    .preview .badge {
      position: absolute; left: 6px; bottom: 6px; padding: 3px 8px;
      border-radius: 999px; font-size: 10px; font-weight: 700;
      background: rgba(0,0,0,0.55); color: var(--gold-soft); text-transform: uppercase;
    }
    .submit {
      appearance: none; border: 0; width: 100%; padding: 16px 18px;
      border-radius: 16px; font: inherit; font-size: 15px; font-weight: 700;
      letter-spacing: 0.04em; color: #1a1408; cursor: pointer;
      background: linear-gradient(135deg, #e8d5a3 0%, #c9a227 55%, #a8841a 100%);
      box-shadow: 0 12px 28px rgba(201,162,39,0.28);
    }
    .submit:disabled { opacity: 0.55; cursor: not-allowed; filter: grayscale(0.2); }
    .err {
      display: none; padding: 12px 14px; border-radius: 12px;
      background: rgba(185,28,28,0.18); border: 1px solid rgba(252,165,165,0.35);
      color: var(--danger); font-size: 13px; line-height: 1.45;
    }
    .err.show { display: block; }
    .success { display: none; padding: 36px 22px; text-align: center; animation: rise 0.55s ease both; }
    .success.show { display: block; }
    .success .check {
      width: 64px; height: 64px; margin: 0 auto 16px; border-radius: 50%;
      display: grid; place-items: center;
      background: rgba(110,231,183,0.12); border: 1px solid rgba(110,231,183,0.35);
      color: var(--ok); font-size: 28px;
    }
    .success h3 {
      font-family: "Cormorant Garamond", Georgia, serif;
      font-size: 32px; margin: 0 0 8px; font-weight: 600;
    }
    .success p { margin: 0; color: var(--ink-soft); line-height: 1.55; font-size: 14px; }
    .foot {
      margin-top: 18px; text-align: center; color: var(--ink-muted);
      font-size: 12px; line-height: 1.55; animation: rise 1s ease 0.15s both;
    }
    .loading-bar {
      display: none; height: 3px; width: 100%; overflow: hidden;
      background: rgba(255,255,255,0.06);
    }
    .loading-bar.on { display: block; }
    .loading-bar i {
      display: block; height: 100%; width: 40%;
      background: linear-gradient(90deg, transparent, var(--gold), transparent);
      animation: slide 1s ease infinite;
    }
    @keyframes rise {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes slide {
      from { transform: translateX(-120%); }
      to { transform: translateX(320%); }
    }
  </style>
</head>
<body>
  <div class="bg" aria-hidden="true"></div>
  <div class="wrap">
    <header class="brand">
      <div class="brand-mark"><span></span>Valoria Hotel<span></span></div>
      <h1>Şikayet Hattı</h1>
      <p class="lead">Giriş yapmadan yazın. Ad, telefon, oda ve açıklama yeterlidir. İsterseniz fotoğraf veya video ekleyin.</p>
      <div class="no-login">Giriş gerekmez</div>
    </header>

    <aside class="resp" id="respCard" aria-live="polite">
      <div class="ph" id="respPh">S</div>
      <div>
        <p class="title" id="respTitle">Valoria Hotel &amp; Bavulsuite Sorumlusu</p>
        <p class="name" id="respName">Soner</p>
        <p class="brands" id="respBrands">Valoria Hotel · Bavulsuite</p>
        <p class="note" id="respNote">Anlık şikayet değerlendirilir. Mesajınız doğrudan sorumlu yöneticiye iletilir.</p>
      </div>
    </aside>

    <section class="card" id="card">
      <div class="loading-bar" id="loadingBar"><i></i></div>
      <div class="card-top" id="cardTop">
        <h2>Geri bildirim formu</h2>
        <p>Uygulama indirmeden, hesabınız olmadan gönderin.</p>
      </div>
      <div class="success" id="success">
        <div class="check">✓</div>
        <h3>İletildi</h3>
        <p>Mesajınız sorumlu yöneticiye ulaştı. Anlık değerlendirilir. Teşekkür ederiz.</p>
      </div>
      <form id="form">
        <div>
          <span class="label">Konu</span>
          <div class="seg" id="topics">
            <button type="button" data-v="complaint" class="on">Şikayet</button>
            <button type="button" data-v="suggestion">Öneri</button>
            <button type="button" data-v="thanks">Teşekkür</button>
          </div>
        </div>
        <div>
          <span class="label">Kategori</span>
          <div class="chips" id="categories">
            <button type="button" data-v="personnel" class="on">Personel</button>
            <button type="button" data-v="room_issue">Oda</button>
            <button type="button" data-v="reception_checkin_checkout">Resepsiyon</button>
            <button type="button" data-v="noise">Gürültü</button>
            <button type="button" data-v="breakfast">Kahvaltı</button>
            <button type="button" data-v="food">Yemek</button>
            <button type="button" data-v="payment">Ödeme</button>
            <button type="button" data-v="passport">Pasaport</button>
            <button type="button" data-v="other">Diğer</button>
          </div>
        </div>
        <div>
          <label class="label" for="name">Ad Soyad <span class="req">*</span></label>
          <input class="field" id="name" maxlength="120" placeholder="İsim Soyisim" required autocomplete="name" />
        </div>
        <div class="grid2">
          <div>
            <label class="label" for="phone">Telefon <span class="req">*</span></label>
            <input class="field" id="phone" type="tel" maxlength="40" placeholder="+90 …" required autocomplete="tel" />
          </div>
          <div>
            <label class="label" for="room">Oda no <span class="req">*</span></label>
            <input class="field" id="room" inputmode="numeric" maxlength="20" placeholder="Örn. 204" required />
          </div>
        </div>
        <div>
          <div class="desc-head">
            <label class="label" for="description">Açıklama <span class="req">*</span></label>
            <button type="button" class="ai-btn" id="aiBtn">✦ DeepSeek ile düzenle</button>
          </div>
          <textarea class="field" id="description" placeholder="Ne yaşadığınızı yazın… AI düğmesi metninizi nazik ve net hale getirir." required maxlength="4000"></textarea>
          <p class="ai-hint">Birkaç kelime yazıp DeepSeek’e bırakın; anlam aynı kalır, ifade profesyonelleşir.</p>
        </div>
        <div class="media-zone">
          <p>İsteğe bağlı: fotoğraf veya video (en fazla 4)</p>
          <div class="media-actions">
            <label><input type="file" id="pickImage" accept="image/*" multiple />Fotoğraf</label>
            <label><input type="file" id="pickVideo" accept="video/*" multiple />Video</label>
            <label><input type="file" id="pickCamera" accept="image/*,video/*" capture="environment" />Kamera</label>
          </div>
          <div class="previews" id="previews"></div>
        </div>
        <div class="err" id="err"></div>
        <button class="submit" id="submit" type="submit">Gönder</button>
      </form>
    </section>
    <p class="foot" id="footNote">Valoria Hotel · Bavulsuite<br/>Mesajlar yalnızca sorumlu yöneticiye iletilir.</p>
  </div>
  <script>
(function () {
  var cfg = window.__VALORIA_SIKAYET__ || {};
  var apiBase = (cfg.supabaseUrl || "").replace(/\\/$/, "");
  var apiUrl = apiBase + (cfg.apiPath || "/functions/v1/public-complaint");
  var anonKey = cfg.anonKey || "";
  var topic = "complaint";
  var category = "personnel";
  var files = [];
  var MAX = 4;

  function qs(id) { return document.getElementById(id); }
  function authHeaders(json) {
    var h = { Authorization: "Bearer " + anonKey, apikey: anonKey };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function wireToggle(rootId, setter) {
    var root = qs(rootId);
    root.addEventListener("click", function (e) {
      var btn = e.target.closest("button[data-v]");
      if (!btn) return;
      root.querySelectorAll("button").forEach(function (b) { b.classList.remove("on"); });
      btn.classList.add("on");
      setter(btn.getAttribute("data-v"));
    });
  }
  wireToggle("topics", function (v) { topic = v; });
  wireToggle("categories", function (v) { category = v; });

  function showErr(msg) {
    var el = qs("err");
    el.textContent = msg || "";
    el.classList.toggle("show", !!msg);
  }

  function applyResponsible(r) {
    if (!r) return;
    qs("respName").textContent = r.name || "Soner";
    qs("respTitle").textContent = r.title || "Valoria Hotel & Bavulsuite Sorumlusu";
    qs("respBrands").textContent = r.brands || "Valoria Hotel · Bavulsuite";
    qs("respNote").textContent = r.note || "Anlık şikayet değerlendirilir.";
    qs("footNote").innerHTML = (r.brands || "Valoria Hotel · Bavulsuite") + "<br/>Mesajlar yalnızca sorumlu yöneticiye iletilir.";
    var ph = qs("respPh");
    if (r.photoUrl) {
      var img = document.createElement("img");
      img.src = r.photoUrl;
      img.alt = r.name || "Sorumlu";
      img.id = "respPhoto";
      ph.replaceWith(img);
      img.className = "";
      img.style.cssText = "width:64px;height:64px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(201,162,39,0.45);background:#1a2236;";
    } else {
      ph.textContent = (r.name || "S").charAt(0).toUpperCase();
    }
  }

  async function loadMeta() {
    if (!apiBase || !anonKey) return;
    try {
      var res = await fetch(apiUrl, { headers: authHeaders(false) });
      var data = await res.json();
      if (data && data.responsible) applyResponsible(data.responsible);
    } catch (_) {}
  }
  loadMeta();

  function renderPreviews() {
    var box = qs("previews");
    box.innerHTML = "";
    files.forEach(function (f, idx) {
      var div = document.createElement("div");
      div.className = "preview";
      var url = URL.createObjectURL(f);
      if (f.type.indexOf("video/") === 0) {
        var v = document.createElement("video");
        v.src = url; v.muted = true; v.playsInline = true;
        div.appendChild(v);
        var badge = document.createElement("span");
        badge.className = "badge"; badge.textContent = "Video";
        div.appendChild(badge);
      } else {
        var img = document.createElement("img");
        img.src = url; img.alt = "";
        div.appendChild(img);
        var badge2 = document.createElement("span");
        badge2.className = "badge"; badge2.textContent = "Foto";
        div.appendChild(badge2);
      }
      var rm = document.createElement("button");
      rm.type = "button"; rm.className = "rm"; rm.textContent = "×";
      rm.onclick = function () { files.splice(idx, 1); renderPreviews(); };
      div.appendChild(rm);
      box.appendChild(div);
    });
  }

  function addFiles(list) {
    for (var i = 0; i < list.length; i++) {
      if (files.length >= MAX) break;
      var f = list[i];
      if (!f) continue;
      if (f.size > 40 * 1024 * 1024) {
        showErr("Dosya çok büyük (üst sınır 40MB): " + f.name);
        continue;
      }
      files.push(f);
    }
    renderPreviews();
  }

  ["pickImage", "pickVideo", "pickCamera"].forEach(function (id) {
    qs(id).addEventListener("change", function (e) {
      addFiles(e.target.files || []);
      e.target.value = "";
    });
  });

  qs("aiBtn").addEventListener("click", async function () {
    showErr("");
    var text = (qs("description").value || "").trim();
    if (text.length < 3) {
      showErr("Önce kısa bir taslak yazın, sonra DeepSeek düzenlesin.");
      return;
    }
    var btn = qs("aiBtn");
    btn.disabled = true;
    btn.textContent = "Düzenleniyor…";
    try {
      var res = await fetch(apiUrl, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          action: "improve-text",
          text: text,
          topic_type: topic,
          category: category,
        }),
      });
      var data = {};
      try { data = await res.json(); } catch (_) {}
      if (!res.ok || !data.ok || !data.text) {
        throw new Error((data && data.error) || "AI düzenlemesi başarısız");
      }
      qs("description").value = data.text;
    } catch (err) {
      showErr(err && err.message ? err.message : "AI bağlantı hatası");
    } finally {
      btn.disabled = false;
      btn.textContent = "✦ DeepSeek ile düzenle";
    }
  });

  qs("form").addEventListener("submit", async function (e) {
    e.preventDefault();
    showErr("");
    var name = (qs("name").value || "").trim();
    var phone = (qs("phone").value || "").trim();
    var room = (qs("room").value || "").trim();
    var description = (qs("description").value || "").trim();
    if (name.length < 2) { showErr("Lütfen adınızı ve soyadınızı yazın."); return; }
    if (phone.length < 7) { showErr("Lütfen geçerli bir telefon numarası yazın."); return; }
    if (!room) { showErr("Lütfen oda numaranızı yazın."); return; }
    if (!description) { showErr("Lütfen açıklamanızı yazın."); return; }
    if (!apiBase || !anonKey) {
      showErr("Portal yapılandırması eksik. Lütfen resepsiyona bildirin.");
      return;
    }

    var btn = qs("submit");
    btn.disabled = true;
    qs("loadingBar").classList.add("on");

    try {
      var mediaUrls = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        var mime = (f.type || "image/jpeg").toLowerCase();
        var prepRes = await fetch(apiUrl, {
          method: "POST",
          headers: authHeaders(true),
          body: JSON.stringify({ action: "signed-upload", mime: mime }),
        });
        var prep = {};
        try { prep = await prepRes.json(); } catch (_) {}
        if (!prepRes.ok || !prep.ok || !prep.token || !prep.path) {
          throw new Error((prep && prep.error) || "Medya yükleme hazırlığı başarısız");
        }
        var upRes;
        if (prep.signedUrl) {
          upRes = await fetch(prep.signedUrl, {
            method: "PUT",
            headers: { "Content-Type": mime, "x-upsert": "false" },
            body: f,
          });
        } else {
          upRes = await fetch(
            apiBase + "/storage/v1/object/upload/sign/qr-complaints/" + prep.path + "?token=" + encodeURIComponent(prep.token),
            {
              method: "PUT",
              headers: {
                "Content-Type": mime,
                Authorization: "Bearer " + anonKey,
                apikey: anonKey,
                "x-upsert": "false",
              },
              body: f,
            }
          );
        }
        if (!upRes.ok) throw new Error("Medya yüklenemedi (" + (f.name || "dosya") + ")");
        mediaUrls.push({
          url: prep.publicUrl,
          type: prep.type || (mime.indexOf("video/") === 0 ? "video" : "image"),
          mime: mime,
          name: f.name || undefined,
        });
      }

      var payload = {
        topic_type: topic,
        category: category,
        description: description,
        room_number: room,
        phone: phone,
        contact_name: name,
        media_urls: mediaUrls,
      };
      var org = new URLSearchParams(location.search).get("org");
      if (org) payload.organization_id = org;

      var res = await fetch(apiUrl, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
      var data = {};
      try { data = await res.json(); } catch (_) {}
      if (!res.ok || !data.ok) {
        throw new Error((data && data.error) || "Gönderilemedi. Lütfen tekrar deneyin.");
      }
      qs("form").style.display = "none";
      qs("cardTop").style.display = "none";
      qs("success").classList.add("show");
    } catch (err) {
      showErr(err && err.message ? err.message : "Bağlantı hatası");
      btn.disabled = false;
    } finally {
      qs("loadingBar").classList.remove("on");
    }
  });
})();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
console.log('[bundle-sikayet] yazıldı → dist/sikayet/index.html');
