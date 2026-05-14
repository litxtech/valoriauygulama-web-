# Valoria Hotel

Otel konaklama sözleşmesi ve check-in/out yönetim sistemi. Expo 54 + TypeScript + Supabase.

## Özellikler (Faz 1)

- **Misafir akışı**: QR okuma → Dil seçimi → Sözleşme → Ad/TC-Pasaport → WhatsApp/SMS doğrulama → Dijital imza
- **Admin paneli**: Personel girişi, oda yönetimi, misafir listesi, check-in/check-out, sözleşme şablonları
- **QR kod**: Odaya özel dinamik QR, süre dolunca yenileme, logo ve oda numarası
- **Diller**: TR, EN, AR, DE, FR, RU, ES (i18next)

## Kurulum

1. Bağımlılıklar:
   ```bash
   npm install
   ```

2. `.env` dosyasını düzenleyin (`.env.example` referans):
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`
   - KBS: Supabase Edge `ops-proxy` + dış KBS API — Hetzner: `deploy/HETZNER.md`

3. Supabase migration’larını çalıştırın:
   - Yerel Supabase CLI ile: `supabase db reset` (önerilir)
   - Ya da Dashboard → SQL Editor üzerinden `supabase/migrations/*` dosyalarını sırayla çalıştırın.

4. İlk personel kullanıcısı:
   - Supabase Auth ile bir kullanıcı oluşturun (e-posta/şifre).
   - `staff` tablosuna kayıt ekleyin: `auth_id` = kullanıcının UUID’si, `role` = `admin`, `email` = giriş e-postası.

5. Uygulamayı başlatın:
   ```bash
   npx expo start
   ```

## KBS (Supabase Edge + dış KBS API)

- **Mobil asla KBS’ye doğrudan bağlanmaz.** Akış: Mobil → Supabase (auth/DB/Edge) → Edge `ops-proxy` → **dış Node gateway** (`railway-service/` klasörü — Hetzner VPS) → iç KBS HTTP süreci (`kbs-gateway-service`) → Jandarma KBS.
- Dış API kodu: `railway-service/` (Fastify). Hetzner’de PM2: `deploy/GATEWAY_PM2.md`.
- Edge secrets: `KBS_GATEWAY_URL` (dış API’nin `https://` kökü), `KBS_GATEWAY_TOKEN` (sunucudakiyle aynı). Hetzner ayrıntı: `deploy/HETZNER.md`.
- KBS uçtan uca test (mock / gerçek SOAP, admin + personel akışı): `deploy/KBS_E2E_TEST.md` ve `scripts/sql/kbs-ops-test-provision.sql`.

Supabase OPS / KBS migrations (seçme):
- `137_ops_official_checkin_system.sql`: ops şeması + RLS + permissions seed
- `138_ops_storage_passport_buckets.sql`: storage bucket/policy
- `140_ops_jobs_queue.sql`: jobs queue + `ops.claim_next_job`
- `141_ops_hardening.sql`: unique/index + RLS write kapama (authenticated)
- `142_ops_demo_bootstrap.sql`: `ops.bootstrap_demo_hotel(...)` (service_role)
- `143_kbs_logs_and_staff_access.sql`: `kbs_logs`, personel KBS erişimi
- `150_official_submission_kbs_tracking_columns.sql`: `kbs_status`, `kbs_sent_at`, …

## Proje yapısı

- `app/` – Expo Router ekranları
  - `index.tsx` – Ana giriş (Misafir QR / Personel girişi)
  - `guest/` – Misafir akışı (QR → dil → sözleşme → form → doğrulama → imza → başarı)
  - `admin/` – Admin paneli (giriş, odalar, misafirler, check-in, sözleşmeler)
- `lib/supabase.ts` – Supabase client
- `stores/` – Zustand (guestFlowStore, authStore)
- `i18n/` – Çoklu dil
- `supabase/migrations/` – Veritabanı şeması

## QR kod

- Her oda için `room_qr_codes` tablosunda token tutulur; süre dolunca admin panelinden “QR Kodu Yenile” ile yeni token üretilir.
- QR içeriği: `https://<APP_URL>/guest?token=<TOKEN>` veya sadece token (uygulama her iki formatı kabul eder).

## Sonraki fazlar

- Faz 2: Personel rolleri, haberleşme, gelişmiş çoklu dil.
- Faz 3: Müşteri uygulaması (oda servisi, temizlik talebi vb.), akıllı oda entegrasyonu.
