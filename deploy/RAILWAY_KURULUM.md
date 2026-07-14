# KBS — Railway kurulumu (tek rehber)

Hetzner / pm2 gerekmez. Aynı Railway projesinde **2 servis** + Supabase secret’ları.

Dış adres (mobil & Supabase): **`https://kbs-ops-production.up.railway.app`** (ops servisinin public URL’si).  
Eski `valoriahotel-production.up.railway.app` artık 404 verir — kullanmayın.

---

## 1) Railway projesi — iki servis

[Railway Dashboard](https://railway.app) → proje → **+ New Service** → **GitHub Repo** (bu repo).

| Servis adı (örnek) | Root Directory | Public domain |
|--------------------|----------------|---------------|
| **kbs-ops** | `railway-service` | `kbs-ops-production.up.railway.app` |
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

`PORT` — Railway otomatik verir; **elle yazmayın**. Boş `PORT=` değişkeni varsa silin (healthcheck başarısız olur).

Secret’lar (service_role, token, shared secret) Variables’da **Runtime** olarak kalsın; build-time’a taşımayın.

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
https://kbs-ops-production.up.railway.app/health
```

Beklenen:

```json
{"ok":true,"service":"valoria-kbs-gateway",...}
```

Core için:

```text
https://kbs-core-production.up.railway.app/gateway/health
```

→ `{"ok":true,"service":"kbs-gateway-service",...}`

---

## 6) Supabase (tek sefer, proje kökünden)

```bash
supabase secrets set KBS_GATEWAY_URL=https://kbs-ops-production.up.railway.app
supabase secrets set KBS_CORE_URL=https://kbs-core-production.up.railway.app
supabase secrets set KBS_GATEWAY_TOKEN=<kbs-ops KBS_GATEWAY_TOKEN ile aynı>
supabase functions deploy ops-proxy
supabase functions deploy kbs-admin-credentials
supabase functions deploy kbs-staff-ops
```

`KBS_CREDENTIAL_SECRET` / `GATEWAY_SHARED_SECRET` Edge’de zaten varsa dokunmayın (Railway ile aynı olmalı).

---

## 7) Uygulama (.env)

```env
EXPO_PUBLIC_KBS_UI_ENABLED=true
EXPO_PUBLIC_RAILWAY_API_URL=https://kbs-ops-production.up.railway.app
```

Metro: `npx expo start --dev-client --clear`

---

## 8) Admin panel

1. **KBS Ayarları** → tesis kodu, Kullanıcı TC, şifre → **Kaydet**
2. **Bağlantı testi** → başarılı olmalı (ops → core → Jandarma/mock)
3. Personel → bildirim / check-in

Jandarma reddederse: paneldeki IP/şifre/tesis kodu — Railway tarafı ayakta ise köprü tamamdır.

### Yetkisiz IP / YetkiHatasi

**Sabit (static) IP Jandarma’da zorunlu değildir.** Biz de IP istemiyoruz.

Bağlantı testi `Yetkisiz IP` döndürüyorsa bu mesaj **Jandarma SOAP** cevabıdır: istek, panelde daha önce kaydedilmiş IP ile uyuşmuyor (eski VPS / başka hat).

Ne yapılır (opsiyonel IP alanı):

1. KBS Tesis → **Web Servis İşlemleri** → **IP** alanına bakın.
2. Eski IP varsa: **silin / boşaltın**, veya Railway çıkış IP’siyle değiştirin  
   (`https://kbs-core-production.up.railway.app/gateway/egress-ip`).
3. IP boşken hâlâ `Yetkisiz IP` geliyorsa: web-servis şifresi, KullanıcıTC, tesis kodu / yetkiyi kontrol edin.

Railway’de sabit çıkış IP (Static Outbound) yalnızca isterseniz — zorunlu değil.

---

## Sorun giderme

| Belirti | Çözüm |
|---------|--------|
| `/health` 404 | kbs-ops Root Directory `railway-service` değil |
| Healthcheck failed / service unavailable | Deploy log’da `[kbs-ops] startup failed` — zorunlu env eksik veya `GATEWAY_BASE_URL` geçersiz (https:// ile kbs-core domain) |
| Bağlantı testi timeout | kbs-core ayakta mı, `GATEWAY_BASE_URL` doğru mu |
| **Yetkisiz IP / YetkiHatasi** | Sabit IP şart değil — paneldeki eski IP’yi temizle/güncelle; değilse şifre/TC/yetki |
| 401 / gateway token | `KBS_GATEWAY_TOKEN` Supabase = ops servisi |
| Şifre çözülemedi | `KBS_CREDENTIAL_SECRET` Supabase Edge = iki Railway servisi |

---

## Akış (kısa)

```text
Mobil → Supabase Edge → https://kbs-ops-production.up.railway.app (ops / kuyruk)
         veya doğrudan   → https://kbs-core-production.up.railway.app (SOAP HMAC)
                              → Jandarma
```

IP konusu: Jandarma panelinde gerektiğinde güncellersiniz; kurulum Railway URL + secret ile biter.
