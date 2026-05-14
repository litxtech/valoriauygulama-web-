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
  const headPad = compact ? "12px 14px" : "16px 18px";
  const safeTitle = toEnt(title.replaceAll("<", "&lt;").replaceAll(">", "&gt;"));
  const revPart = revision ? `&rev=${encodeURIComponent(revision)}` : "";
  const action = `?token=${encodeURIComponent(token)}&lang=${encodeURIComponent(lang)}${revPart}`;
  const hasStore = (googlePlayUrl && googlePlayUrl.trim()) || (appStoreUrl && appStoreUrl.trim());
  const gp = (googlePlayUrl || "").trim();
  const as = (appStoreUrl || "").trim();

  return `\uFEFF<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${safeTitle}</title>
    <style>
      :root{
        --bg:#0b1220;
        --card:#ffffff;
        --muted:#6b7280;
        --text:#111827;
        --brand:#b8860b;
        --brand2:#1a365d;
        --line:#e5e7eb;
      }
      html,body{height:100%;}
      body{
        margin:0;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
        background: radial-gradient(1200px 600px at 20% -10%, rgba(184,134,11,0.35), transparent 60%),
                    radial-gradient(900px 600px at 90% 0%, rgba(26,54,93,0.35), transparent 55%),
                    var(--bg);
        color:#fff;
      }
      .wrap{max-width:980px;margin:0 auto;padding:24px 16px 56px;}
      .hero{display:flex;justify-content:space-between;gap:14px;align-items:flex-end;margin:8px 0 18px;}
      .brand{font-weight:800;letter-spacing:.3px}
      .brand small{display:block;color:rgba(255,255,255,.75);font-weight:600;margin-top:6px}
      .pill{font-size:12px;color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.18);padding:6px 10px;border-radius:999px}
      .card{
        background:linear-gradient(180deg, rgba(255,255,255,1), rgba(255,255,255,.98));
        color:var(--text);
        border:1px solid rgba(255,255,255,.22);
        border-radius:18px;
        overflow:hidden;
        box-shadow: 0 18px 60px rgba(0,0,0,.35);
      }
      .cardHead{padding:${headPad};border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;justify-content:space-between}
      .cardHead h1{font-size:16px;margin:0;font-weight:800;color:var(--brand2)}
      .lang{font-size:12px;color:var(--muted)}
      .content{padding:${contentPad};max-height:62vh;overflow:auto;font-size:${fontSize};line-height:1.5}
      .content a{color:#2563eb;text-decoration:none}
      .content a:hover{text-decoration:underline}
      .footer{padding:14px 18px;border-top:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:space-between}
      .msg{font-size:13px;color:${accepted ? "#065f46" : "#92400e"};font-weight:700}
      .btn{
        appearance:none;border:0;cursor:pointer;
        padding:14px 16px;border-radius:14px;font-weight:800;
        background:linear-gradient(135deg, var(--brand), #f2c14d);
        color:#1b1300;
        box-shadow: 0 10px 26px rgba(184,134,11,.35);
      }
      .btn:active{transform:translateY(1px)}
      .sub{font-size:12px;color:var(--muted);line-height:1.4;max-width:520px}
      .kiosk{opacity:.75}
      .storeSection{margin-top:16px;padding-top:16px;border-top:1px solid var(--line);}
      .storeTitle{font-size:14px;font-weight:700;color:var(--brand2);margin-bottom:10px;}
      .storeBtn{display:inline-block;margin:6px 8px 6px 0;padding:12px 18px;border-radius:12px;font-weight:700;text-decoration:none;color:#fff;background:var(--brand2);}
      .storeBtn.second{background:#34a853;}
      .storeBtn:active{opacity:0.9}
      .storeAuto{font-size:11px;color:var(--muted);margin-top:8px;}
      .langBar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:16px;padding:12px 14px;background:rgba(255,255,255,.08);border-radius:12px;border:1px solid rgba(255,255,255,.12);}
      .langBarLabel{font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-right:8px;}
      .langBtn{padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;color:rgba(255,255,255,.9);background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);}
      .langBtn:hover,.langBtn:focus{background:rgba(255,255,255,.18);color:#fff;}
      .langBtn.active{background:var(--brand);color:#1b1300;border-color:var(--brand);}
      @media (prefers-color-scheme: dark){
        .card{background:#0b1220;color:#e5e7eb}
        .cardHead{border-bottom:1px solid rgba(255,255,255,.08)}
        .footer{border-top:1px solid rgba(255,255,255,.08)}
        .cardHead h1{color:#fff}
        .lang,.sub{color:rgba(255,255,255,.7)}
        .content a{color:#93c5fd}
        .msg{color:${accepted ? "#86efac" : "#fde68a"}}
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="hero">
        <div class="brand">Valoria Hotel<small>${toEnt("Sözleşme / Kurallar Onayı")}</small></div>
        <div class="pill">${toEnt("QR ile açıldı")} &#8226; ${new Date().toLocaleDateString("tr-TR")}</div>
      </div>
      ${langBar(token, lang, revision, true)}
      <div class="card">
        <div class="cardHead">
          <h1>${safeTitle}</h1>
          <div class="lang">Dil: ${lang.toUpperCase()}</div>
        </div>
        <div class="content">${toEnt(bodyHtml)}</div>
        <div class="footer">
          <div class="sub">
            ${toEnt("Bu onay kayıt altına alınır. Sorunuz olursa resepsiyon ile iletişime geçebilirsiniz.")}
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
    :root{ --bg:#0b1220; --card:#fff; --muted:#6b7280; --text:#111827; --brand:#b8860b; --brand2:#1a365d; --line:#e5e7eb; }
    *{box-sizing:border-box;}
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:#fff;}
    .wrap{max-width:720px;margin:0 auto;padding:20px 16px 40px;}
    .hero{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:20px;}
    .brand{font-weight:800;} .brand small{display:block;color:rgba(255,255,255,.75);font-size:13px;margin-top:4px;}
    .pill{font-size:12px;color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.2);padding:6px 12px;border-radius:999px;}
    .card{background:var(--card);color:var(--text);border-radius:16px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.3);margin-bottom:16px;}
    .cardHead{padding:14px 18px;border-bottom:1px solid var(--line);}
    .cardHead h2{margin:0;font-size:15px;font-weight:800;color:var(--brand2);}
    .formBlock{padding:14px 18px;}
    .formBlock label{display:block;font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;}
    .formBlock input,.formBlock select,.formBlock textarea{width:100%;padding:12px;border:1px solid var(--line);border-radius:10px;font-size:15px;margin-bottom:12px;}
    .formBlock textarea{min-height:70px;resize:vertical;}
    .row2{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
    .phoneRow{display:grid;grid-template-columns:100px 1fr;gap:10px;}
    .chipRow{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;}
    .chip{padding:10px 14px;border-radius:10px;border:1px solid var(--line);background:#f9fafb;cursor:pointer;font-size:14px;}
    .chip.selected{background:var(--brand2);color:#fff;border-color:var(--brand2);}
    .signerBox{background:rgba(184,134,11,.12);border:1px solid rgba(184,134,11,.4);border-radius:12px;padding:14px;margin:14px 18px;font-size:13px;line-height:1.5;}
    .signerBox .line{margin-bottom:4px;}
    .contractContent{padding:14px 18px;max-height:50vh;overflow:auto;font-size:${fontSize};line-height:1.5;border-top:1px solid var(--line);}
    .footer{padding:14px 18px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between;}
    .btn{appearance:none;border:0;cursor:pointer;padding:14px 20px;border-radius:12px;font-weight:800;background:linear-gradient(135deg,var(--brand),#f2c14d);color:#1b1300;}
    .btn:disabled{opacity:0.6;cursor:not-allowed;}
    .err{color:#dc2626;font-size:13px;margin-top:8px;}
    .langBar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:16px;padding:12px 14px;background:rgba(255,255,255,.08);border-radius:12px;border:1px solid rgba(255,255,255,.12);}
    .langBarLabel{font-size:12px;font-weight:600;color:rgba(255,255,255,.7);margin-right:8px;}
    .langBtn{padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;color:rgba(255,255,255,.9);background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);}
    .langBtn:hover,.langBtn:focus{background:rgba(255,255,255,.18);color:#fff;}
    .langBtn.active{background:var(--brand);color:#1b1300;border-color:var(--brand);}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="brand">Valoria Hotel<small>${toEnt("Sözleşme ve misafir bilgileri")}</small></div>
      <div class="pill">${toEnt("QR ile açıldı")}</div>
    </div>
    ${langBar(token, lang, revision, false)}

    <form id="f" method="POST" action="${action}">
      <div class="card">
        <div class="cardHead"><h2>1. ${toEnt("Zorunlu bilgiler")}</h2></div>
        <div class="formBlock">
          <label>${toEnt("Ad Soyad")} *</label>
          <input type="text" name="full_name" required placeholder="${toEnt("Ahmet Yılmaz")}" />
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

      <div class="card">
        <div class="cardHead"><h2>2. ${toEnt("Sözleşme metni")}</h2></div>
        <div class="contractContent">${toEnt(contractContent)}</div>
        <div class="signerBox" id="signerBox">
          <div class="line">${toEnt("Formu doldurun; imzalayan bilgileri burada görünecek.")}</div>
        </div>
        <div class="footer">
          <div id="formErr" class="err"></div>
          <button type="submit" class="btn" id="submitBtn">${toEnt("Sözleşmeyi kabul ediyorum")}</button>
        </div>
      </div>
    </form>
  </div>
  <script>
    var chips = document.querySelectorAll(".chip");
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
    body{font-family:system-ui,sans-serif;background:#0b1220;color:#fff;margin:0;padding:2rem;text-align:center;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;}
    .spinner{width:40px;height:40px;border:3px solid rgba(255,255,255,.2);border-top-color:#b8860b;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 1rem;}
    @keyframes spin{to{transform:rotate(360deg);}}
    .err{color:#fc8181;margin-top:1rem;}
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
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const body = await req.text();
      body.split("&").forEach((pair) => {
        const [k, v] = pair.split("=").map((s) => decodeURIComponent(s.replace(/\+/g, " ")));
        if (k) formData[k] = v ?? "";
      });
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

