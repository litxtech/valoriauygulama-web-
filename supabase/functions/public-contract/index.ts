import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Türkçe ve benzeri karakterleri HTML entity yapar; kodlama bozuk olsa bile tarayıcı doğru gösterir */
function toEnt(s: string): string {
  if (!s) return s;
  return String(s)
    .replace(/ğ/g, "&#287;").replace(/Ğ/g, "&#286;")
    .replace(/ü/g, "&#252;").replace(/Ü/g, "&#220;")
    .replace(/ş/g, "&#351;").replace(/Ş/g, "&#350;")
    .replace(/ö/g, "&#246;").replace(/Ö/g, "&#214;")
    .replace(/ç/g, "&#231;").replace(/Ç/g, "&#199;")
    .replace(/ı/g, "&#305;").replace(/İ/g, "&#304;");
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function notifyAdminsNewContractAcceptance(
  supabaseUrl: string,
  serviceKey: string,
  supabase: ReturnType<typeof createClient>,
  params: { guestName?: string | null; roomId?: string | null; lang: string }
) {
  try {
    let roomBit = "";
    if (params.roomId && String(params.roomId).trim().length > 0) {
      const { data: r } = await supabase.from("rooms").select("room_number").eq("id", params.roomId).maybeSingle();
      const n = (r as { room_number?: string } | null)?.room_number?.trim();
      if (n) roomBit = ` · ${n} no'lu oda`;
    }
    const name = (params.guestName ?? "").trim() || "Misafir";
    await fetch(`${supabaseUrl}/functions/v1/notify-admins`, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        title: "Yeni sözleşme onayı",
        body: `${name} sözleşmeyi onayladı (${String(params.lang).toUpperCase()})${roomBit}. Sözleşme onayları ekranından kontrol edin.`,
        data: {
          url: "/admin/contracts/acceptances",
          notificationType: "admin_contract_acceptance_new",
        },
      }),
    });
  } catch {
    /* push hatası onayı engellemesin */
  }
}

/** Tarayıcının sayfayı HTML olarak render etmesi için (kaynak kodu göstermesin) */
const HTML_HEADERS = {
  ...CORS,
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Cache-Control": "no-cache",
};

type ContractRow = {
  id: string;
  lang: string;
  version: number;
  title: string;
  content: string;
  updated_at: string | null;
};

