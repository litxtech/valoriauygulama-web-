import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HTML_HEADERS = {
  ...CORS,
  "Content-Type": "text/html; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json; charset=utf-8" };
const DEFAULT_MALIYE_TOKEN = "valoria-maliye-qr";

async function notifyAdminsForMaliyePinSuccess(
  supabaseUrl: string,
  serviceKey: string,
  payload: {
    token: string;
    organizationId: string;
    ipAddress: string | null;
  }
) {
  try {
    const timeout = AbortSignal.timeout(5000);
    await fetch(`${supabaseUrl}/functions/v1/notify-admins`, {
      method: "POST",
      signal: timeout,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
        apikey: serviceKey,
      },
      body: JSON.stringify({
        title: "Maliye QR girisi",
        body: "Maliye portali PIN ile acildi.",
        data: {
          screen: "admin/maliye/logs",
          type: "maliye_pin_success",
          maliyeToken: payload.token,
          organizationId: payload.organizationId,
          ipAddress: payload.ipAddress,
          timestamp: new Date().toISOString(),
        },
      }),
    });
  } catch (_) {
    // Bildirim hatasi portali bozmasin.
  }
}

type AccessTokenRow = {
  id: string;
  organization_id: string;
  pin_salt: string;
  pin_hash: string;
  expires_at: string;
  is_active: boolean;
};

async function hashPin(
  supabase: ReturnType<typeof createClient>,
  pin: string,
  salt: string
): Promise<string> {
  const { data, error } = await supabase.rpc("maliye_hash_pin", {
    pin_input: pin,
    salt_input: salt,
  });
  if (error || typeof data !== "string" || !data.trim()) {
    throw new Error("PIN hash hesaplanamadi");
  }
  return data;
}

async function validateAccess(
  supabase: ReturnType<typeof createClient>,
  token: string,
  pin: string
): Promise<{ ok: true; row: AccessTokenRow } | { ok: false; reason: string; row?: AccessTokenRow }> {
  if (!token) return { ok: false, reason: "token gerekli" };
  if (!pin) return { ok: false, reason: "PIN gerekli" };

  const { data: row } = await supabase
    .from("maliye_access_tokens")
    .select("id, organization_id, pin_salt, pin_hash, expires_at, is_active")
    .eq("token", token)
    .eq("is_active", true)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!row) return { ok: false, reason: "Token geçersiz veya süresi dolmuş." };
  const tokenRow = row as AccessTokenRow;
  const incomingHash = await hashPin(supabase, pin, tokenRow.pin_salt);
  if (incomingHash !== tokenRow.pin_hash) return { ok: false, reason: "PIN hatalı.", row: tokenRow };
  return { ok: true, row: tokenRow };
}

