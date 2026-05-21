# KBS (kimlik bildirimi) — uçtan uca test ve canlı öncesi kontrol

Mobil **KBS’ye doğrudan gitmez**; sıra: **Uygulama → Supabase Edge → Railway (kbs-ops → kbs-core) → Jandarma SOAP** (veya mock).

**Kurulum:** `deploy/RAILWAY_KURULUM.md` (Hetzner kullanılmıyor).

## 0) Önkoşul kontrol listesi

| Adım | Kontrol |
|------|--------|
| Railway | `https://<kbs-ops>/health` JSON; `https://<kbs-core>/gateway/health` JSON |
| Supabase Edge | `KBS_GATEWAY_URL=https://<kbs-ops>.up.railway.app`, `KBS_GATEWAY_TOKEN` = Railway kbs-ops ile aynı; `deploy ops-proxy`, `kbs-admin-credentials`, `kbs-staff-ops` |
| Sırlar | `GATEWAY_SHARED_SECRET` ve `KBS_CREDENTIAL_SECRET` **her iki** Railway serviste aynı; core’da `OFFICIAL_PROVIDER_MODE` aşağıya göre |

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

- **Tesis kodu (TssKod)** (`facilityCode`): Jandarma’nın otele özel verdiği sayısal kod (ör. `255579`).
- **Otel KBS şifresi** (`password`, write-only): Web servis şifresi (ör. KBS’nin ürettiği otel şifresi). Kayıttan sonra ekranda gösterilmez.
- **KBS kullanıcı TC** (`kullaniciTc` / DB `username`): SOAP’taki **KullaniciTC** — 11 haneli sayısal TC (KBS’ye giriş yapan yetkili).

İlk kurulum CLI (VPS’te `KBS_CREDENTIAL_SECRET` ile aynı secret):

```bash
KBS_SEED_FACILITY_CODE=255579 KBS_SEED_PASSWORD='...' KBS_SEED_KULLANICI_TC=12345678901 node scripts/seed-kbs-credentials.js
```

**Kaydet** (Supabase Edge `kbs-admin-credentials` — VPS :4000 gerekmez), ardından **Bağlantı testi** (VPS ayakta olmalı). Kayıt hatası `Connection timed out` → VPS firewall / pm2; şifre kaydı için `KBS_CREDENTIAL_SECRET` Edge secret + `deploy kbs-admin-credentials` yeterli.

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