/** Ortak web sözleşme sayfası stilleri — açık tema, iOS input zoom yok (16px) */
function contractPageBaseStyles(extra = ""): string {
  return `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');
    :root{
      --bg:#f5f3ef;
      --surface:#ffffff;
      --text:#1c1917;
      --muted:#78716c;
      --brand:#b8860b;
      --brand-light:#f5ecd8;
      --accent:#292524;
      --line:#e7e5e4;
      --focus:rgba(184,134,11,.28);
      --radius:14px;
      --shadow:0 1px 3px rgba(28,25,23,.06), 0 8px 28px rgba(28,25,23,.07);
      --header-h:64px;
    }
    *,*::before,*::after{box-sizing:border-box;}
    html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;}
    html,body{min-height:100%;}
    body{
      margin:0;
      font-family:"DM Sans",ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;
      background:var(--bg);
      color:var(--text);
      line-height:1.5;
      -webkit-font-smoothing:antialiased;
    }
    .pageHeader{
      position:sticky;top:0;z-index:40;
      background:rgba(255,255,255,.92);
      backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);
      border-bottom:1px solid var(--line);
      box-shadow:0 1px 0 rgba(255,255,255,.8);
    }
    .pageHeaderInner{
      max-width:720px;margin:0 auto;
      padding:14px 16px;
      display:flex;align-items:center;justify-content:space-between;gap:12px;
    }
    .brandBlock{display:flex;align-items:center;gap:12px;min-width:0;}
    .brandMark{
      width:40px;height:40px;border-radius:12px;flex-shrink:0;
      background:linear-gradient(145deg,var(--brand),#e8c96a);
      display:flex;align-items:center;justify-content:center;
      font-weight:800;font-size:15px;color:#1c1300;
      box-shadow:0 4px 12px rgba(184,134,11,.25);
    }
    .brandTitle{font-weight:700;font-size:15px;color:var(--accent);letter-spacing:-.02em;}
    .brandSub{font-size:12px;color:var(--muted);margin-top:2px;font-weight:500;}
    .pill{
      font-size:11px;font-weight:600;color:var(--muted);
      background:var(--bg);border:1px solid var(--line);
      padding:6px 10px;border-radius:999px;white-space:nowrap;flex-shrink:0;
    }
    .wrap{max-width:720px;margin:0 auto;padding:20px 16px 48px;}
    .langBar{
      display:flex;flex-wrap:wrap;align-items:center;gap:6px;
      margin-bottom:20px;padding:4px;
      background:var(--surface);border:1px solid var(--line);
      border-radius:12px;box-shadow:var(--shadow);
    }
    .langBarLabel{
      font-size:11px;font-weight:600;color:var(--muted);
      padding:6px 10px;width:100%;
    }
    @media(min-width:480px){.langBarLabel{width:auto;padding-right:4px;}}
    .langBtn{
      padding:8px 12px;border-radius:8px;font-size:13px;font-weight:600;
      text-decoration:none;color:var(--muted);
      background:transparent;border:1px solid transparent;
      transition:background .15s,color .15s,border-color .15s;
    }
    .langBtn:hover,.langBtn:focus{color:var(--accent);background:var(--bg);}
    .langBtn.active{
      background:var(--brand-light);color:#7c5a0a;
      border-color:rgba(184,134,11,.35);
    }
    .card{
      background:var(--surface);color:var(--text);
      border:1px solid var(--line);border-radius:var(--radius);
      overflow:hidden;box-shadow:var(--shadow);
      margin-bottom:16px;
      animation:fadeUp .4s ease both;
    }
    @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
    .cardHead{
      padding:16px 18px;border-bottom:1px solid var(--line);
      display:flex;gap:10px;align-items:center;justify-content:space-between;
      background:linear-gradient(180deg,#fafaf9,var(--surface));
    }
    .cardHead h1,.cardHead h2{margin:0;font-size:16px;font-weight:700;color:var(--accent);letter-spacing:-.02em;}
    .cardHead:has(.stepBadge){justify-content:flex-start;gap:10px;}
    .stepBadge{
      font-size:11px;font-weight:700;color:var(--brand);
      background:var(--brand-light);padding:4px 8px;border-radius:6px;
    }
    .lang{font-size:12px;color:var(--muted);font-weight:500;}
    .formBlock{padding:18px;}
    .formBlock label{
      display:block;font-size:12px;font-weight:600;color:var(--muted);
      margin-bottom:6px;letter-spacing:.02em;
    }
    .formBlock input,.formBlock select,.formBlock textarea{
      width:100%;padding:12px 14px;
      border:1px solid var(--line);border-radius:10px;
      font-size:16px;font-family:inherit;
      margin-bottom:14px;background:#fafaf9;color:var(--text);
      transition:border-color .15s,box-shadow .15s,background .15s;
      -webkit-appearance:none;appearance:none;
    }
    .formBlock input:focus,.formBlock select:focus,.formBlock textarea:focus{
      outline:none;border-color:var(--brand);
      box-shadow:0 0 0 3px var(--focus);background:var(--surface);
    }
    .formBlock textarea{min-height:80px;resize:vertical;}
    .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    @media(max-width:480px){.row2{grid-template-columns:1fr;}}
    .phoneRow{display:grid;grid-template-columns:108px 1fr;gap:10px;}
    .chipRow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px;}
    .chip{
      padding:10px 16px;border-radius:10px;
      border:1px solid var(--line);background:#fafaf9;
      cursor:pointer;font-size:14px;font-weight:600;color:var(--muted);
      transition:all .15s;user-select:none;
    }
    .chip:hover{border-color:#d6d3d1;color:var(--accent);}
    .chip.selected{
      background:var(--accent);color:#fff;border-color:var(--accent);
      box-shadow:0 4px 12px rgba(41,37,36,.2);
    }
    .signerBox{
      background:var(--brand-light);border:1px solid rgba(184,134,11,.25);
      border-radius:12px;padding:16px 18px;margin:0 18px 18px;
      font-size:13px;line-height:1.55;color:#57534e;
    }
    .signerBox .line{margin-bottom:4px;}
    .signerBox .line:last-child{margin-bottom:0;}
    .contractContent{
      padding:18px;max-height:50vh;overflow:auto;
      line-height:1.6;border-top:1px solid var(--line);
      background:#fafaf9;
    }
    .contractContent a{color:#b45309;text-decoration:none;font-weight:500;}
    .contractContent a:hover{text-decoration:underline;}
    .footer{
      padding:16px 18px;border-top:1px solid var(--line);
      display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;
      background:var(--surface);
    }
    .btn{
      appearance:none;border:0;cursor:pointer;
      padding:14px 22px;border-radius:12px;font-weight:700;font-size:15px;
      font-family:inherit;
      background:linear-gradient(135deg,var(--brand),#ddb84a);
      color:#1c1300;
      box-shadow:0 4px 16px rgba(184,134,11,.3);
      transition:transform .12s,box-shadow .12s;
    }
    .btn:hover{box-shadow:0 6px 20px rgba(184,134,11,.38);}
    .btn:active{transform:translateY(1px);}
    .btn:disabled{opacity:.55;cursor:not-allowed;transform:none;}
    .err{color:#dc2626;font-size:13px;font-weight:600;margin:0;}
    .msg{font-size:13px;font-weight:700;color:#15803d;}
    .sub{font-size:12px;color:var(--muted);line-height:1.5;max-width:520px;}
    .kiosk{opacity:.6}
    .content{padding:18px;max-height:62vh;overflow:auto;line-height:1.6}
    .content a{color:#b45309;text-decoration:none;font-weight:500}
    .content a:hover{text-decoration:underline}
    .storeSection{margin-top:12px;padding-top:16px;border-top:1px solid var(--line);width:100%;}
    .storeTitle{font-size:14px;font-weight:700;color:var(--accent);margin-bottom:10px;}
    .storeBtn{
      display:inline-block;margin:6px 8px 6px 0;padding:12px 18px;border-radius:10px;
      font-weight:700;text-decoration:none;color:#fff;background:var(--accent);
    }
    .storeBtn.second{background:#15803d;}
    .storeAuto{font-size:11px;color:var(--muted);margin-top:8px;}
    ${extra}
  `;
}

