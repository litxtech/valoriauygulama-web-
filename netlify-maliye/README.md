# Valoria – Maliye evrak merkezi (ayrı Vercel sitesi)

Misafir **sözleşme onayı değildir.** Bu klasör yalnızca **maliye / denetim**: otel evrakları, günlük müşteri form listesi, QR ile açılıp **PIN** ile doğrulanan portal.

- API: Supabase Edge `public-maliye` (`format=json`).
- Misafir sözleşmesi: `netlify-contract` klasörü → **ayrı** Vercel projesi.

## Deploy

1. Vercel’de **yeni proje** oluştur (sözleşme projesinden bağımsız).
2. **Root Directory** → `netlify-maliye`.
3. **Build Command** → `npm run build`, **Output** → `.`
4. Environment Variables:
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` veya `MALIYE_SUPABASE_ANON_KEY` (zorunlu)
   - `EXPO_PUBLIC_SUPABASE_URL` (isteğe bağlı)

## QR / paylaşım linki

Kök sayfa maliye portalıdır:

```
https://MALIYE-PROJE.vercel.app/?token=valoria-maliye-qr
```

Eski `/maliye.html` yolu köke yönlendirilir.

Yerelde: `EXPO_PUBLIC_SUPABASE_ANON_KEY=... npm run build` → `maliye-config.js` üretilir (git’e girmez).

## Sorun: Maliye linkinde sözleşme onayı açılıyorsa

Bu, neredeyse her zaman **yanlış Vercel projesi** veya **yanlış Root Directory** demektir.

- Repo’daki **`valoriahotel-el4r.vercel.app`** (veya sözleşme için kullandığınız adres) = **`netlify-contract`** kökü → kök `/` dosyası **sözleşme** `index.html`’dir. Maliye burada **yoktur**.
- Maliye için: Vercel’de **ayrı bir proje** oluşturun, **Root Directory = `netlify-maliye`**, env’leri ekleyin, deploy edin. QR ve admin’deki “Portal taban URL” olarak **bu yeni projenin** `https://....vercel.app` adresini kullanın (sözleşme URL’si değil).

Kaynak kodda `netlify-maliye/index.html` başlığı **“Valoria Maliye Evrak Merkezi”** olmalı; tarayıcıda “Sözleşme yükleniyor” görüyorsanız hâlâ sözleşme sitesindesiniz.
