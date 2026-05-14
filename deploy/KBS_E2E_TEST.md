# KBS (kimlik bildirimi) — uçtan uca test ve canlı öncesi kontrol

Mobil **KBS’ye doğrudan gitmez**; sıra: **Uygulama → Supabase Edge `ops-proxy` → Hetzner `:4000` (ops) → `:4001` (iç gateway) → Jandarma SOAP** (veya mock).

## 0) Önkoşul kontrol listesi

| Adım | Kontrol |
|------|--------|
| VPS | `curl http://SUNUCU_IP:4000/health` ve `curl http://127.0.0.1:4001/gateway/health` (SSH içinden) |
| PM2 | `pm2 status` → `valoria-kbs-ops` + `valoria-kbs-core` online |
| Supabase Edge | Secret `KBS_GATEWAY_URL=http://SUNUCU_IP:4000`, `KBS_GATEWAY_TOKEN` = VPS `railway-service/.env` ile aynı; `supabase functions deploy ops-proxy` |
| Sırlar | `GATEWAY_SHARED_SECRET` ve `KBS_CREDENTIAL_SECRET` **her iki** `.env`’de (ops + core) aynı; core’da `OFFICIAL_PROVIDER_MODE` aşağıya göre |

## 1) Uygulama: personel KBS sekmesi (isteğe bağlı bayrak)

**Admin → KBS Ayarları** ve **KBS Yetkileri** menüleri, `EXPO_PUBLIC_KBS_UI_ENABLED` kapalı olsa da admin panelinde görünür (tesis şifresi / bağlantı testi için).

Personel alt menüsündeki **KBS** sekmesi (tarama, hazır, bildirim) için `.env` veya EAS:

```bash
EXPO_PUBLIC_KBS_UI_ENABLED=true
```

Sonra **yeni bir build** veya geliştirme istemcisiyle çalıştırın.

## 2) Supabase: demo otel + gateway’e bağlı admin

1. **Authentication** ile personel/admin hesabını oluşturun (e-posta/şifre). Kullanıcının **User UID**’sini kopyalayın.
2. SQL Editor’de `scripts/sql/kbs-ops-test-provision.sql` dosyasını açın, `YOUR_AUTH_USER_UUID` yerine bu UUID’yi yazıp çalıştırın.

Bu işlem:

- `ops.bootstrap_demo_hotel(...)` ile `valoria-ops` kodlu otel ve örnek odaları oluşturur / günceller.
- `ops.app_users` satırı ekler: **JWT’deki kullanıcı = bu satır** olmadan gateway `FORBIDDEN` döner (KBS ayarları yalnızca `admin` / `manager`).

**Personel (`staff`) kaydı** zaten var olmalı (aynı `auth_id` ile giriş). Yoksa mevcut README akışıyla `staff` oluşturun.

## 3) İki test modu

### A) Mock (Jandarma yok, sadece entegrasyon)

`kbs-gateway-service/.env`:

```env
OFFICIAL_PROVIDER_MODE=mock
```

`OFFICIAL_PROVIDER_BASE_URL` mock’ta kullanılmaz. `pm2 restart valoria-kbs-core`

- Admin **Bağlantı testi**: her zaman başarılı mesaj (gerçek KBS doğrulaması yok).
- Personel **Hazır → Bildir**: mock `externalReference` üretir; üretim doğrulaması değildir.

### B) HTTP / gerçek KBS (canlıya en yakın)

```env
OFFICIAL_PROVIDER_MODE=http
OFFICIAL_PROVIDER_BASE_URL=https://vatandas.jandarma.gov.tr/KBS_Tesis_Servis/SrvShsYtkTml.svc
```

Jandarma’nın verdiği **tesis kodu (TssKod)** ve **şifre** + kullanıcı **KullaniciTC** sayısal olmalı (kod `ParametreListele` ile test eder).

`pm2 restart valoria-kbs-core`

## 4) Admin: KBS kimlik bilgilerini kaydet

**Admin panel** → **KBS Ayarları** (`/admin/kbs-settings`):

- **Tesis kodu** (`facilityCode`): Jandarma’daki kod (HTTP modunda **sayı** olmalı).
- **Kullanıcı adı** (`username`): KBS’deki **KullaniciTC** (sayısal TC).
- **Şifre**: KBS sisteminin verdiği şifre (ilk kayıtta zorunlu).

**Kaydet**, ardından **Bağlantı testi**. Hata mesajında Edge token, VPS veya SOAP yanıtı ipuçları `i18n` / ekranda birleşir.

## 5) Admin: KBS odaları (`ops.rooms`)

Kimlik bildirimi öncesi personel tarafında oda listesi **gateway’den** gelir. Odalar yoksa:

- KBS Ayarları ekranından **ops oda ekle** (API `POST /admin/ops-rooms`) veya SQL ile `ops.rooms` ekleyin (`bootstrap` zaten 101–105 örneği üretir).

## 6) Personel: kimlik bildirimi akışı (özet)

1. **KBS** sekmesi açık (`EXPO_PUBLIC_KBS_UI_ENABLED=true`, rol uygun).
2. **MRZ tarama** veya seri iş → kayıtlar **Hazır** kuyruğuna düşer.
3. **Hazır** ekranında misafire **oda ata** (ops odalarından).
4. **Bildir** (check-in): gateway `submitCheckIn` → Jandarma veya mock.
5. **Gönderildi / Hatalı** ekranlarından durum ve yeniden deneme.

Canlıda sorun çıkarsa sırasıyla: **VPS log** `pm2 logs`, **Supabase** `ops-proxy` logları, **KBS_GATEWAY_URL/token** eşleşmesi, **SOAP** yanıtı (HTTP modu).

## 7) İlgili dosyalar

- SQL provizyon: `scripts/sql/kbs-ops-test-provision.sql`
- VPS kurulum: `deploy/HETZNER.md`, `deploy/GATEWAY_PM2.md`
- Gateway test: `railway-service` → `POST /admin/kbs-settings/test-connection` → core `POST /gateway/test-connection`