function pageHeaderHtml(subtitle: string, pillText?: string): string {
  const pill = pillText ?? `${toEnt("QR ile açıldı")} &#8226; ${new Date().toLocaleDateString("tr-TR")}`;
  return `
    <header class="pageHeader">
      <div class="pageHeaderInner">
        <div class="brandBlock">
          <div class="brandMark">V</div>
          <div>
            <div class="brandTitle">Valoria Hotel</div>
            <div class="brandSub">${subtitle}</div>
          </div>
        </div>
        <div class="pill">${pill}</div>
      </div>
    </header>`;
}

function htmlPage(opts: {
  title: string;
  bodyHtml: string;
  token: string;
  lang: string;
  revision: string | null;
  message?: string;
  accepted?: boolean;
  googlePlayUrl?: string | null;
  appStoreUrl?: string | null;
  designFontSize?: string | null;
  designTheme?: string | null;
  designCompact?: string | null;
}) {
  const { title, bodyHtml, token, lang, revision, message, accepted, googlePlayUrl, appStoreUrl, designFontSize, designTheme, designCompact } = opts;
  const fontSize = designFontSize === "small" ? "12px" : designFontSize === "large" ? "16px" : "14px";
  const compact = designCompact === "1";
  const contentPad = compact ? "8px 14px 14px" : "14px 18px 18px";
  const safeTitle = toEnt(title.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
  const revPart = revision ? `&rev=${encodeURIComponent(revision)}` : "";
  const action = `?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang)}${revPart}`;
  const hasStore = (googlePlayUrl && googlePlayUrl.trim()) || (appStoreUrl && appStoreUrl.trim());
  const gp = (googlePlayUrl || "").trim();
  const as = (appStoreUrl || "").trim();

  const msgColor = accepted ? "#15803d" : "#b45309";

  return `\uFEFF<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${safeTitle}</title>
    <style>
      ${contractPageBaseStyles(`
        .content{padding:${contentPad};max-height:62vh;overflow:auto;font-size:${fontSize};}
        .msg{color:${msgColor};}
      `)}
    </style>
  </head>
  <body>
    ${pageHeaderHtml(toEnt("Sözleşme / Kurallar Onayı"))}
    <div class="wrap">
      ${langBar(token, lang, revision, true)}
      <div class="card">
        <div class="cardHead">
          <h1>${safeTitle}</h1>
          <div class="lang">${lang.toUpperCase()}</div>
        </div>
        <div class="content">${toEnt(bodyHtml)}</div>
        <div class="footer">
          <div class="sub">
            ${toEnt("Bu sözleşme Valoria Hotel tarafından geliştirilen sistem tarafından dijital olarak onaylanmıştır. Sorunuz olursa resepsiyon ile iletişime geçebilirsiniz.")}
            <span class="kiosk"> (Token: ${token.slice(0, 6)}…)</span>
          </div>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:flex-end">
            ${message ? `<div class="msg">${message}</div>` : ""}
            ${
              accepted
                ? ""
                : `<form method="POST" action="${action}" style="margin:0">
                     <button class="btn" type="submit">Okudum, Kabul Ediyorum</button>
                   </form>`
            }
          </div>
          ${
            accepted && hasStore
              ? `
          <div class="storeSection">
            <div class="storeTitle">${toEnt("Uygulamayı indirin")}</div>
            ${gp ? `<a href="${gp}" class="storeBtn second" id="storeGp">Google Play</a>` : ""}
            ${as ? `<a href="${as}" class="storeBtn" id="storeAs">App Store</a>` : ""}
            <div class="storeAuto" id="storeAuto">${toEnt("Cihazınıza göre mağazaya yönlendiriliyorsunuz…")}</div>
          </div>
          <script>
            (function(){
              var ua = navigator.userAgent || "";
              var isAndroid = /Android/i.test(ua);
              var isIos = /iPhone|iPad|iPod/i.test(ua);
              var gp = ${JSON.stringify(gp)};
              var as = ${JSON.stringify(as)};
              var el = document.getElementById("storeAuto");
              var go = function(url){ if(url) window.location.href = url; };
              setTimeout(function(){
                if (isAndroid && gp) { go(gp); return; }
                if (isIos && as) { go(as); return; }
                if (el) el.textContent = "Yukar\u0131daki butondan ma\u011fazaya gidebilirsiniz.";
              }, 2500);
            })();
          </script>`
              : ""
          }
        </div>
      </div>
    </div>
  </body>
</html>`;
}

// Ülke kodu listesi (web form select için)
const COUNTRY_PHONE_CODES = [
  { dial: "+90", name: "Türkiye" },
  { dial: "+1", name: "ABD / Kanada" },
  { dial: "+44", name: "Birleşik Krallık" },
  { dial: "+49", name: "Almanya" },
  { dial: "+33", name: "Fransa" },
  { dial: "+39", name: "İtalya" },
  { dial: "+34", name: "İspanya" },
  { dial: "+31", name: "Hollanda" },
  { dial: "+32", name: "Belçika" },
  { dial: "+43", name: "Avusturya" },
  { dial: "+41", name: "İsviçre" },
  { dial: "+7", name: "Rusya" },
  { dial: "+380", name: "Ukrayna" },
  { dial: "+48", name: "Polonya" },
  { dial: "+30", name: "Yunanistan" },
  { dial: "+351", name: "Portekiz" },
  { dial: "+972", name: "İsrail" },
  { dial: "+971", name: "BAE" },
  { dial: "+966", name: "Suudi Arabistan" },
  { dial: "+20", name: "Mısır" },
  { dial: "+212", name: "Fas" },
  { dial: "+98", name: "İran" },
  { dial: "+994", name: "Azerbaycan" },
  { dial: "+62", name: "Endonezya" },
  { dial: "+81", name: "Japonya" },
  { dial: "+86", name: "Çin" },
  { dial: "+91", name: "Hindistan" },
  { dial: "+61", name: "Avustralya" },
  { dial: "+55", name: "Brezilya" },
  { dial: "+52", name: "Meksika" },
];

const ROOM_TYPES = ["Tek kişilik", "Çift kişilik", "Üç kişilik", "Aile", "Suite", "Diğer"];

// Dil seçici: kod ve etiket (sözleşme bu dillerde yüklenir)
const LANG_OPTIONS = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "ar", label: "العربية" },
  { code: "de", label: "Deutsch" },
  { code: "fr", label: "Français" },
  { code: "ru", label: "Русский" },
  { code: "es", label: "Español" },
];

