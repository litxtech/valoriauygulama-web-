# KBS — Railway kurulumu (tek rehber)

Hetzner / pm2 gerekmez. Aynı Railway projesinde **2 servis** + Supabase secret’ları.

Dış adres (mobil & Supabase): **`https://valoriahotel-production.up.railway.app`** (ops servisinin public URL’si).

---

## 1) Railway projesi — iki servis

[Railway Dashboard](https://railway.app) → proje → **+ New Service** → **GitHub Repo** (bu repo).

| Servis adı (örnek) | Root Directory | Public domain |
|--------------------|----------------|---------------|
| **kbs-ops** | `railway-service` | `valoriahotel-production.up.railway.app` (veya yeni domain) |
| **kbs-core** | `kbs-gateway-service` | Railway’in verdiği URL (ör. `kbs-core-xxx.up.railway.app`) |

Her serviste **Settings → Networking → Generate Domain** açık olsun (ops için zaten var).

**Önemli:** Eski deploy monorepo kökünden Expo/web ise `/health` 404 verir. Root Directory mutlaka yukarıdaki klasörler olmalı.

---

## 2) Ortak değişkenler (kopyala-yapıştır)

Aşağıdakiler **her iki serviste de aynı**:

| Değişken | Değer |
|----------|--------|
| `SUPABASE_URL` | `https://sbydlcujsiqmifybqzsi.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role |
| `GATEWAY_SHARED_SECRET` | `openssl rand -hex 24` ile üretin, iki serviste aynı |
| `KBS_CREDENTIAL_SECRET` | Supabase Edge secret ile **aynı** (min 16 karakter) |
| `LOG_LEVEL` | `info` |
| `NODE_ENV` | `production` |

`PORT` — Railway otomatik verir; elle yazmayın.

---

## 3) Sadece **kbs-core** (`kbs-gateway-service`)

| Değişken | Değer |
|----------|--------|
| `OFFICIAL_PROVIDER_MODE` | `http` |
| `OFFICIAL_PROVIDER_BASE_URL` | `https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc` |

Test için mock: `OFFICIAL_PROVIDER_MODE=mock` (Jandarma’ya gitmez).

---

## 4) Sadece **kbs-ops** (`railway-service`)

| Değişken | Değer |
|----------|--------|
| `GATEWAY_BASE_URL` | **kbs-core** public URL, örnek: `https://kbs-core-XXXX.up.railway.app` (sonunda `/` yok) |
| `KBS_GATEWAY_TOKEN` | `openssl rand -hex 24` — Supabase secret ile **aynı** olacak |
| `APP_ENV` | `prod` |

Railway değişken referansı (servis adı `kbs-core` ise):

```text
GATEWAY_BASE_URL=https://${{kbs-core.RAILWAY_PUBLIC_DOMAIN}}
```

(Panelde “Reference” ile seçebilirsiniz.)

---

## 5) Sağlık kontrolü

Tarayıcıda:

```text
https://valoriahotel-production.up.railway.app/health
```

Beklenen:

```json
{"ok":true,"service":"valoria-kbs-gateway",...}
```

Core için:

```text
https://<kbs-core-domain>/gateway/health
```

→ `{"ok":true,"service":"kbs-gateway-service",...}`

---

## 6) Supabase (tek sefer, proje kökünden)

```bash
supabase secrets set KBS_GATEWAY_URL=https://valoriahotel-production.up.railway.app
supabase secrets set KBS_GATEWAY_TOKEN=<kbs-ops KBS_GATEWAY_TOKEN ile aynı>
supabase functions deploy ops-proxy
supabase functions deploy kbs-admin-credentials
supabase functions deploy kbs-staff-ops
```

`KBS_CREDENTIAL_SECRET` Edge’de zaten varsa dokunmayın.

---

## 7) Uygulama (.env)

```env
EXPO_PUBLIC_KBS_UI_ENABLED=true
EXPO_PUBLIC_RAILWAY_API_URL=https://valoriahotel-production.up.railway.app
```

Metro: `npx expo start --dev-client --clear`

---

## 8) Admin panel

1. **KBS Ayarları** → tesis kodu, Kullanıcı TC, şifre → **Kaydet**
2. **Bağlantı testi** → başarılı olmalı (ops → core → Jandarma/mock)
3. Personel → bildirim / check-in

Jandarma reddederse: paneldeki IP/şifre/tesis kodu — Railway tarafı ayakta ise köprü tamamdır.

---

## Sorun giderme

| Belirti | Çözüm |
|---------|--------|
| `/health` 404 | kbs-ops Root Directory `railway-service` değil |
| Bağlantı testi timeout | kbs-core ayakta mı, `GATEWAY_BASE_URL` doğru mu |
| 401 / gateway token | `KBS_GATEWAY_TOKEN` Supabase = ops servisi |
| Şifre çözülemedi | `KBS_CREDENTIAL_SECRET` Supabase Edge = iki Railway servisi |

---

## Akış (kısa)

```text
Mobil → Supabase Edge → https://valoriahotel-production.up.railway.app (ops)
                              → https://kbs-core-....railway.app (SOAP)
                              → Jandarma
```

IP konusu: Jandarma panelinde gerektiğinde güncellersiniz; kurulum Railway URL + secret ile biter.
