# Mobil test (web açılmaz)

Build indirdin (Valoria Hotel / valoriahotel1). **Web tarayıcıda açılmamalı** – sadece bu uygulama açılır.

## "Kod bulunamadı" hatası

`npx expo start --clear` **kullanma** – telefonda uygulama bilgisayarın adresini bilmediği için bundle'ı bulamaz, "Kod bulunamadı" der.  
**Her zaman şunu kullan:** `npm start` veya `npm run start:dev:lan` (LAN IP + dev-client + QR scheme ayarlı).

## QR ile otomatik açılma (Android)

`npm start` ile başlattığında terminaldeki **QR kodu** okutabilirsin.

**Android 13+ bilinen sorun:** Sistem kamerası QR'ı bazen **Chrome'da** açar (Expo'nun kayıtlı davranışı). Bu durumda:

1. Terminalde yazdırılan **`exp://192.168.x.x:8081`** adresini kopyala
2. **Valoria** uygulamasını aç → **URL gir** → yapıştır → Bağlan

Bu yöntem her zaman çalışır; QR'dan daha güvenilir.

**iOS'ta** dev launcher'da QR seçeneği yok (aşağıya bak).

## iOS'ta kamera / QR yok

**iOS'ta** dev client launcher'da **QR tarama seçeneği yok** (Expo'nun mevcut davranışı). Sadece **"Enter URL" / "URL gir"** alanı var.

**Yapman gereken (iOS):**
1. Bilgisayarda `npm start` veya `npm run start:dev:tunnel` çalıştır.
2. Terminalde görünen adresi kopyala (`exp://192.168.x.x:8081` veya tunnel ise `exp://xxx.exp.direct:80`).
3. iPhone'da Valoria Hotel uygulamasını aç → **"Enter URL" / "URL gir"** alanına bu adresi **yapıştır** → Bağlan.

**Tunnel (önerilen iOS için):** Aynı WiFi şart değil, tek URL her zaman geçerli.
```bash
npm run start:dev:tunnel
```
Terminaldeki tek URL'i iOS'ta "URL gir"e yapıştırman yeterli.

---

## Adımlar

1. **Bilgisayarda** (aynı WiFi'de veya tunnel için herhangi bir ağ):
   ```bash
   npm start
   ```
   veya tunnel için (özellikle iOS):
   ```bash
   npm run start:dev:tunnel
   ```
   Terminalde QR ve adres görünür. (`npx expo start --clear` kullanma.)

2. **Telefonda:**
   - **Android:** QR'ı kamerayla okutabilirsin veya uygulama içinde "URL gir"e `exp://192.168.x.x:8081` yapıştır.
   - **iOS:** Uygulama içinde **"URL gir"** açık; terminaldeki adresi kopyalayıp buraya yapıştır (QR seçeneği iOS'ta yok).

3. **Yapma:**
   - Terminalde **w** tuşuna basma (web açar).
   - Bağlantı linkine **tarayıcıdan** tıklama (QR veya uygulama içinden kullan).

## Yeni build alırsan

`app.json`'a `expo-dev-client` eklendi; her açılışta "launcher" (URL gir ekranı) gelir. Yeni dev build:
```bash
npm run build:dev:android
# veya
npm run build:dev:ios
```