function renderPage(token: string) {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Valoria Maliye Evrak Merkezi</title>
  <style>
    :root{
      --bg:#0b1220;--bg2:#101c34;--card:#ffffff;--text:#111827;--muted:#64748b;
      --line:#e2e8f0;--primary:#1d4ed8;--secondary:#0f766e;--soft:#f8fafc;
    }
    *{box-sizing:border-box}
    body{
      margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;
      background:
        radial-gradient(1200px 500px at 15% -10%, rgba(59,130,246,.30), transparent 60%),
        radial-gradient(900px 500px at 90% 0%, rgba(16,185,129,.22), transparent 55%),
        linear-gradient(180deg,var(--bg),var(--bg2));
    }
    .wrap{max-width:1180px;margin:0 auto;padding:18px 16px 26px}
    .hero{
      background:linear-gradient(135deg,rgba(255,255,255,.12),rgba(255,255,255,.04));
      border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:16px 18px;margin-bottom:12px;
      backdrop-filter: blur(6px);
    }
    .heroTop{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}
    .title{font-size:24px;font-weight:900;letter-spacing:.2px}
    .subtitle{margin-top:6px;color:rgba(255,255,255,.86);font-size:13px}
    .badge{padding:8px 10px;border-radius:999px;background:rgba(255,255,255,.12);font-size:12px;font-weight:700}
    .grid{display:grid;grid-template-columns:2fr 1fr;gap:12px}
    .card{background:var(--card);color:var(--text);border-radius:14px;padding:14px;border:1px solid var(--line)}
    .panelTitle{font-size:14px;font-weight:900;color:#0f172a;margin:0 0 10px}
    .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    input,button{padding:10px;border-radius:10px;border:1px solid #cbd5e1}
    input{background:#fff}
    button{cursor:pointer;background:var(--primary);color:#fff;border:none;font-weight:800}
    button.secondary{background:var(--secondary)}
    .status{padding:8px 10px;border-radius:999px;font-size:12px;background:#e2e8f0;color:#1f2937;font-weight:700}
    .muted{color:var(--muted);font-size:12px}
    .stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}
    .stat{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:10px}
    .stat b{display:block;font-size:18px;color:#0f172a}
    .stat span{font-size:12px;color:#64748b}
    .accordion{border:1px solid var(--line);border-radius:12px;margin-bottom:10px;overflow:hidden;background:#fff}
    .accHead{padding:12px;background:var(--soft);font-weight:900;display:flex;justify-content:space-between;cursor:pointer}
    .accBody{padding:10px;display:none}
    .doc{
      padding:12px;border:1px solid var(--line);border-radius:10px;margin-bottom:8px;
      display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;
    }
    .docTitle{font-weight:800;margin-bottom:3px}
    .docActions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
    .docActions button{padding:8px 10px;font-size:12px}
    #forms{display:none}
    .empty{padding:18px;text-align:center;color:var(--muted)}
    .pinRow{display:flex;flex-direction:column;gap:10px;margin-bottom:10px}
    @media (min-width:520px){
      .pinRow{flex-direction:row;flex-wrap:wrap;align-items:flex-end}
    }
    .pinField{flex:1;min-width:0}
    #pin{width:100%;font-size:16px;box-sizing:border-box;padding:12px 14px;border-radius:10px}
    .pinActions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
    .pinActions button{min-width:min(100%,140px);padding:12px 14px;border-radius:10px}
    #msg{display:none;margin-top:10px;padding:10px 12px;border-radius:10px;font-size:13px;font-weight:600}
    #msg.show{display:block}
    #msg.wait{background:#dbeafe;color:#1e3a8a;border:1px solid #93c5fd}
    #msg.ok{background:#dcfce7;color:#166534;border:1px solid #86efac}
    #msg.err{background:#fee2e2;color:#991b1b;border:1px solid #fca5a5}
    .status.open{background:#dcfce7;color:#166534;border-color:#86efac}
    @media (max-width: 900px){
      .grid{grid-template-columns:1fr}
      .doc{grid-template-columns:1fr}
      .docActions{justify-content:flex-start}
      .stats{grid-template-columns:1fr 1fr}
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <div class="heroTop">
        <div>
          <div class="title">Maliye Evrak Merkezi</div>
          <div class="subtitle">Sayin denetim gorevlisi, gerekli belgeler bu portalda cekmeceli yapida sunulmaktadir.</div>
        </div>
        <div class="badge">Valoria Hotel | Resmi Dokuman Portali</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3 class="panelTitle">Erisim ve Evraklar</h3>
        <div class="pinRow">
          <div class="pinField">
            <label for="pin" class="muted" style="display:block;margin-bottom:6px;font-weight:600">PIN</label>
            <input id="pin" type="password" inputmode="numeric" placeholder="PIN kodunu girin" autocomplete="one-time-code" enterkeyhint="go" />
          </div>
          <div class="pinActions">
            <button type="button" id="btnUnlock">Portali Ac</button>
            <span id="authState" class="status">Kilitli</span>
            <button type="button" id="btnRefresh" class="secondary">Listeyi Yenile</button>
          </div>
        </div>
        <div id="msg" role="status" aria-live="polite"></div>
        <div class="muted">Portal acikken her 30 saniyede sunucu sorgulanir; yeni evrak veya musteri formu algilaninca liste yenilenir.</div>
        <div class="stats">
          <div class="stat"><b id="statSections">0</b><span>Cekmece</span></div>
          <div class="stat"><b id="statDocs">0</b><span>Toplam Evrak</span></div>
          <div class="stat"><b id="statRefresh">Kapali</b><span>Canli Yenileme</span></div>
        </div>
      </div>
      <div class="card">
        <h3 class="panelTitle">Gunluk Musteri Formlari</h3>
        <div class="row">
          <input id="dayFilter" type="date" />
          <input id="monthFilter" type="month" />
          <button type="button" id="btnLoadForms" class="secondary">Gunluk Formlari Cek</button>
          <button type="button" id="btnLoadLatest" class="secondary">Son Form</button>
        </div>
        <div class="muted" style="margin-top:8px">Gun veya ay bazinda form listesi alinabilir. Son form hizli kontrol icindir.</div>
      </div>
    </div>

    <div id="docs" class="card" style="margin-top:12px"><div class="empty">Portal kilitli. PIN ile aciniz.</div></div>
    <div id="forms" class="card"></div>
  </div>

  <script>
    const token = ${JSON.stringify(token)};
    const anon = ${JSON.stringify(anonKey)};
    let pin = "";
    let autoRefreshTimer = null;
    let lastVersion = null;

    function qs(params){
      const u = new URLSearchParams(params);
      return "?" + u.toString();
    }

    function escAttr(v){
      return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    }

    function jsonFetch(url){
      var headers = { Accept: "application/json" };
      if (anon && String(anon).trim()) {
        headers.Authorization = "Bearer " + anon;
        headers.apikey = anon;
      }
      return fetch(url, { headers: headers });
    }

    async function api(params){
      const q = qs({ token, pin, ...params });
      const r = await jsonFetch(q);
      let j = null;
      try {
        j = await r.json();
      } catch (_) {
        throw new Error("Sunucudan gecersiz yanit alindi");
      }
      if (!r.ok) throw new Error((j && j.error) || ("HTTP " + r.status));
      return j;
    }

    function setMsg(kind, text){
      const el = document.getElementById("msg");
      if (!el) return;
      el.className = "show " + (kind || "");
      el.textContent = text || "";
    }
    function clearMsg(){
      const el = document.getElementById("msg");
      if (!el) return;
      el.className = "";
      el.textContent = "";
    }

    function toggleBody(id){
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = el.style.display === "block" ? "none" : "block";
    }

    function renderDocs(data){
      const root = document.getElementById("docs");
      root.innerHTML = "";
      let totalDocs = 0;
      (data.sections || []).forEach((s, idx) => {
        const accId = "acc_" + idx;
        totalDocs += (s.documents || []).length;
        const docsHtml = (s.documents || []).map((d) => {
          const signed = d.signedUrl || "";
          return '<div class="doc">' +
            '<div><div class="docTitle">' + d.title + '</div>' +
            '<div class="muted">' + (d.description || "-") + '</div></div>' +
            '<div class="docActions">' +
              '<button type="button" data-doc-action="view" data-url="' + escAttr(signed) + '">Goruntule</button>' +
              '<button type="button" class="secondary" data-doc-action="download" data-url="' + escAttr(signed) + '">Indir</button>' +
              '<button type="button" class="secondary" data-doc-action="print" data-url="' + escAttr(signed) + '">Yazdir</button>' +
              '<button type="button" class="secondary" data-doc-action="printSend" data-doc-id="' + escAttr(d.id) + '">Yaziciya Gonder</button>' +
            '</div>' +
          '</div>';
        }).join("");
        const html = '<div class="accordion">' +
          '<div class="accHead" role="button" tabindex="0" data-acc-id="' + escAttr(accId) + '"><span>' + s.name + '</span><span>' + (s.documents || []).length + ' evrak</span></div>' +
          '<div class="accBody" id="' + accId + '">' + docsHtml + '</div></div>';
        root.insertAdjacentHTML("beforeend", html);
      });
      if (!(data.sections || []).length) root.innerHTML = '<div class="empty">Gosterilecek evrak bulunamadi.</div>';
      document.getElementById("statSections").textContent = String((data.sections || []).length);
      document.getElementById("statDocs").textContent = String(totalDocs);
    }

    function downloadDoc(url){
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }

    function printDoc(url){
      const w = window.open(url, "_blank", "noopener");
      if (!w) return;
      setTimeout(() => { try { w.print(); } catch(_) {} }, 1200);
    }

    async function sendPrinter(documentId){
      try{
        await api({ format: "json", view: "print", documentId });
        alert("Yazici kuyruguna gonderildi.");
      }catch(e){ alert(e.message || "Gonderilemedi"); }
    }

    async function unlock(){
      pin = (document.getElementById("pin").value || "").trim();
      if (!pin) {
        setMsg("err", "PIN gerekli.");
        return;
      }
      const unlockBtn = document.getElementById("btnUnlock");
      const authEl = document.getElementById("authState");
      if (unlockBtn) unlockBtn.disabled = true;
      setMsg("wait", "PIN dogrulaniyor...");
      try{
        await refreshDocuments({ notify: true });
        authEl.textContent = "Acik";
        authEl.classList.add("open");
        if (autoRefreshTimer) clearInterval(autoRefreshTimer);
        autoRefreshTimer = setInterval(() => {
          refreshIfChanged().catch(() => null);
        }, 30000);
        document.getElementById("statRefresh").textContent = "Acik";
        setMsg("ok", "Giris basarili. Evraklar yuklendi.");
      }catch(e){
        authEl.textContent = "Hatali PIN";
        authEl.classList.remove("open");
        setMsg("err", e.message || "Erisim reddedildi");
      } finally {
        if (unlockBtn) unlockBtn.disabled = false;
      }
    }

    async function syncLastVersion(){
      try{
        const v = await api({ format: "json", view: "documents", mode: "version" });
        lastVersion = v && v.version ? v.version : null;
      }catch(_){
        lastVersion = null;
      }
    }

    async function refreshDocuments(opts){
      const docs = await api({
        format: "json",
        view: "documents",
        ...(opts && opts.notify ? { notify: "1" } : {}),
      });
      renderDocs(docs);
      await syncLastVersion();
    }

    async function refreshIfChanged(){
      if (!pin) return;
      try{
        const v = await api({ format: "json", view: "documents", mode: "version" });
        const cur = v && v.version ? v.version : null;
        if (!cur) return;
        if (lastVersion === null) {
          lastVersion = cur;
          return;
        }
        if (cur === lastVersion) return;
        await refreshDocuments();
        const box = document.getElementById("forms");
        if (box && box.style.display === "block") {
          try{ await loadForms(); }catch(_){}
        }
      }catch(_){}
    }

    async function loadForms(){
      if (!pin) return alert("Once PIN ile portali acin.");
      const day = document.getElementById("dayFilter").value;
      const month = document.getElementById("monthFilter").value;
      const res = await api({ format: "json", view: "daily-forms", date: day || "", month: month || "" });
      const box = document.getElementById("forms");
      box.style.display = "block";
      box.innerHTML = "<h3 style='margin:0 0 8px'>Gunluk Musteri Formlari</h3>" + (res.items || []).map((f) =>
        '<div class="doc"><div class="docTitle">' + (f.full_name || "Isimsiz") + '</div><div class="muted">' +
        (f.created_at || "-") + ' / Oda: ' + (f.room_number || f.room_id || "-") +
        (f.contract_lang ? ' / Dil: ' + f.contract_lang : '') +
        '</div></div>'
      ).join("");
    }

    async function loadLatest(){
      if (!pin) return alert("Once PIN ile portali acin.");
      const res = await api({ format: "json", view: "latest-form" });
      const f = res.item;
      const box = document.getElementById("forms");
      box.style.display = "block";
      box.innerHTML = "<h3 style='margin:0 0 8px'>Son Musteri Formu</h3>" + (f ? '<div class="doc"><div class="docTitle">' +
        (f.full_name || "Isimsiz") + '</div><div class="muted">' + (f.created_at || "-") + "</div></div>" : "<p>Kayit yok.</p>");
    }

    function bindDocsDelegation(){
      const root = document.getElementById("docs");
      if (!root || root.dataset.bound === "1") return;
      root.dataset.bound = "1";
      root.addEventListener("click", function(ev){
        const head = ev.target && ev.target.closest ? ev.target.closest(".accHead[data-acc-id]") : null;
        if (head) {
          const id = head.getAttribute("data-acc-id");
          if (id) toggleBody(id);
          return;
        }
        const btn = ev.target && ev.target.closest ? ev.target.closest("button[data-doc-action]") : null;
        if (!btn) return;
        const act = btn.getAttribute("data-doc-action");
        const url = btn.getAttribute("data-url") || "";
        const docId = btn.getAttribute("data-doc-id") || "";
        if (act === "view" && url) window.open(url, "_blank", "noopener");
        else if (act === "download" && url) downloadDoc(url);
        else if (act === "print" && url) printDoc(url);
        else if (act === "printSend" && docId) void sendPrinter(docId);
      });
    }

    function initUi(){
      bindDocsDelegation();
      const pinEl = document.getElementById("pin");
      const unlockBtn = document.getElementById("btnUnlock");
      const refreshBtn = document.getElementById("btnRefresh");
      const formsBtn = document.getElementById("btnLoadForms");
      const latestBtn = document.getElementById("btnLoadLatest");
      if (pinEl) {
        pinEl.addEventListener("keydown", function(ev){
          if (ev.key === "Enter") {
            ev.preventDefault();
            void unlock();
          }
        });
      }
      if (unlockBtn) unlockBtn.addEventListener("click", function(){ void unlock(); });
      if (refreshBtn) refreshBtn.addEventListener("click", function(){
        void refreshDocuments().catch(function(e){
          setMsg("err", (e && e.message) || "Yenilenemedi");
        });
      });
      if (formsBtn) formsBtn.addEventListener("click", function(){ void loadForms().catch(function(e){ alert((e && e.message) || "Formlar alinamadi"); }); });
      if (latestBtn) latestBtn.addEventListener("click", function(){ void loadLatest().catch(function(e){ alert((e && e.message) || "Form alinamadi"); }); });
    }
    initUi();
  </script>
</body>
</html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);
  const url = new URL(req.url);
  const token = (url.searchParams.get("token") ?? url.searchParams.get("t") ?? DEFAULT_MALIYE_TOKEN).trim();
  const pin = (url.searchParams.get("pin") ?? "").trim();

  if (req.method === "GET" && url.searchParams.get("format") !== "json") {
    // Dogrudan tam portal HTML'i dondur (eski iki-asamali loader kaldirildi: ikinci fetch
    // icin istemcide anon/apikey gerekirdi; bos kalinca "Yuklenemedi" olusuyordu).
    return new Response(renderPage(token), { status: 200, headers: HTML_HEADERS });
  }

  const auth = await validateAccess(supabase, token, pin);
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? null;
  const ua = req.headers.get("user-agent") ?? null;

  if (!auth.ok) {
    if (auth.row?.organization_id) {
      await supabase.from("maliye_audit_logs").insert({
        organization_id: auth.row.organization_id,
        token_id: auth.row.id,
        event_type: "pin.failed",
        success: false,
        ip_address: ip,
        user_agent: ua,
      });
    }
    return new Response(JSON.stringify({ error: auth.reason }), { status: 403, headers: JSON_HEADERS });
  }

  await supabase
    .from("maliye_access_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", auth.row.id);
  await supabase.from("maliye_audit_logs").insert({
    organization_id: auth.row.organization_id,
    token_id: auth.row.id,
    event_type: "pin.success",
    success: true,
    ip_address: ip,
    user_agent: ua,
  });

  const orgId = auth.row.organization_id;
  const view = (url.searchParams.get("view") ?? "documents").trim();
  const notify = (url.searchParams.get("notify") ?? "").trim() === "1";

  if (view === "documents") {
    if ((url.searchParams.get("mode") ?? "").trim() === "version") {
      const { data: latestDocument } = await supabase
        .from("documents")
        .select("updated_at")
        .eq("organization_id", orgId)
        .eq("is_maliye_visible", true)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: latestAcceptance } = await supabase
        .from("contract_acceptances")
        .select("accepted_at")
        .eq("organization_id", orgId)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const docsUpdatedAt = latestDocument?.updated_at ?? null;
      const formsUpdatedAt = latestAcceptance?.accepted_at ?? null;
      const version = `${docsUpdatedAt ?? "none"}|${formsUpdatedAt ?? "none"}`;
      return new Response(JSON.stringify({ version, docsUpdatedAt, formsUpdatedAt }), {
        status: 200,
        headers: JSON_HEADERS,
      });
    }

    const { data: sections } = await supabase
      .from("maliye_document_sections")
      .select("id, name, display_order")
      .eq("organization_id", orgId)
      .eq("is_active", true)
      .order("display_order", { ascending: true });

    const { data: docs } = await supabase
      .from("documents")
      .select("id, title, description, maliye_section_id, current_version_id, maliye_display_order")
      .eq("organization_id", orgId)
      .eq("is_maliye_visible", true)
      .is("archived_at", null)
      .order("maliye_display_order", { ascending: true })
      .order("updated_at", { ascending: false });

    const versionIds = (docs ?? []).map((d) => d.current_version_id).filter(Boolean);
    let versionMap: Record<string, string> = {};
    if (versionIds.length) {
      const { data: versions } = await supabase
        .from("document_versions")
        .select("id, file_path")
        .in("id", versionIds as string[]);
      const paths = (versions ?? []).map((v) => v.file_path).filter(Boolean);
      if (paths.length) {
        const signed = await supabase.storage.from("documents").createSignedUrls(paths, 300);
        const pathToSigned = new Map<string, string>();
        (signed.data ?? []).forEach((s) => {
          if (s.path && s.signedUrl) pathToSigned.set(s.path, s.signedUrl);
        });
        versionMap = (versions ?? []).reduce((acc, v) => {
          acc[v.id] = pathToSigned.get(v.file_path) ?? "";
          return acc;
        }, {} as Record<string, string>);
      }
    }

    const sectionMap = new Map<string, { id: string; name: string; documents: any[] }>();
    (sections ?? []).forEach((s) => sectionMap.set(s.id, { id: s.id, name: s.name, documents: [] }));
    (docs ?? []).forEach((d) => {
      const sid = d.maliye_section_id ?? "other";
      if (!sectionMap.has(sid)) sectionMap.set(sid, { id: sid, name: "Diger Evraklar", documents: [] });
      sectionMap.get(sid)!.documents.push({
        id: d.id,
        title: d.title,
        description: d.description,
        signedUrl: d.current_version_id ? versionMap[d.current_version_id] ?? "" : "",
      });
    });

    await supabase.from("maliye_audit_logs").insert({
      organization_id: orgId,
      token_id: auth.row.id,
      event_type: "documents.view",
      success: true,
      ip_address: ip,
      user_agent: ua,
    });
    if (notify) {
      await notifyAdminsForMaliyePinSuccess(supabaseUrl, serviceKey, {
        token,
        organizationId: orgId,
        ipAddress: ip,
      });
    }
    return new Response(JSON.stringify({ sections: Array.from(sectionMap.values()) }), { status: 200, headers: JSON_HEADERS });
  }

  if (view === "daily-forms" || view === "latest-form") {
    const date = (url.searchParams.get("date") ?? "").trim();
    const month = (url.searchParams.get("month") ?? "").trim();

    let q = supabase
      .from("contract_acceptances")
      .select(
        "id, accepted_at, contract_lang, token, guest_id, guests(id, full_name, room_id, phone, id_number, rooms(room_number))"
      )
      .eq("organization_id", orgId)
      .order("accepted_at", { ascending: false });

    if (date) {
      q = q
        .gte("accepted_at", `${date}T00:00:00.000Z`)
        .lte("accepted_at", `${date}T23:59:59.999Z`);
    } else if (month) {
      const from = `${month}-01T00:00:00.000Z`;
      const toDate = new Date(`${month}-01T00:00:00.000Z`);
      toDate.setUTCMonth(toDate.getUTCMonth() + 1);
      q = q.gte("accepted_at", from).lt("accepted_at", toDate.toISOString());
    }

    if (view === "latest-form") q = q.limit(1);
    else q = q.limit(500);

    const { data: rawRows } = await q;
    const data = (rawRows ?? []).map((row: Record<string, unknown>) => {
      const g = row.guests as Record<string, unknown> | null;
      const rooms = g?.rooms as { room_number?: string } | null;
      return {
        id: row.id,
        full_name: (g?.full_name as string) ?? null,
        room_id: (g?.room_id as string) ?? null,
        room_number: rooms?.room_number ?? null,
        phone: (g?.phone as string) ?? null,
        id_number: (g?.id_number as string) ?? null,
        created_at: row.accepted_at,
        contract_lang: row.contract_lang,
        token: row.token,
      };
    });
    await supabase.from("maliye_audit_logs").insert({
      organization_id: orgId,
      token_id: auth.row.id,
      event_type: view === "latest-form" ? "forms.latest" : "forms.list",
      success: true,
      ip_address: ip,
      user_agent: ua,
      metadata: { date, month },
    });

    if (view === "latest-form") return new Response(JSON.stringify({ item: data?.[0] ?? null }), { status: 200, headers: JSON_HEADERS });
    return new Response(JSON.stringify({ items: data ?? [] }), { status: 200, headers: JSON_HEADERS });
  }

  if (view === "print") {
    const documentId = (url.searchParams.get("documentId") ?? "").trim();
    const printEndpoint = Deno.env.get("PRINTER_WEBHOOK_URL") ?? "";
    if (printEndpoint && documentId) {
      await fetch(printEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId, organizationId: orgId, tokenId: auth.row.id }),
      }).catch(() => null);
    }
    await supabase.from("maliye_audit_logs").insert({
      organization_id: orgId,
      token_id: auth.row.id,
      event_type: "document.print_send",
      success: !!documentId,
      ip_address: ip,
      user_agent: ua,
      metadata: { documentId },
    });
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: JSON_HEADERS });
  }

  return new Response(JSON.stringify({ error: "Geçersiz view parametresi" }), { status: 400, headers: JSON_HEADERS });
});
