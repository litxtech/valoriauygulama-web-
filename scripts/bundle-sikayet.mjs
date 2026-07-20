/**
 * Expo web export sonrası QR şikayet portalını dist/ altına yazar.
 * valoria.tr/sikayet — TR/EN/AR · giriş yok · hızlı paralel medya yükleme
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

fs.writeFileSync(
  path.join(dist, 'sikayet-config.js'),
  `window.__VALORIA_SIKAYET__=${JSON.stringify({
    supabaseUrl,
    anonKey,
    apiPath: '/functions/v1/public-complaint',
  })};`,
  'utf8'
);

const html = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#0c1222" />
  <meta name="robots" content="noindex" />
  <title>Valoria · Complaint Line</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap" rel="stylesheet" />
  <script src="/sikayet-config.js"></script>
  <style>
    :root {
      --ink:#f4f0e8; --ink-soft:rgba(244,240,232,.72); --ink-muted:rgba(244,240,232,.48);
      --gold:#c9a227; --gold-soft:#e8d5a3; --panel:rgba(18,24,40,.72);
      --line:rgba(244,240,232,.12); --ok:#6ee7b7; --danger:#fca5a5; --radius:22px;
    }
    *{box-sizing:border-box} html,body{margin:0;min-height:100%}
    body{font-family:"DM Sans",system-ui,sans-serif;color:var(--ink);background:#070b14;-webkit-font-smoothing:antialiased}
    html[dir=rtl] body{font-family:"DM Sans","Segoe UI",Tahoma,sans-serif}
    .bg{position:fixed;inset:0;z-index:0;pointer-events:none;background:radial-gradient(ellipse 90% 60% at 10% -10%,rgba(201,162,39,.22),transparent 55%),radial-gradient(ellipse 70% 50% at 100% 0%,rgba(56,89,140,.28),transparent 50%),linear-gradient(165deg,#0a0f1a 0%,#101827 45%,#0c1220 100%)}
    .wrap{position:relative;z-index:1;max-width:560px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 18px max(36px,env(safe-area-inset-bottom))}
    .lang{display:flex;justify-content:center;gap:6px;margin-bottom:14px}
    .lang button{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink-soft);border-radius:999px;padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer}
    .lang button.on{border-color:rgba(201,162,39,.55);background:rgba(201,162,39,.16);color:var(--gold-soft)}
    .brand{text-align:center;margin-bottom:18px}
    .brand-mark{display:inline-flex;align-items:center;gap:10px;letter-spacing:.28em;text-transform:uppercase;font-size:11px;font-weight:600;color:var(--gold-soft)}
    .brand-mark span{width:28px;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
    h1{font-family:"Cormorant Garamond",Georgia,serif;font-weight:600;font-size:clamp(32px,8vw,44px);margin:14px 0 8px;line-height:1.05}
    .lead{margin:0 auto;max-width:38ch;color:var(--ink-soft);font-size:15px;line-height:1.55}
    .no-login{display:inline-flex;margin-top:12px;padding:7px 12px;border-radius:999px;border:1px solid rgba(110,231,183,.28);background:rgba(110,231,183,.08);color:var(--ok);font-size:12px;font-weight:700}
    .resp{display:flex;gap:14px;align-items:center;margin:18px 0 0;padding:14px;border-radius:18px;border:1px solid var(--line);background:linear-gradient(135deg,rgba(201,162,39,.12),rgba(18,24,40,.55))}
    .resp img,.resp .ph{width:64px;height:64px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(201,162,39,.45);background:#1a2236}
    .resp .ph{display:grid;place-items:center;font-family:"Cormorant Garamond",Georgia,serif;font-size:26px;color:var(--gold-soft)}
    .resp .name{font-family:"Cormorant Garamond",Georgia,serif;font-size:22px;font-weight:600;margin:0 0 2px}
    .resp .title{margin:0;color:var(--gold-soft);font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase}
    .resp .brands{margin:4px 0 0;color:var(--ink-soft);font-size:13px}
    .resp .note{margin:8px 0 0;color:var(--ink-muted);font-size:12px;line-height:1.45}
    .resp{cursor:pointer;transition:border-color .15s,transform .12s}
    .resp:hover{border-color:rgba(201,162,39,.55)}
    .resp:active{transform:scale(.99)}
    .resp .profile-link{margin:10px 0 0;color:var(--gold-soft);font-size:12px;font-weight:700}
    .card{margin-top:18px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);backdrop-filter:blur(18px);overflow:hidden;box-shadow:0 24px 60px rgba(0,0,0,.35)}
    .card-top{padding:18px 18px 14px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,rgba(201,162,39,.08),transparent)}
    .card-top h2{margin:0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-soft)}
    .card-top p{margin:6px 0 0;color:var(--ink-muted);font-size:13px;line-height:1.45}
    form{padding:16px 18px 20px;display:grid;gap:16px}
    .label{display:block;margin-bottom:8px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-muted)}
    .req{color:var(--gold)}
    .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .seg button,.chips button{appearance:none;border:1px solid var(--line);background:rgba(255,255,255,.03);color:var(--ink-soft);border-radius:14px;padding:12px 10px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}
    .seg button.on,.chips button.on{border-color:rgba(201,162,39,.55);background:rgba(201,162,39,.16);color:var(--gold-soft)}
    .chips{display:flex;flex-wrap:wrap;gap:8px}
    .chips button{padding:10px 12px;border-radius:999px;font-size:12px}
    .field{width:100%;border:1px solid var(--line);border-radius:14px;background:rgba(0,0,0,.28);color:var(--ink);padding:14px;font:inherit;font-size:15px;outline:none}
    .field:focus{border-color:rgba(201,162,39,.5);box-shadow:0 0 0 3px rgba(201,162,39,.12)}
    textarea.field{min-height:140px;resize:vertical;line-height:1.5}
    .desc-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
    .desc-head .label{margin:0}
    .ai-btn{appearance:none;border:1px solid rgba(201,162,39,.4);background:rgba(201,162,39,.12);color:var(--gold-soft);border-radius:999px;padding:8px 12px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
    .ai-btn:disabled{opacity:.5;cursor:not-allowed}
    .ai-hint{margin:8px 0 0;color:var(--ink-muted);font-size:12px;line-height:1.4}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    @media (max-width:420px){.grid2{grid-template-columns:1fr}}
    .media-zone{border:1px dashed rgba(201,162,39,.35);border-radius:16px;padding:16px;background:rgba(201,162,39,.04);text-align:center}
    .media-zone p{margin:0 0 12px;color:var(--ink-soft);font-size:13px;line-height:1.45}
    .media-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
    .media-actions label{display:inline-flex;align-items:center;justify-content:center;padding:11px 14px;border-radius:999px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);font-size:13px;font-weight:600;cursor:pointer}
    .media-actions input{display:none}
    .previews{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:14px}
    .preview{position:relative;border-radius:14px;overflow:hidden;aspect-ratio:1;background:#000;border:1px solid var(--line)}
    .preview img,.preview video{width:100%;height:100%;object-fit:cover;display:block}
    .preview .rm{position:absolute;top:6px;right:6px;width:28px;height:28px;border-radius:50%;border:0;background:rgba(0,0,0,.65);color:#fff;font-size:16px;cursor:pointer}
    .preview .badge{position:absolute;left:6px;bottom:6px;padding:3px 8px;border-radius:999px;font-size:10px;font-weight:700;background:rgba(0,0,0,.55);color:var(--gold-soft);text-transform:uppercase}
    .preview.uploading::after{content:"";position:absolute;inset:0;background:rgba(0,0,0,.45);background-image:linear-gradient(90deg,transparent,rgba(201,162,39,.5),transparent);background-size:200% 100%;animation:shine 1s linear infinite}
    .preview.ready .badge{color:#6ee7b7}
    .upload-status{margin-top:10px;font-size:12px;color:var(--ink-muted);min-height:16px}
    .submit{appearance:none;border:0;width:100%;padding:16px 18px;border-radius:16px;font:inherit;font-size:15px;font-weight:700;letter-spacing:.04em;color:#1a1408;cursor:pointer;background:linear-gradient(135deg,#e8d5a3 0%,#c9a227 55%,#a8841a 100%);box-shadow:0 12px 28px rgba(201,162,39,.28)}
    .submit:disabled{opacity:.55;cursor:not-allowed;filter:grayscale(.2)}
    .err{display:none;padding:12px 14px;border-radius:12px;background:rgba(185,28,28,.18);border:1px solid rgba(252,165,165,.35);color:var(--danger);font-size:13px;line-height:1.45}
    .err.show{display:block}
    .success{display:none;padding:28px 18px 24px;text-align:center}
    .success.show{display:block}
    .success .check{width:64px;height:64px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;background:rgba(110,231,183,.12);border:1px solid rgba(110,231,183,.35);color:var(--ok);font-size:28px}
    .success h3{font-family:"Cormorant Garamond",Georgia,serif;font-size:32px;margin:0 0 8px;font-weight:600}
    .success p{margin:0;color:var(--ink-soft);line-height:1.55;font-size:14px}
    .promo{
      margin-top:22px;text-align:left;border-radius:20px;padding:18px;
      background:linear-gradient(145deg,#1a1408,#0f172a 55%,#14532d);
      border:1px solid rgba(201,162,39,.4);
      box-shadow:0 16px 40px rgba(0,0,0,.35);
    }
    html[dir=rtl] .promo{text-align:right}
    .promo-badge{
      display:inline-block;padding:5px 10px;border-radius:999px;margin-bottom:12px;
      background:rgba(201,162,39,.18);border:1px solid rgba(201,162,39,.4);
      color:var(--gold-soft);font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;
    }
    .promo h4{margin:0 0 6px;font-size:20px;font-weight:800;color:#fff}
    .promo .promo-sub{margin:0 0 16px;color:rgba(248,250,252,.72);font-size:13px;line-height:1.5}
    .store-btn{
      display:flex;align-items:center;gap:12px;text-decoration:none;color:#fff;
      border-radius:14px;padding:14px 16px;margin-bottom:10px;
      transition:transform .12s,opacity .12s;
    }
    .store-btn:active{transform:scale(.98)}
    .store-btn.apple{background:#000;border:1px solid rgba(255,255,255,.14)}
    .store-btn.play{background:#15803d;border:1px solid rgba(255,255,255,.14)}
    .store-btn .ico{font-size:26px;width:34px;text-align:center;flex-shrink:0}
    .store-btn .col{flex:1;text-align:start}
    .store-btn .eye{display:block;font-size:11px;opacity:.7;font-weight:600}
    .store-btn .name{display:block;font-size:17px;font-weight:800;line-height:1.2}
    .store-btn .plat{display:block;font-size:12px;opacity:.65;margin-top:2px}
    .store-btn .arrow{opacity:.65;font-size:18px}
    .stars{display:flex;gap:6px;justify-content:flex-start;flex-wrap:wrap}
    .stars button{appearance:none;border:0;background:transparent;font-size:28px;line-height:1;cursor:pointer;color:rgba(244,240,232,.28);padding:2px 4px}
    .stars button.on{color:var(--gold)}
    .section-label{margin:4px 0 0;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-soft)}
    .hint-soft{margin:6px 0 0;color:var(--ink-muted);font-size:12px;line-height:1.4}
    .loading-bar{display:none;height:3px;width:100%;overflow:hidden;background:rgba(255,255,255,.06)}
    .loading-bar.on{display:block}
    .loading-bar i{display:block;height:100%;width:40%;background:linear-gradient(90deg,transparent,var(--gold),transparent);animation:slide 1s ease infinite}
    @keyframes slide{from{transform:translateX(-120%)}to{transform:translateX(320%)}}
    @keyframes shine{from{background-position:200% 0}to{background-position:-200% 0}}
  </style>
</head>
<body>
  <div class="bg" aria-hidden="true"></div>
  <div class="wrap">
    <div class="lang" id="langSwitch" role="group" aria-label="Language">
      <button type="button" data-lang="tr" class="on">TR</button>
      <button type="button" data-lang="en">EN</button>
      <button type="button" data-lang="ar">عربي</button>
    </div>
    <header class="brand">
      <div class="brand-mark"><span></span>Valoria Hotel<span></span></div>
      <h1 id="tTitle">Şikayet Hattı</h1>
      <p class="lead" id="tLead"></p>
      <div class="no-login" id="tNoLogin"></div>
    </header>
    <aside class="resp" id="respCard" role="link" tabindex="0">
      <div class="ph" id="respPh">S</div>
      <div>
        <p class="title" id="respTitle"></p>
        <p class="name" id="respName">Soner</p>
        <p class="brands" id="respBrands">Valoria Hotel · Bavulsuite</p>
        <p class="note" id="respNote"></p>
        <p class="profile-link" id="respProfileLink"></p>
      </div>
    </aside>
    <section class="card" id="card">
      <div class="loading-bar" id="loadingBar"><i></i></div>
      <div class="card-top" id="cardTop">
        <h2 id="tFormTitle"></h2>
        <p id="tFormSub"></p>
      </div>
      <div class="success" id="success">
        <div class="check">✓</div>
        <h3 id="tOkTitle"></h3>
        <p id="tOkBody"></p>
        <div class="promo" id="storePromo">
          <div class="promo-badge" id="tPromoBadge"></div>
          <h4 id="tPromoTitle"></h4>
          <p class="promo-sub" id="tPromoSub"></p>
          <a class="store-btn apple" id="btnApple" href="#" target="_blank" rel="noopener">
            <span class="ico"></span>
            <span class="col">
              <span class="eye" id="tGetOn"></span>
              <span class="name" id="tAppleName"></span>
              <span class="plat" id="tAppleSub"></span>
            </span>
            <span class="arrow">→</span>
          </a>
          <a class="store-btn play" id="btnPlay" href="#" target="_blank" rel="noopener">
            <span class="ico">▶</span>
            <span class="col">
              <span class="eye" id="tGetOn2"></span>
              <span class="name" id="tPlayName"></span>
              <span class="plat" id="tPlaySub"></span>
            </span>
            <span class="arrow">→</span>
          </a>
        </div>
      </div>
      <form id="form">
        <p class="section-label" id="tAccountSec"></p>
        <p class="hint-soft" id="tAccountHint"></p>
        <div class="grid2">
          <div>
            <label class="label" for="firstName" id="tFirst"></label>
            <input class="field" id="firstName" maxlength="60" required autocomplete="given-name" />
          </div>
          <div>
            <label class="label" for="lastName" id="tLast"></label>
            <input class="field" id="lastName" maxlength="60" required autocomplete="family-name" />
          </div>
        </div>
        <div>
          <label class="label" for="email" id="tEmail"></label>
          <input class="field" id="email" type="email" maxlength="160" required autocomplete="email" />
        </div>
        <div class="grid2">
          <div>
            <label class="label" for="phone" id="tPhone"></label>
            <input class="field" id="phone" type="tel" maxlength="40" required autocomplete="tel" />
          </div>
          <div>
            <label class="label" for="password" id="tPassword"></label>
            <input class="field" id="password" type="password" minlength="6" maxlength="72" required autocomplete="new-password" />
          </div>
        </div>
        <div>
          <label class="label" for="room" id="tRoom"></label>
          <input class="field" id="room" inputmode="numeric" maxlength="20" />
        </div>

        <p class="section-label" id="tShareSec"></p>
        <div>
          <span class="label" id="tRating"></span>
          <div class="stars" id="stars" role="group" aria-label="rating">
            <button type="button" data-v="1">★</button>
            <button type="button" data-v="2">★</button>
            <button type="button" data-v="3">★</button>
            <button type="button" data-v="4">★</button>
            <button type="button" data-v="5" class="on">★</button>
          </div>
        </div>
        <div>
          <span class="label" id="tTopic"></span>
          <div class="seg" id="topics">
            <button type="button" data-v="complaint" class="on" data-i18n="topicComplaint"></button>
            <button type="button" data-v="suggestion" data-i18n="topicSuggestion"></button>
            <button type="button" data-v="thanks" data-i18n="topicThanks"></button>
          </div>
        </div>
        <div>
          <span class="label" id="tCategory"></span>
          <div class="chips" id="categories">
            <button type="button" data-v="personnel" class="on" data-i18n="catPersonnel"></button>
            <button type="button" data-v="room_issue" data-i18n="catRoom"></button>
            <button type="button" data-v="reception_checkin_checkout" data-i18n="catReception"></button>
            <button type="button" data-v="noise" data-i18n="catNoise"></button>
            <button type="button" data-v="breakfast" data-i18n="catBreakfast"></button>
            <button type="button" data-v="food" data-i18n="catFood"></button>
            <button type="button" data-v="payment" data-i18n="catPayment"></button>
            <button type="button" data-v="passport" data-i18n="catPassport"></button>
            <button type="button" data-v="other" data-i18n="catOther"></button>
          </div>
        </div>
        <div>
          <div class="desc-head">
            <label class="label" for="description" id="tDesc"></label>
            <button type="button" class="ai-btn" id="aiBtn"></button>
          </div>
          <textarea class="field" id="description" required maxlength="4000"></textarea>
          <p class="ai-hint" id="tAiHint"></p>
        </div>
        <div class="media-zone">
          <p id="tMedia"></p>
          <div class="media-actions">
            <label><input type="file" id="pickImage" accept="image/*" multiple /><span data-i18n="photo"></span></label>
            <label><input type="file" id="pickVideo" accept="video/*" multiple /><span data-i18n="video"></span></label>
            <label><input type="file" id="pickCamera" accept="image/*,video/*" capture="environment" /><span data-i18n="camera"></span></label>
          </div>
          <div class="previews" id="previews"></div>
          <div class="upload-status" id="uploadStatus"></div>
        </div>
        <div class="err" id="err"></div>
        <button class="submit" id="submit" type="submit"></button>
      </form>
    </section>
    <p class="foot" id="footNote"></p>
  </div>
  <script>
(function () {
  var I18N = {
    tr: {
      title: "Deneyimini paylaş", lead: "Aynı sayfada hesabınız oluşur ve mesajınız iletilir. Uygulama indirmeden paylaşın; sonra aynı e-posta ve şifreyle giriş yapın.",
      noLogin: "Uygulama gerekmez · Hesap otomatik", formTitle: "Paylaşım", formSub: "Ad, e-posta ve mesajınız yeterli. Yönlendirme yok.",
      accountSec: "Hesap bilgileri", accountHint: "Gönderince Valoria hesabınız oluşur. Uygulamada aynı e-posta + şifre ile giriş yaparsınız.",
      shareSec: "Paylaşımınız", rating: "Puanınız *",
      topic: "Konu", category: "Kategori", first: "Ad *", last: "Soyad *", email: "E-posta *", password: "Şifre *", phone: "Telefon *", room: "Oda no (isteğe bağlı)", desc: "Mesajınız *",
      topicComplaint: "Şikayet", topicSuggestion: "Öneri", topicThanks: "Teşekkür",
      catPersonnel: "Personel", catRoom: "Oda", catReception: "Resepsiyon", catNoise: "Gürültü", catBreakfast: "Kahvaltı", catFood: "Yemek", catPayment: "Ödeme", catPassport: "Pasaport", catOther: "Diğer",
      firstPh: "Ad", lastPh: "Soyad", emailPh: "ornek@mail.com", passwordPh: "En az 6 karakter", phonePh: "+90 …", roomPh: "Örn. 204", descPh: "Ne yaşadığınızı yazın…",
      aiBtn: "✦ DeepSeek ile düzenle", aiBusy: "Düzenleniyor…", aiHint: "Birkaç kelime yazıp DeepSeek’e bırakın; anlam aynı kalır.",
      media: "İsteğe bağlı: fotoğraf veya video (en fazla 4). Seçince hemen yüklenir.",
      photo: "Fotoğraf", video: "Video", camera: "Kamera", submit: "Paylaş ve kaydol", sending: "Gönderiliyor…",
      okTitle: "Paylaşıldı", okBody: "Mesajınız iletildi. Hesabınız hazır — uygulamayı indirip e-posta ve şifrenizle giriş yapabilirsiniz.",
      promoBadge: "Valoria uygulaması", promoTitle: "Aynı hesapla devam edin",
      promoSub: "İndirin, e-posta ve şifrenizle giriş yapın. Mesajlaşma ve daha fazlası.",
      getOn: "İndir", appleName: "App Store", appleSub: "iPhone & iPad",
      playName: "Google Play", playSub: "Android",
      errFirst: "Lütfen adınızı yazın.", errLast: "Lütfen soyadınızı yazın.", errEmail: "Geçerli bir e-posta yazın.",
      errPassword: "Şifre en az 6 karakter olmalı.", errPhone: "Lütfen geçerli bir telefon numarası yazın.",
      errDesc: "Lütfen mesajınızı yazın.", errAiDraft: "Önce kısa bir taslak yazın.",
      errConfig: "Portal yapılandırması eksik.", errSend: "Gönderilemedi. Lütfen tekrar deneyin.",
      errUpload: "Medya yüklenemedi", errBig: "Dosya çok büyük (üst sınır 40MB)",
      uploading: "Medya yükleniyor…", uploaded: "Medya hazır", waitUpload: "Medya yüklenirken lütfen bekleyin…",
      foot: "Valoria Hotel · Bavulsuite\\nPaylaşımınız sorumlu yöneticiye iletilir; hesabınız uygulamada hazır olur.",
      respTitle: "Valoria Hotel & Bavulsuite Sorumlusu",
      respNote: "Anlık değerlendirilir. Mesajınız doğrudan sorumlu yöneticiye iletilir.",
      respProfile: "Profilime bak · web"
    },
    en: {
      title: "Share your experience", lead: "Your account is created on this page and your message is sent. Share without the app — later sign in with the same email and password.",
      noLogin: "No app needed · Account auto-created", formTitle: "Share", formSub: "Name, email and your message. No redirects.",
      accountSec: "Account details", accountHint: "Submitting creates your Valoria account. Use the same email + password in the app.",
      shareSec: "Your post", rating: "Your rating *",
      topic: "Topic", category: "Category", first: "First name *", last: "Last name *", email: "Email *", password: "Password *", phone: "Phone *", room: "Room no. (optional)", desc: "Your message *",
      topicComplaint: "Complaint", topicSuggestion: "Suggestion", topicThanks: "Thanks",
      catPersonnel: "Staff", catRoom: "Room", catReception: "Reception", catNoise: "Noise", catBreakfast: "Breakfast", catFood: "Food", catPayment: "Payment", catPassport: "Passport", catOther: "Other",
      firstPh: "First name", lastPh: "Last name", emailPh: "you@email.com", passwordPh: "At least 6 characters", phonePh: "+90 …", roomPh: "e.g. 204", descPh: "Tell us what happened…",
      aiBtn: "✦ Improve with DeepSeek", aiBusy: "Improving…", aiHint: "Write a few words — DeepSeek will polish the wording.",
      media: "Optional: photo or video (max 4). Uploads start as soon as you select.",
      photo: "Photo", video: "Video", camera: "Camera", submit: "Share & register", sending: "Sending…",
      okTitle: "Shared", okBody: "Your message was sent. Your account is ready — download the app and sign in with your email and password.",
      promoBadge: "Valoria app", promoTitle: "Continue with the same account",
      promoSub: "Download and sign in with your email and password. Messaging and more.",
      getOn: "Get", appleName: "App Store", appleSub: "iPhone & iPad",
      playName: "Google Play", playSub: "Android",
      errFirst: "Please enter your first name.", errLast: "Please enter your last name.", errEmail: "Please enter a valid email.",
      errPassword: "Password must be at least 6 characters.", errPhone: "Please enter a valid phone number.",
      errDesc: "Please write your message.", errAiDraft: "Write a short draft first.",
      errConfig: "Portal configuration missing.", errSend: "Could not send. Please try again.",
      errUpload: "Media upload failed", errBig: "File too large (max 40MB)",
      uploading: "Uploading media…", uploaded: "Media ready", waitUpload: "Please wait while media uploads…",
      foot: "Valoria Hotel · Bavulsuite\\nYour post goes to the manager; your app account is ready.",
      respTitle: "Valoria Hotel & Bavulsuite Manager",
      respNote: "Reviewed promptly. Your message goes directly to the responsible manager.",
      respProfile: "View profile · web"
    },
    ar: {
      title: "شارك تجربتك", lead: "يُنشأ حسابك في هذه الصفحة وتُرسل رسالتك. شارك بدون التطبيق — لاحقاً سجّل الدخول بنفس البريد وكلمة المرور.",
      noLogin: "بدون تطبيق · حساب تلقائي", formTitle: "مشاركة", formSub: "الاسم والبريد والرسالة. بدون تحويل.",
      accountSec: "بيانات الحساب", accountHint: "عند الإرسال يُنشأ حساب Valoria. استخدم نفس البريد وكلمة المرور في التطبيق.",
      shareSec: "منشورك", rating: "تقييمك *",
      topic: "الموضوع", category: "الفئة", first: "الاسم *", last: "العائلة *", email: "البريد *", password: "كلمة المرور *", phone: "الهاتف *", room: "رقم الغرفة (اختياري)", desc: "رسالتك *",
      topicComplaint: "شكوى", topicSuggestion: "اقتراح", topicThanks: "شكر",
      catPersonnel: "الموظفون", catRoom: "الغرفة", catReception: "الاستقبال", catNoise: "الضوضاء", catBreakfast: "الإفطار", catFood: "الطعام", catPayment: "الدفع", catPassport: "جواز السفر", catOther: "أخرى",
      firstPh: "الاسم", lastPh: "العائلة", emailPh: "you@email.com", passwordPh: "6 أحرف على الأقل", phonePh: "+90 …", roomPh: "مثال 204", descPh: "صف ما حدث…",
      aiBtn: "✦ تحسين بـ DeepSeek", aiBusy: "جارٍ التحسين…", aiHint: "اكتب بضع كلمات — DeepSeek يصقل الصياغة.",
      media: "اختياري: صورة أو فيديو (حد أقصى 4). يبدأ الرفع فور الاختيار.",
      photo: "صورة", video: "فيديو", camera: "كاميرا", submit: "شارك وسجّل", sending: "جارٍ الإرسال…",
      okTitle: "تم النشر", okBody: "أُرسلت رسالتك. حسابك جاهز — حمّل التطبيق وسجّل الدخول بالبريد وكلمة المرور.",
      promoBadge: "تطبيق Valoria", promoTitle: "تابع بنفس الحساب",
      promoSub: "حمّل وسجّل الدخول بالبريد وكلمة المرور. المراسلة والمزيد.",
      getOn: "تحميل", appleName: "App Store", appleSub: "iPhone و iPad",
      playName: "Google Play", playSub: "Android",
      errFirst: "يرجى إدخال الاسم.", errLast: "يرجى إدخال اسم العائلة.", errEmail: "يرجى إدخال بريد صالح.",
      errPassword: "كلمة المرور 6 أحرف على الأقل.", errPhone: "يرجى إدخال رقم هاتف صالح.",
      errDesc: "يرجى كتابة رسالتك.", errAiDraft: "اكتب مسودة قصيرة أولاً.",
      errConfig: "إعدادات البوابة ناقصة.", errSend: "تعذر الإرسال. حاول مرة أخرى.",
      errUpload: "فشل رفع الوسائط", errBig: "الملف كبير جداً (حد أقصى 40MB)",
      uploading: "جارٍ رفع الوسائط…", uploaded: "الوسائط جاهزة", waitUpload: "يرجى الانتظار حتى يكتمل الرفع…",
      foot: "Valoria Hotel · Bavulsuite\\nيصل منشورك للمدير؛ حساب التطبيق جاهز.",
      respTitle: "مسؤول Valoria Hotel و Bavulsuite",
      respNote: "تُراجع فوراً. رسالتك تصل مباشرة إلى المدير المسؤول.",
      respProfile: "عرض الملف · ويب"
    }
  };

  var cfg = window.__VALORIA_SIKAYET__ || {};
  var apiBase = (cfg.supabaseUrl || "").replace(/\\/$/, "");
  var apiUrl = apiBase + (cfg.apiPath || "/functions/v1/public-complaint");
  var anonKey = cfg.anonKey || "";
  var topic = "complaint", category = "personnel";
  var MAX = 4;
  var items = []; // {id,file,previewUrl,status,media,el}
  var lang = "tr";
  var t = I18N.tr;

  function qs(id){ return document.getElementById(id); }
  function authHeaders(json){
    var h={Authorization:"Bearer "+anonKey,apikey:anonKey};
    if(json) h["Content-Type"]="application/json";
    return h;
  }
  function showErr(msg){ var el=qs("err"); el.textContent=msg||""; el.classList.toggle("show",!!msg); }
  function uid(){ return Math.random().toString(36).slice(2)+Date.now().toString(36); }

  function detectLang(){
    try{
      var saved=localStorage.getItem("valoria_sikayet_lang");
      if(saved && I18N[saved]) return saved;
    }catch(_){}
    var nav=(navigator.language||"tr").toLowerCase();
    if(nav.indexOf("ar")===0) return "ar";
    if(nav.indexOf("en")===0) return "en";
    return "tr";
  }

  function applyLang(code){
    lang = I18N[code] ? code : "tr";
    t = I18N[lang];
    try{ localStorage.setItem("valoria_sikayet_lang", lang); }catch(_){}
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.title = "Valoria · " + t.title;
    qs("langSwitch").querySelectorAll("button").forEach(function(b){
      b.classList.toggle("on", b.getAttribute("data-lang")===lang);
    });
    qs("tTitle").textContent=t.title;
    qs("tLead").textContent=t.lead;
    qs("tNoLogin").textContent=t.noLogin;
    qs("tFormTitle").textContent=t.formTitle;
    qs("tFormSub").textContent=t.formSub;
    qs("tAccountSec").textContent=t.accountSec;
    qs("tAccountHint").textContent=t.accountHint;
    qs("tShareSec").textContent=t.shareSec;
    qs("tRating").innerHTML=t.rating.replace("*",'<span class="req">*</span>');
    qs("tTopic").textContent=t.topic;
    qs("tCategory").textContent=t.category;
    qs("tFirst").innerHTML=t.first.replace("*",'<span class="req">*</span>');
    qs("tLast").innerHTML=t.last.replace("*",'<span class="req">*</span>');
    qs("tEmail").innerHTML=t.email.replace("*",'<span class="req">*</span>');
    qs("tPassword").innerHTML=t.password.replace("*",'<span class="req">*</span>');
    qs("tPhone").innerHTML=t.phone.replace("*",'<span class="req">*</span>');
    qs("tRoom").textContent=t.room;
    qs("tDesc").innerHTML=t.desc.replace("*",'<span class="req">*</span>');
    qs("tAiHint").textContent=t.aiHint;
    qs("tMedia").textContent=t.media;
    qs("aiBtn").textContent=t.aiBtn;
    qs("submit").textContent=t.submit;
    qs("tOkTitle").textContent=t.okTitle;
    qs("tOkBody").textContent=t.okBody;
    qs("tPromoBadge").textContent=t.promoBadge;
    qs("tPromoTitle").textContent=t.promoTitle;
    qs("tPromoSub").textContent=t.promoSub;
    qs("tGetOn").textContent=t.getOn;
    qs("tGetOn2").textContent=t.getOn;
    qs("tAppleName").textContent=t.appleName;
    qs("tAppleSub").textContent=t.appleSub;
    qs("tPlayName").textContent=t.playName;
    qs("tPlaySub").textContent=t.playSub;
    qs("btnApple").href="https://apps.apple.com/tr/app/valoria/id6760633347?l="+lang;
    qs("btnPlay").href="https://play.google.com/store/apps/details?id=com.valoria.hotel&pcampaignid=web_share";
    qs("firstName").placeholder=t.firstPh;
    qs("lastName").placeholder=t.lastPh;
    qs("email").placeholder=t.emailPh;
    qs("password").placeholder=t.passwordPh;
    qs("phone").placeholder=t.phonePh;
    qs("room").placeholder=t.roomPh;
    qs("description").placeholder=t.descPh;
    qs("footNote").innerHTML=t.foot.replace("\\n","<br/>");
    qs("respTitle").textContent=t.respTitle;
    qs("respNote").textContent=t.respNote;
    var pl=qs("respProfileLink");
    if(pl) pl.textContent=t.respProfile||"";
    document.querySelectorAll("[data-i18n]").forEach(function(el){
      var k=el.getAttribute("data-i18n");
      if(t[k]) el.textContent=t[k];
    });
    updateUploadStatus();
  }

  qs("langSwitch").addEventListener("click", function(e){
    var b=e.target.closest("button[data-lang]");
    if(b) applyLang(b.getAttribute("data-lang"));
  });

  function wireToggle(rootId, setter){
    qs(rootId).addEventListener("click", function(e){
      var btn=e.target.closest("button[data-v]");
      if(!btn) return;
      qs(rootId).querySelectorAll("button").forEach(function(b){ b.classList.remove("on"); });
      btn.classList.add("on");
      setter(btn.getAttribute("data-v"));
    });
  }
  wireToggle("topics", function(v){ topic=v; });
  wireToggle("categories", function(v){ category=v; });

  var rating = 5;
  function setRating(n){
    rating = n;
    qs("stars").querySelectorAll("button").forEach(function(b){
      var v = Number(b.getAttribute("data-v"));
      b.classList.toggle("on", v <= rating);
    });
  }
  qs("stars").addEventListener("click", function(e){
    var btn = e.target.closest("button[data-v]");
    if(!btn) return;
    setRating(Number(btn.getAttribute("data-v")) || 5);
  });
  setRating(5);

  function updateUploadStatus(){
    var pending=items.filter(function(i){ return i.status==="uploading"||i.status==="queued"; }).length;
    var ready=items.filter(function(i){ return i.status==="ready"; }).length;
    var failed=items.filter(function(i){ return i.status==="error"; }).length;
    var el=qs("uploadStatus");
    if(!items.length){ el.textContent=""; return; }
    if(pending) el.textContent=t.uploading+" ("+ready+"/"+items.length+")";
    else if(failed) el.textContent=t.errUpload;
    else el.textContent=t.uploaded+" ("+ready+")";
  }

  function compressImage(file){
    return new Promise(function(resolve){
      if(!file.type || file.type.indexOf("image/")!==0 || file.type.indexOf("gif")>=0){
        resolve(file); return;
      }
      if(file.size < 450000){ resolve(file); return; }
      var url=URL.createObjectURL(file);
      var img=new Image();
      img.onload=function(){
        var max=1280;
        var w=img.width, h=img.height;
        if(w>max || h>max){
          if(w>h){ h=Math.round(h*(max/w)); w=max; }
          else { w=Math.round(w*(max/h)); h=max; }
        }
        var canvas=document.createElement("canvas");
        canvas.width=w; canvas.height=h;
        var ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,w,h);
        canvas.toBlob(function(blob){
          URL.revokeObjectURL(url);
          if(!blob || blob.size>=file.size){ resolve(file); return; }
          resolve(new File([blob], (file.name||"photo").replace(/\\.[^.]+$/,"")+".jpg", {type:"image/jpeg"}));
        }, "image/jpeg", 0.72);
      };
      img.onerror=function(){ URL.revokeObjectURL(url); resolve(file); };
      img.src=url;
    });
  }

  async function uploadOne(item){
    item.status="uploading";
    if(item.el) item.el.classList.add("uploading");
    updateUploadStatus();
    try{
      var file=item.file;
      if(file.type && file.type.indexOf("image/")===0){
        file=await compressImage(file);
        item.file=file;
      }
      var mime=(file.type||"image/jpeg").toLowerCase();
      var prepRes=await fetch(apiUrl,{
        method:"POST", headers:authHeaders(true),
        body:JSON.stringify({action:"signed-upload", mime:mime})
      });
      var prep=await prepRes.json().catch(function(){return {};});
      if(!prepRes.ok || !prep.ok || !prep.token || !prep.path){
        throw new Error((prep&&prep.error)||t.errUpload);
      }
      var upRes;
      if(prep.signedUrl){
        upRes=await fetch(prep.signedUrl,{
          method:"PUT",
          headers:{"Content-Type":mime,"x-upsert":"false"},
          body:file
        });
      } else {
        upRes=await fetch(apiBase+"/storage/v1/object/upload/sign/qr-complaints/"+prep.path+"?token="+encodeURIComponent(prep.token),{
          method:"PUT",
          headers:{"Content-Type":mime,Authorization:"Bearer "+anonKey,apikey:anonKey,"x-upsert":"false"},
          body:file
        });
      }
      if(!upRes.ok) throw new Error(t.errUpload);
      item.media={
        url:prep.publicUrl,
        type:prep.type || (mime.indexOf("video/")===0?"video":"image"),
        mime:mime,
        name:file.name||undefined
      };
      item.status="ready";
      if(item.el){ item.el.classList.remove("uploading"); item.el.classList.add("ready"); }
    }catch(err){
      item.status="error";
      item.error=err&&err.message?err.message:t.errUpload;
      if(item.el) item.el.classList.remove("uploading");
      showErr(item.error);
    }
    updateUploadStatus();
  }

  function renderPreviews(){
    var box=qs("previews");
    box.innerHTML="";
    items.forEach(function(item){
      var div=document.createElement("div");
      div.className="preview"+(item.status==="uploading"||item.status==="queued"?" uploading":"")+(item.status==="ready"?" ready":"");
      if(item.file.type.indexOf("video/")===0){
        var v=document.createElement("video"); v.src=item.previewUrl; v.muted=true; v.playsInline=true; div.appendChild(v);
      } else {
        var img=document.createElement("img"); img.src=item.previewUrl; img.alt=""; div.appendChild(img);
      }
      var badge=document.createElement("span");
      badge.className="badge";
      badge.textContent=item.status==="ready"?"OK":(item.file.type.indexOf("video/")===0?"Video":"Foto");
      div.appendChild(badge);
      var rm=document.createElement("button");
      rm.type="button"; rm.className="rm"; rm.textContent="×";
      rm.onclick=function(){
        items=items.filter(function(x){ return x.id!==item.id; });
        renderPreviews(); updateUploadStatus();
      };
      div.appendChild(rm);
      item.el=div;
      box.appendChild(div);
    });
  }

  async function addFiles(list){
    var incoming=[];
    for(var i=0;i<list.length;i++){
      if(items.length+incoming.length>=MAX) break;
      var f=list[i];
      if(!f) continue;
      if(f.size>40*1024*1024){ showErr(t.errBig+": "+f.name); continue; }
      incoming.push({
        id:uid(),
        file:f,
        previewUrl:URL.createObjectURL(f),
        status:"queued",
        media:null,
        el:null
      });
    }
    items=items.concat(incoming);
    renderPreviews();
    showErr("");
    // Paralel yükleme — gönderimi bekletmez
    await Promise.all(incoming.map(function(item){ return uploadOne(item); }));
  }

  ["pickImage","pickVideo","pickCamera"].forEach(function(id){
    qs(id).addEventListener("change", function(e){
      addFiles(e.target.files||[]);
      e.target.value="";
    });
  });

  qs("aiBtn").addEventListener("click", async function(){
    showErr("");
    var text=(qs("description").value||"").trim();
    if(text.length<3){ showErr(t.errAiDraft); return; }
    var btn=qs("aiBtn");
    btn.disabled=true; btn.textContent=t.aiBusy;
    try{
      var res=await fetch(apiUrl,{
        method:"POST", headers:authHeaders(true),
        body:JSON.stringify({action:"improve-text", text:text, topic_type:topic, category:category, lang:lang})
      });
      var data=await res.json().catch(function(){return {};});
      if(!res.ok||!data.ok||!data.text) throw new Error((data&&data.error)||t.errSend);
      qs("description").value=data.text;
    }catch(err){
      showErr(err&&err.message?err.message:t.errSend);
    }finally{
      btn.disabled=false; btn.textContent=t.aiBtn;
    }
  });

  qs("form").addEventListener("submit", async function(e){
    e.preventDefault();
    showErr("");
    var firstName=(qs("firstName").value||"").trim();
    var lastName=(qs("lastName").value||"").trim();
    var email=(qs("email").value||"").trim();
    var password=(qs("password").value||"");
    var phone=(qs("phone").value||"").trim();
    var room=(qs("room").value||"").trim();
    var description=(qs("description").value||"").trim();
    if(firstName.length<1){ showErr(t.errFirst); return; }
    if(lastName.length<1){ showErr(t.errLast); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showErr(t.errEmail); return; }
    if(password.trim().length<6){ showErr(t.errPassword); return; }
    if(phone.length<7){ showErr(t.errPhone); return; }
    if(description.length<2){ showErr(t.errDesc); return; }
    if(!apiBase||!anonKey){ showErr(t.errConfig); return; }

    var pending=items.filter(function(i){ return i.status==="uploading"||i.status==="queued"; });
    if(pending.length){ showErr(t.waitUpload); return; }
    var failed=items.filter(function(i){ return i.status==="error"; });
    if(failed.length){ showErr(t.errUpload); return; }

    var btn=qs("submit");
    btn.disabled=true; btn.textContent=t.sending;
    qs("loadingBar").classList.add("on");

    try{
      var mediaUrls=items.filter(function(i){ return i.status==="ready"&&i.media; }).map(function(i){ return i.media; });
      var payload={
        topic_type:topic, category:category, description:description,
        first_name:firstName, last_name:lastName, email:email, password:password,
        room_number:room, phone:phone, rating:rating, media_urls:mediaUrls, lang:lang
      };
      var org=new URLSearchParams(location.search).get("org");
      if(org) payload.organization_id=org;

      var res=await fetch(apiUrl,{
        method:"POST", headers:authHeaders(true),
        body:JSON.stringify(payload)
      });
      var data=await res.json().catch(function(){return {};});
      if(!res.ok||!data.ok) throw new Error((data&&data.error)||t.errSend);
      qs("form").style.display="none";
      qs("cardTop").style.display="none";
      if(data.message) qs("tOkBody").textContent=data.message;
      qs("success").classList.add("show");
    }catch(err){
      showErr(err&&err.message?err.message:t.errSend);
      btn.disabled=false; btn.textContent=t.submit;
    }finally{
      qs("loadingBar").classList.remove("on");
    }
  });

  var responsibleStaffId=null;

  function openResponsibleProfile(){
    if(!responsibleStaffId) return;
    var origin=location.origin.replace(/\\/$/,"");
    location.href=origin+"/profil/"+encodeURIComponent(responsibleStaffId);
  }

  function applyResponsible(r){
    if(!r) return;
    qs("respName").textContent=r.name||"Soner";
    if(r.title) qs("respTitle").textContent=r.title;
    if(r.brands) qs("respBrands").textContent=r.brands;
    // note: keep localized default unless server note is preferred — show server note if present
    if(r.note && lang==="tr") qs("respNote").textContent=r.note;
    responsibleStaffId=r.staffId||null;
    var card=qs("respCard");
    if(card){
      card.style.cursor=responsibleStaffId?"pointer":"default";
      card.setAttribute("aria-label",(r.name||"Soner")+" — "+(t.respProfile||""));
    }
    var pl=qs("respProfileLink");
    if(pl) pl.style.display=responsibleStaffId?"":"none";
    var ph=qs("respPh");
    if(r.photoUrl && ph){
      var img=document.createElement("img");
      img.src=r.photoUrl; img.alt=r.name||"";
      img.style.cssText="width:64px;height:64px;border-radius:50%;object-fit:cover;flex-shrink:0;border:2px solid rgba(201,162,39,0.45);background:#1a2236;";
      ph.replaceWith(img);
    } else if(ph){
      ph.textContent=(r.name||"S").charAt(0).toUpperCase();
    }
  }

  async function loadMeta(){
    if(!apiBase||!anonKey) return;
    try{
      var res=await fetch(apiUrl,{headers:authHeaders(false)});
      var data=await res.json();
      if(data&&data.responsible) applyResponsible(data.responsible);
    }catch(_){}
  }

  function applyCategoryFromQuery(){
    try{
      var cat=new URLSearchParams(location.search).get("category");
      if(!cat) return;
      var btn=qs("categories").querySelector('button[data-v="'+cat+'"]');
      if(btn){
        qs("categories").querySelectorAll("button").forEach(function(b){ b.classList.remove("on"); });
        btn.classList.add("on");
        category=cat;
      }
    }catch(_){}
  }

  qs("respCard").addEventListener("click", openResponsibleProfile);
  qs("respCard").addEventListener("keydown", function(e){
    if(e.key==="Enter"||e.key===" "){ e.preventDefault(); openResponsibleProfile(); }
  });

  applyLang(detectLang());
  applyCategoryFromQuery();
  loadMeta();
})();
  </script>
</body>
</html>
`;

fs.writeFileSync(path.join(outDir, 'index.html'), html, 'utf8');
console.log('[bundle-sikayet] yazıldı → dist/sikayet/index.html');
