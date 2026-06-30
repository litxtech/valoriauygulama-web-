# GitHub + Vercel — tek doğru kurulum (valoria.tr)

Bu dosya **karışık repo / domain / Vercel projesi** durumunu toparlamak içindir.

---

## Şu anki teşhis (2026-06)

| Kaynak | Durum |
|--------|--------|
| `origin` → `github.com/mytrabzon/valoriahotel` | **Ölü** — `Repository not found` (silinmiş veya erişim yok) |
| `fork` → aynı URL | **Ölü** — kaldırılmalı |
| `litxtech/valoriauygulama-web-` | **Boş repo** — canlı push hedefi olarak uygun |
| `valoria.tr` | Vercel’de **tek** Expo web projesine bağlı olmalı |
| `valoriahotel-el4r.vercel.app` | Eski geçici URL — yeni QR’larda kullanmayın |
| `litxtech.com` | Eski sözleşme/auth dokümantasyonu — menü için değil |
| Menü içeriği + tema renkleri | **Supabase** — Vercel deploy gerekmez |
| Web menü **kodu** (UI) | **Vercel** — git push sonrası build |

**Kural:** Bir canlı site = bir GitHub repo = bir Vercel projesi = `valoria.tr`.

---

## Hedef mimari

```
Geliştirme (Cursor / local)
        │
        ▼ git push main
github.com/litxtech/valoriauygulama-web-
        │
        ▼ otomatik build (Vercel Git Integration)
Vercel proje: valoria-web (örnek ad)
        │
        ├── Production domain: valoria.tr
        ├── Preview: *.vercel.app (PR başına)
        └── Build: npm run vercel-build  →  dist/
                    │
                    ▼ runtime veri
              Supabase (menü, tema, auth)
```

---

## Adım 1 — GitHub remote’ları düzelt (bir kez)

Yerelde (PowerShell):

```powershell
cd C:\valorıahotel

# Ölü remote'u arşivle (isteğe bağlı)
git remote rename origin dead-mytrabzon 2>$null
git remote remove fork 2>$null

# Tek canonical remote
git remote add origin https://github.com/litxtech/valoriauygulama-web-.git
# veya zaten varsa:
# git remote set-url origin https://github.com/litxtech/valoriauygulama-web-.git

git remote -v
```

---

## Adım 2 — Kodu GitHub’a ilk push

`main` dalını litxtech reposuna gönderin (repo boş olduğu için ilk push):

```powershell
git checkout main
git pull dead-mytrabzon main 2>$null   # sadece eski remote hâlâ okunabiliyorsa
# veya mevcut main + feature branch'leri merge edin

git push -u origin main
```

Feature branch’ler (ör. `cursor/menu-table-qr`) için:

```powershell
git push -u origin cursor/menu-table-qr
```

GitHub’da **Pull Request → main → merge** → Vercel production deploy tetiklenir.

---

## Adım 3 — Vercel projesini tekilleştir

1. [vercel.com](https://vercel.com) → doğru team/hesap
2. **Add New → Project** → Import `litxtech/valoriauygulama-web-`
3. Ayarlar:
   - **Framework Preset:** Other
   - **Root Directory:** `.` (repo kökü)
   - **Build Command:** `npm run vercel-build` (`vercel.json` zaten bunu söylüyor)
   - **Output Directory:** `dist`
   - **Install Command:** `npm install`
4. **Production Branch:** `main`
5. Eski `mytrabzon` veya `valoriahotel-el4r` projelerine bağlı duplicate projeleri **silin** veya domain’lerini kaldırın (yalnızca bir proje `valoria.tr` tutsun).

### Zorunlu Environment Variables (Production + Preview)

| Key | Değer |
|-----|--------|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `EXPO_PUBLIC_APP_URL` | `https://valoria.tr` |

İsteğe bağlı: `EXPO_PUBLIC_PUBLIC_MENU_ORG_SLUG=valoria`

Env ekledikten veya değiştirdikten sonra: **Deployments → Redeploy** (EXPO_PUBLIC_* build sırasında gömülür).

---

## Adım 4 — Domain (valoria.tr)

Vercel proje → **Settings → Domains**:

- `valoria.tr` (primary)
- `www.valoria.tr` → `valoria.tr` redirect

DNS (domain sağlayıcı):

- `A` kaydı `@` → `76.76.21.21`  
  veya  
- `CNAME` `www` → `cname.vercel-dns.com`

---

## Adım 5 — Supabase tarafı (deploy değil, ayar)

### Uygulama ayarı (admin uygulamasından)

**QR Merkezi → Canlı site adresi:** `https://valoria.tr` → Kaydet

### Edge function secret (ödeme linkleri)

```
PAYMENT_PUBLIC_BASE_URL=https://valoria.tr
```

### Auth redirect (yalnızca web giriş kullanıyorsanız)

Site URL: `https://valoria.tr`  
Redirect URLs: `https://valoria.tr/**`

(Eski `litxtech.com` redirect’leri kaldırılabilir veya geçiş süresince tutulur.)

---

## Ne Vercel, ne Supabase?

| Değişiklik | Nereye? | Deploy? |
|------------|---------|---------|
| Yemek / fiyat / fotoğraf | Supabase | Hayır, anında |
| Web menü tema (renk, hero) — Kaydet | Supabase `organizations` | Hayır |
| Web menü UI kodu, QR sheet, bug fix | Git → Vercel | Evet, `git push` |
| Personel mobil uygulama | EAS build | App Store / Play |

Menü sayfası: `https://valoria.tr/menu/{slug}` — Realtime ile güncellenir.

---

## Eski URL’leri temizleme checklist

- [ ] QR’lar ve admin **QR Merkezi** `https://valoria.tr` kullanıyor
- [ ] `EXPO_PUBLIC_APP_URL` = `https://valoria.tr` (Vercel env)
- [ ] `app_settings` public base URL = `https://valoria.tr`
- [ ] Eski `valoriahotel-el4r.vercel.app` linkleri basılı materyalde kalmadı
- [ ] Vercel’de yalnızca **bir** proje production domain tutuyor
- [ ] GitHub’da `origin` = `litxtech/valoriauygulama-web-`

---

## Sorun giderme

### Push: `Repository not found`
→ `origin` hâlâ `mytrabzon/valoriahotel`’e bakıyor. Adım 1’i uygulayın.

### Menü açılmıyor / eski tasarım
→ Son deploy başarılı mı? Sayfa altında `Menu · 2026.06-v4` (veya güncel build etiketi) var mı?

### Menü boş ama uygulamada dolu
→ `organizations.slug` doğru mu? `public_kitchen_menu_enabled = true` mi?

### Env değişti ama site eski
→ Vercel **Redeploy** (env build-time gömülür).

---

## Hızlı komut özeti

```powershell
# Remote kontrol
git remote -v

# Production’a kod gönder
git checkout main
git merge cursor/menu-table-qr   # hazırsa
git push origin main

# Vercel CLI (giriş sonrası)
npx vercel login
npx vercel link
npx vercel --prod
```

CLI kullanmadan: GitHub push → Vercel otomatik build yeterlidir.