function langBar(token: string, currentLang: string, revision: string | null, simple?: boolean) {
  const revPart = revision ? `&rev=${encodeURIComponent(revision)}` : "";
  const simplePart = simple ? "&simple=1" : "";
  return (
    '<div class="langBar">' +
    '<span class="langBarLabel">Dil / Language</span>' +
    LANG_OPTIONS.map(
      (l) =>
        `<a href="?token=${encodeURIComponent(token)}&lang=${l.code}${revPart}${simplePart}" class="langBtn${l.code === currentLang ? " active" : ""}">${toEnt(l.label)}</a>`
    ).join("") +
    "</div>"
  );
}

function fullFormPage(opts: {
  title: string;
  contractContent: string;
  token: string;
  lang: string;
  revision: string | null;
  designFontSize?: string | null;
  designCompact?: string | null;
}) {
  const { title, contractContent, token, lang, revision, designFontSize, designCompact } = opts;
  const fontSize = designFontSize === "small" ? "12px" : designFontSize === "large" ? "16px" : "14px";
  const compact = designCompact === "1";
  const revPart = revision ? `&rev=${encodeURIComponent(revision)}` : "";
  const action = `?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang)}${revPart}`;
  const safeTitle = toEnt(title.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));

  const countryOptions = COUNTRY_PHONE_CODES.map((c) => `<option value="${c.dial}">${toEnt(c.dial + " " + c.name)}</option>`).join("");
  const nationalityOptions = COUNTRY_PHONE_CODES.map((c) => `<option value="${toEnt(c.name)}">${toEnt(c.name)}</option>`).join("");
  const roomOptions = ROOM_TYPES.map((r) => `<option value="${toEnt(r)}">${toEnt(r)}</option>`).join("");

  return `\uFEFF<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>${safeTitle} &#8211; ${toEnt("Misafir kayıt")}</title>
  <style>
    ${contractPageBaseStyles(`
      .contractContent{font-size:${fontSize};}
      .photoActions{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 12px;}
      .photoBtn{
        display:inline-flex;align-items:center;justify-content:center;
        padding:10px 14px;border:1px solid var(--line);border-radius:10px;
        background:#fafaf9;color:var(--accent);font-size:14px;font-weight:600;cursor:pointer;
        transition:all .15s;
      }
      .photoBtn:hover{border-color:#d6d3d1;background:#fff;}
      .photoBtn input{display:none;}
      .photoPreviewWrap{
        display:flex;align-items:center;gap:12px;
        padding:10px;border:1px dashed #d6d3d1;border-radius:12px;background:#fafaf9;
        margin-bottom:12px;
      }
      .photoPreview{width:68px;height:68px;border-radius:12px;object-fit:cover;border:1px solid var(--line);}
      .photoRemoveBtn{
        border:1px solid #e7e5e4;background:#fff;color:#7f1d1d;
        border-radius:10px;padding:8px 10px;font-weight:600;cursor:pointer;
      }
    `)}
  </style>
</head>
<body>
  ${pageHeaderHtml(toEnt("Sözleşme ve misafir bilgileri"), toEnt("QR ile açıldı"))}
  <div class="wrap">
    ${langBar(token, lang, revision, false)}

    <form id="f" method="POST" action="${action}" enctype="multipart/form-data">
      <div class="card">
        <div class="cardHead">
          <span class="stepBadge">1 / 2</span>
          <h2>${toEnt("Misafir bilgileri")}</h2>
        </div>
        <div class="formBlock">
          <label>${toEnt("Ad Soyad")} *</label>
          <input type="text" name="full_name" required placeholder="${toEnt("Ahmet Yılmaz")}" />
          <label>${toEnt("Profil resmi")} (${toEnt("isteğe bağlı")})</label>
          <div class="photoActions">
            <label class="photoBtn">
              ${toEnt("Kameradan çek")}
              <input type="file" id="photoCameraInput" name="profile_photo_file" accept="image/*" capture="environment" />
            </label>
            <label class="photoBtn">
              ${toEnt("Galeriden yükle")}
              <input type="file" id="photoGalleryInput" name="profile_photo_file" accept="image/*" />
            </label>
          </div>
          <div class="photoPreviewWrap" id="photoPreviewWrap" style="display:none">
            <img id="photoPreview" class="photoPreview" alt="${toEnt("Profil resmi önizleme")}" />
            <button type="button" class="photoRemoveBtn" id="photoRemoveBtn">${toEnt("Resmi kaldır")}</button>
          </div>
          <label>${toEnt("Kimlik tipi")}</label>
          <div class="chipRow">
            <span class="chip selected" data-name="id_type" data-value="tc">TC Kimlik</span>
            <span class="chip" data-name="id_type" data-value="passport">Pasaport</span>
            <span class="chip" data-name="id_type" data-value="other">${toEnt("Sürücü Belgesi")}</span>
          </div>
          <input type="hidden" name="id_type" value="tc" />
          <label>${toEnt("Kimlik numarası")}</label>
          <input type="text" name="id_number" placeholder="TC veya pasaport no" />
          <label>${toEnt("Telefon (WhatsApp)")} *</label>
          <div class="phoneRow">
            <select name="phone_country_code">${countryOptions}</select>
            <input type="tel" name="phone_number" required placeholder="555 123 4567" />
          </div>
          <label>E-posta</label>
          <input type="email" name="email" placeholder="ahmet@email.com" />
          <label>${toEnt("Uyruk")}</label>
          <select name="nationality">${nationalityOptions}</select>
          <label>${toEnt("Doğum tarihi (GG.AA.YYYY)")}</label>
          <input type="text" name="date_of_birth" placeholder="15.05.1985" />
          <label>${toEnt("Cinsiyet")}</label>
          <div class="chipRow">
            <span class="chip selected" data-name="gender" data-value="male">Erkek</span>
            <span class="chip" data-name="gender" data-value="female">${toEnt("Kadın")}</span>
          </div>
          <input type="hidden" name="gender" value="male" />
          <label>${toEnt("Adres")}</label>
          <textarea name="address" placeholder="${toEnt("Atatürk Cad. No:123, Şehir")}"></textarea>
          <div class="row2">
            <div><label>${toEnt("Giriş (GG.AA.YYYY)")}</label><input type="text" name="check_in_date" placeholder="20.03.2026" /></div>
            <div><label>${toEnt("Çıkış (GG.AA.YYYY)")}</label><input type="text" name="check_out_date" placeholder="25.03.2026" /></div>
          </div>
          <label>${toEnt("Oda tipi")}</label>
          <select name="room_type">${roomOptions}</select>
          <div class="row2">
            <div><label>${toEnt("Yetişkin")}</label><input type="number" name="adults" min="0" value="1" /></div>
            <div><label>${toEnt("Çocuk (12 yaş altı)")}</label><input type="number" name="children" min="0" value="0" /></div>
          </div>
        </div>
      </div>

      <div class="card" style="animation-delay:.08s">
        <div class="cardHead">
          <span class="stepBadge">2 / 2</span>
          <h2>${toEnt("Sözleşme metni")}</h2>
        </div>
        <div class="contractContent">${toEnt(contractContent)}</div>
        <div class="signerBox" id="signerBox">
          <div class="line"><strong>${toEnt("Önizleme")}:</strong> ${toEnt("Formu doldurun; bilgileriniz burada görünecek.")}</div>
        </div>
        <div class="footer">
          <div id="formErr" class="err"></div>
          <button type="submit" class="btn" id="submitBtn">${toEnt("Okudum, kabul ediyorum")}</button>
        </div>
      </div>
    </form>
  </div>
  <script>
    var chips = document.querySelectorAll(".chip");
    var photoCameraInput = document.getElementById("photoCameraInput");
    var photoGalleryInput = document.getElementById("photoGalleryInput");
    var photoPreviewWrap = document.getElementById("photoPreviewWrap");
    var photoPreview = document.getElementById("photoPreview");
    var photoRemoveBtn = document.getElementById("photoRemoveBtn");
    var selectedPhotoFile = null;

    function clearPhoto(){
      selectedPhotoFile = null;
      if(photoCameraInput) photoCameraInput.value = "";
      if(photoGalleryInput) photoGalleryInput.value = "";
      if(photoPreview) photoPreview.removeAttribute("src");
      if(photoPreviewWrap) photoPreviewWrap.style.display = "none";
      updateSigner();
    }
    function setPhoto(file, source){
      if(!file || !file.type || file.type.indexOf("image/") !== 0) return;
      selectedPhotoFile = file;
      if(source === "camera" && photoGalleryInput) photoGalleryInput.value = "";
      if(source === "gallery" && photoCameraInput) photoCameraInput.value = "";
      if(photoPreview){
        photoPreview.src = URL.createObjectURL(file);
      }
      if(photoPreviewWrap) photoPreviewWrap.style.display = "flex";
      updateSigner();
    }
    if(photoCameraInput){
      photoCameraInput.addEventListener("change", function(e){
        var f = e.target && e.target.files && e.target.files[0];
        if(f) setPhoto(f, "camera");
      });
    }
    if(photoGalleryInput){
      photoGalleryInput.addEventListener("change", function(e){
        var f = e.target && e.target.files && e.target.files[0];
        if(f) setPhoto(f, "gallery");
      });
    }
    if(photoRemoveBtn){
      photoRemoveBtn.addEventListener("click", clearPhoto);
    }
    chips.forEach(function(el){
      el.addEventListener("click", function(){
        var name = this.getAttribute("data-name");
        var val = this.getAttribute("data-value");
        var group = document.querySelectorAll(".chip[data-name=" + name + "]");
        group.forEach(function(c){ c.classList.remove("selected"); });
        this.classList.add("selected");
        document.querySelector("input[name=" + name + "]").value = val;
        updateSigner();
      });
    });
    function updateSigner(){
      var dial = document.querySelector("select[name=phone_country_code]").value;
      var phone = document.querySelector("input[name=phone_number]").value.trim();
      var full = document.querySelector("input[name=full_name]").value.trim();
      var id = document.querySelector("input[name=id_number]").value.trim();
      var email = document.querySelector("input[name=email]").value.trim();
      var nat = document.querySelector("select[name=nationality]").value;
      var dob = document.querySelector("input[name=date_of_birth]").value.trim();
      var g = document.querySelector("input[name=gender]").value;
      var addr = document.querySelector("textarea[name=address]").value.trim();
      var ci = document.querySelector("input[name=check_in_date]").value.trim();
      var co = document.querySelector("input[name=check_out_date]").value.trim();
      var rt = document.querySelector("select[name=room_type]").value;
      var ad = document.querySelector("input[name=adults]").value || "1";
      var ch = document.querySelector("input[name=children]").value || "0";
      var gLabel = g === "female" ? "Kad\u0131n" : "Erkek";
      var lines = [];
      if(full) lines.push("Ad Soyad: " + full);
      if(id) lines.push("Kimlik No: " + id);
      if(dial && phone) lines.push("Telefon (WhatsApp): " + dial + " " + phone);
      if(email) lines.push("E-posta: " + email);
      if(nat) lines.push("Uyruk: " + nat);
      if(dob) lines.push("Do\u011fum: " + dob);
      if(selectedPhotoFile && photoPreview && photoPreview.src) {
        lines.push("Profil resmi:<br/><img src='" + photoPreview.src + "' alt='Profil resmi' style='width:60px;height:60px;border-radius:10px;object-fit:cover;border:1px solid #d6d3d1' />");
      }
      lines.push("Cinsiyet: " + gLabel);
      if(addr) lines.push("Adres: " + addr);
      if(ci) lines.push("Giri\u015f: " + ci);
      if(co) lines.push("\u00c7\u0131k\u0131\u015f: " + co);
      lines.push("Oda: " + rt + ", Yeti\u015fkin: " + ad + ", \u00c7ocuk: " + ch);
      document.getElementById("signerBox").innerHTML = lines.length ? lines.map(function(l){ return "<div class=line>" + l + "</div>"; }).join("") : "<div class=line>Formu doldurun.</div>";
    }
    ["full_name","id_number","phone_number","email","date_of_birth","address","check_in_date","check_out_date","adults","children"].forEach(function(name){
      var el = document.querySelector("[name=" + name + "]");
      if(el) el.addEventListener("input", updateSigner);
    });
    document.querySelector("select[name=phone_country_code]").addEventListener("change", updateSigner);
    document.querySelector("select[name=nationality]").addEventListener("change", updateSigner);
    document.querySelector("select[name=room_type]").addEventListener("change", updateSigner);
    document.getElementById("f").addEventListener("submit", function(e){
      var fn = document.querySelector("input[name=full_name]").value.trim();
      var ph = document.querySelector("input[name=phone_number]").value.trim();
      var err = document.getElementById("formErr");
      err.textContent = "";
      if(!fn){ e.preventDefault(); err.textContent = "Ad Soyad zorunludur."; return; }
      if(!ph){ e.preventDefault(); err.textContent = "WhatsApp / Telefon numaras\u0131 zorunludur."; return; }
      document.getElementById("submitBtn").disabled = true;
    });
  </script>
</body>
</html>`;
}

function normalizeLang(l?: string | null) {
  const lang = (l ?? "tr").toLowerCase();
  const allowed = new Set(["tr", "en", "ar", "de", "fr", "ru", "es"]);
  return allowed.has(lang) ? lang : "tr";
}

async function getActiveContract(supabase: ReturnType<typeof createClient>, lang: string): Promise<ContractRow | null> {
  // Prefer version=2 if active; otherwise latest active
  const { data: v2 } = await supabase
    .from("contract_templates")
    .select("id, lang, version, title, content, updated_at")
    .eq("lang", lang)
    .eq("version", 2)
    .eq("is_active", true)
    .maybeSingle();

  if (v2) return v2 as ContractRow;

  const { data: anyV } = await supabase
    .from("contract_templates")
    .select("id, lang, version, title, content, updated_at")
    .eq("lang", lang)
    .eq("is_active", true)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (anyV ?? null) as ContractRow | null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const url = new URL(req.url);
  // Hem uzun (token, lang) hem kısa (t, l) parametreleri kabul et – temiz URL için
  const token = (url.searchParams.get("token") ?? url.searchParams.get("t") ?? "").trim();
  const lang = normalizeLang(url.searchParams.get("lang") ?? url.searchParams.get("l"));
  const rev = url.searchParams.get("rev");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  if (!token) {
    return new Response("token gerekli", { status: 400, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
  }

  // Validate token: önce oda QR'ı, yoksa tek QR (lobby) token
  const { data: qr } = await supabase
    .from("room_qr_codes")
    .select("room_id, expires_at")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  let roomId: string | null = qr?.room_id ?? null;
  if (roomId === null) {
    const { data: lobby } = await supabase
      .from("contract_lobby_tokens")
      .select("id")
      .eq("token", token)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!lobby) {
      return new Response("QR token geçersiz veya süresi dolmuş.", { status: 404, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
    }
  }

  const contract = await getActiveContract(supabase, lang);
  if (!contract) {
    return new Response("Sözleşme bulunamadı.", { status: 404, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
  }

  if (req.method === "GET") {
    // loader=1: Tarayıcıda sayfa olarak açılsın diye önce bu HTML dönülür; bu sayfa formu fetch edip yazar (kod gibi görünme sorunu çözülür)
    if (url.searchParams.get("loader") === "1") {
      const loaderHtml = `<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Y&#252;kl&#252;yor...</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f5f3ef;color:#1c1917;margin:0;padding:2rem;text-align:center;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;}
    .spinner{width:40px;height:40px;border:3px solid #e7e5e4;border-top-color:#b8860b;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1rem;}
    @keyframes spin{to{transform:rotate(360deg);}}
    .err{color:#dc2626;margin-top:1rem;font-size:14px;}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <p>S&#246;zle&#351;me sayfas&#305; y&#252;kl&#252;yor...</p>
  <p class="err" id="err"></p>
  <script>
    (function(){
      var p=new URLSearchParams(window.location.search);
      var token=p.get('token')||p.get('t')||'valoria-resepsiyon-qr';
      var lang=p.get('lang')||p.get('l')||'tr';
      var u='https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/public-contract?token='+encodeURIComponent(token)+'&lang='+encodeURIComponent(lang);
      fetch(u,{headers:{'Accept':'text/html'}}).then(function(r){return r.text();}).then(function(h){
        if(!h||h.length<100)throw new Error('Bos yanit');
        document.open();document.write(h);document.close();
      }).catch(function(e){document.getElementById('err').textContent='Yuklenemedi: '+(e.message||'');});
    })();
  <\/script>
</body>
</html>`;
      return new Response(loaderHtml, { status: 200, headers: HTML_HEADERS });
    }

    // Dış sayfa entegrasyonu (litxtech vb.): JSON ile sadece içerik dön
    if (url.searchParams.get("format") === "json") {
      return new Response(
        JSON.stringify({
          title: contract.title,
          content: contract.content,
          lang: contract.lang,
          version: contract.version,
        }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } }
      );
    }
    const simple = url.searchParams.get("simple") === "1";
    const { data: designRows } = await supabase.from("app_settings").select("key, value").in("key", ["contract_font_size", "contract_theme", "contract_compact"]);
    const designMap: Record<string, string | null> = {};
    (designRows ?? []).forEach((r: { key: string; value: unknown }) => {
      designMap[r.key] = r.value != null ? String(r.value) : null;
    });

    // Varsayılan: tam form (ad, WhatsApp, sözleşme, onay). ?simple=1 ile sadece sözleşme + tek buton.
    if (!simple) {
      const html = fullFormPage({
        title: contract.title,
        contractContent: contract.content,
        token,
        lang,
        revision: rev,
        designFontSize: designMap.contract_font_size,
        designCompact: designMap.contract_compact,
      });
return new Response(html, { status: 200, headers: HTML_HEADERS });
  }

  const html = htmlPage({
      title: contract.title,
      bodyHtml: contract.content,
      token,
      lang,
      revision: rev,
      designFontSize: designMap.contract_font_size,
      designTheme: designMap.contract_theme,
      designCompact: designMap.contract_compact,
    });
    return new Response(html, { status: 200, headers: HTML_HEADERS });
  }

  if (req.method === "POST") {
    let postToken = token;
    let postLang = lang;
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await req.json()) as { token?: string; lang?: string; t?: string; l?: string };
        postToken = (body.token ?? body.t ?? "").trim();
        postLang = normalizeLang(body.lang ?? body.l);
      } catch {
        return new Response(JSON.stringify({ error: "Geçersiz JSON" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      if (!postToken) {
        return new Response(JSON.stringify({ error: "token gerekli" }), {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      // Token tekrar doğrula (oda QR veya lobby token)
      const { data: qrPost } = await supabase
        .from("room_qr_codes")
        .select("room_id")
        .eq("token", postToken)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      let postRoomId: string | null = qrPost?.room_id ?? null;
      if (postRoomId === null) {
        const { data: lobbyPost } = await supabase
          .from("contract_lobby_tokens")
          .select("id")
          .eq("token", postToken)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();
        if (!lobbyPost) {
          return new Response(JSON.stringify({ error: "Token geçersiz veya süresi dolmuş" }), {
            status: 404,
            headers: { ...CORS, "Content-Type": "application/json" },
          });
        }
      }
      const contractPost = await getActiveContract(supabase, postLang);
      if (!contractPost) {
        return new Response(JSON.stringify({ error: "Sözleşme bulunamadı" }), {
          status: 404,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      const ua = req.headers.get("user-agent");
      const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
      const { error: accJsonErr } = await supabase.from("contract_acceptances").insert({
        token: postToken,
        room_id: postRoomId,
        contract_lang: postLang,
        contract_version: contractPost.version,
        contract_template_id: contractPost.id,
        user_agent: ua,
        ip_address: ip,
        source: "web",
      });
      if (!accJsonErr) {
        await notifyAdminsNewContractAcceptance(supabaseUrl, serviceKey, supabase, {
          guestName: null,
          roomId: postRoomId,
          lang: postLang,
        });
      }
      return new Response(JSON.stringify({ success: true, message: "Onayınız alınmıştır." }), {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // Form POST: tam form (full_name vb.) veya basit onay
    const ua = req.headers.get("user-agent");
    const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;

    let formData: Record<string, string> = {};
    let profilePhotoFile: File | null = null;
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      body.split("&").forEach((pair) => {
        const [k, v] = pair.split("=").map((s) => decodeURIComponent(s.replace(/\+/g, " ")));
        if (k) formData[k] = v ?? "";
      });
    } else if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      for (const [k, v] of fd.entries()) {
        if (typeof v === "string") formData[k] = v;
        else if (k === "profile_photo_file" && v.size > 0) profilePhotoFile = v;
      }
    }

    const fullName = (formData.full_name ?? "").trim();
    const hasFullForm = fullName.length > 0;
    let insertedGuestId: string | null = null;

    if (hasFullForm) {
      const phoneCountry = (formData.phone_country_code ?? "+90").trim();
      const phoneNumber = (formData.phone_number ?? "").trim();
      const fullPhone = phoneCountry && phoneNumber ? `${phoneCountry} ${phoneNumber}` : null;

      function parseDDMMYYYY(s: string): string | null {
        const t = (s ?? "").trim();
        if (!t) return null;
        const parts = t.split(/[./-]/).map((p) => parseInt(p, 10));
        if (parts.length !== 3) return null;
        const [d, m, y] = parts;
        if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null;
        const date = new Date(y, m - 1, d);
        return date.toISOString().slice(0, 10);
      }
      const checkInIso = parseDDMMYYYY(formData.check_in_date ?? "");
      const checkOutIso = parseDDMMYYYY(formData.check_out_date ?? "");
      const dobIso = parseDDMMYYYY(formData.date_of_birth ?? "");
      let photoUrl: string | null = null;

      if (profilePhotoFile && profilePhotoFile.type.startsWith("image/")) {
        const ext = profilePhotoFile.type.includes("png")
          ? "png"
          : profilePhotoFile.type.includes("webp")
            ? "webp"
            : profilePhotoFile.type.includes("heic")
              ? "heic"
              : "jpg";
        const photoPath = `guest/web-contract/${crypto.randomUUID()}.${ext}`;
        const bytes = new Uint8Array(await profilePhotoFile.arrayBuffer());
        const { error: uploadErr } = await supabase.storage.from("profiles").upload(photoPath, bytes, {
          contentType: profilePhotoFile.type || "image/jpeg",
          upsert: true,
        });
        if (!uploadErr) {
          const { data: pub } = supabase.storage.from("profiles").getPublicUrl(photoPath);
          photoUrl = pub?.publicUrl ?? null;
        }
      }

      const guestPayload = {
        full_name: fullName,
        id_number: (formData.id_number ?? "").trim() || null,
        id_type: (formData.id_type ?? "tc") as string,
        phone: fullPhone,
        phone_country_code: phoneCountry || "+90",
        email: (formData.email ?? "").trim() || null,
        nationality: (formData.nationality ?? "").trim() || null,
        contract_lang: lang,
        contract_template_id: contract.id,
        date_of_birth: dobIso || null,
        gender: (formData.gender ?? "male") as string,
        address: (formData.address ?? "").trim() || null,
        room_id: roomId,
        check_in_at: checkInIso ? `${checkInIso}T12:00:00.000Z` : null,
        check_out_at: checkOutIso ? `${checkOutIso}T12:00:00.000Z` : null,
        room_type: (formData.room_type ?? "").trim() || null,
        adults: Math.max(0, parseInt(formData.adults ?? "1", 10) || 1),
        children: Math.max(0, parseInt(formData.children ?? "0", 10) || 0),
        photo_url: photoUrl,
        status: "pending",
      };

      const { data: insertedGuest, error: guestErr } = await supabase
        .from("guests")
        .insert(guestPayload)
        .select("id")
        .single();
      if (guestErr) {
        return new Response(
          `Kayıt oluşturulamadı: ${guestErr.message}`,
          { status: 500, headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } }
        );
      }
      if (insertedGuest?.id) insertedGuestId = insertedGuest.id;
    }

    const { error: accFormErr } = await supabase.from("contract_acceptances").insert({
      token,
      room_id: roomId,
      contract_lang: lang,
      contract_version: contract.version,
      contract_template_id: contract.id,
      user_agent: ua,
      ip_address: ip,
      source: "web",
      guest_id: insertedGuestId,
    });
    if (!accFormErr) {
      await notifyAdminsNewContractAcceptance(supabaseUrl, serviceKey, supabase, {
        guestName: hasFullForm ? fullName : null,
        roomId,
        lang,
      });
    }

    const { data: settingsRows } = await supabase.from("app_settings").select("key, value").in("key", ["google_play_url", "app_store_url", "contract_font_size", "contract_theme", "contract_compact"]);
    const settingsMap: Record<string, string | null> = {};
    (settingsRows ?? []).forEach((r: { key: string; value: unknown }) => {
      settingsMap[r.key] = r.value != null ? String(r.value) : null;
    });

    const html = htmlPage({
      title: contract.title,
      bodyHtml: contract.content,
      token,
      lang,
      revision: rev,
      message: toEnt("Onayınız alınmıştır. Dilerseniz aşağıdan uygulamayı indirebilirsiniz."),
      accepted: true,
      googlePlayUrl: settingsMap.google_play_url,
      appStoreUrl: settingsMap.app_store_url,
      designFontSize: settingsMap.contract_font_size,
      designTheme: settingsMap.contract_theme,
      designCompact: settingsMap.contract_compact,
    });
    return new Response(html, { status: 200, headers: HTML_HEADERS });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
});

