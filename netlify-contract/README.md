# Valoria – Sözleşme onayı (Vercel)

Bu klasör Vercel’e deploy edilir. Misafirler bu sitede sözleşmeyi doldurur, onay Supabase’e gider; uygulama aynı veritabanını kullanır.

## Deploy (Vercel)

1. [Vercel](https://vercel.com) → Add New Project.
2. Git repo’yu bağla (GitHub/GitLab/Bitbucket) veya **Import** ile bu klasörü yükle.
3. **Root Directory** olarak `netlify-contract` seç (veya sadece bu klasörü deploy ediyorsan `.` bırak).
4. Build ayarları: **Framework Preset** → Other, **Build Command** → `npm run build`, **Output Directory** → `.` (veya boş). Build, `maliye-config.js` dosyasini ortam degiskenlerinden uretir (Maliye portal icin zorunlu).
5. Deploy → Site URL: `https://PROJE-ADIN.vercel.app`

Sadece bu klasörü deploy ediyorsan: `netlify-contract` içindeyken `npx vercel` çalıştırıp adımları izleyebilirsin.

## Kullanılacak link (QR / paylaşım)

```
https://PROJE-ADIN.vercel.app/?token=valoria-resepsiyon-qr&lang=tr
```

- `token`: Resepsiyon token’ı (Supabase `contract_lobby_tokens` veya `room_qr_codes`).
- `lang`: `tr`, `en`, `ar`, `de`, `fr`, `ru`, `es`.

## Akış

1. Misafir linki açar → Vercel’de form + sözleşme metni yüklenir (sözleşme Supabase function’dan JSON olarak alınır).
2. Formu doldurup “Sözleşmeyi kabul ediyorum” der → POST Supabase `public-contract` function’a gider → `guests` ve `contract_acceptances` tablolarına yazılır.
3. Başarıda `success.html` açılır (uygulama indir linkleri).

## Uygulama store linkleri

`success.html` içinde:

- Android: `com.valoria.hotel` → Play link zaten doğru.
- iOS: App Store linkindeki `idXXXXXXXXX` kısmını gerçek uygulama ID’n ile değiştir.

## Bağlantı

- Supabase function: `https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/public-contract` (kodda sabit).
- Aynı proje, aynı `guests` / `contract_acceptances` tabloları; admin paneli ve uygulama bu kayıtları görür.

## Maliye Evrak Merkezi (aynı Vercel sitesi)

`maliye.html` normal statik sayfadır (sözleşme sitesi gibi bu klasörden yayınlanır). PIN ve listeler, tarayıcıdan Supabase Edge **`public-maliye`** fonksiyonuna `format=json` ile istek atarak **canlı** gelir.

### Vercel ortam değişkenleri (zorunlu)

Project → Settings → Environment Variables:

| Değişken | Açıklama |
|----------|----------|
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` veya `MALIYE_SUPABASE_ANON_KEY` | Supabase Dashboard → Settings → API → **anon / public** anahtar. Build `maliye-config.js` içine yazar. |
| `EXPO_PUBLIC_SUPABASE_URL` (isteğe bağlı) | `https://xxxx.supabase.co` — yoksa script varsayılan proje URL’ini kullanır. |

Deploy sonrası örnek link:

```
https://PROJE-ADIN.vercel.app/maliye.html?token=valoria-maliye-qr
```

Yerelde test: `netlify-contract` içinde `EXPO_PUBLIC_SUPABASE_ANON_KEY=... npm run build` çalıştırın; oluşan `maliye-config.js` git’e eklenmez (`.gitignore`).

### Ana sayfa (`index.html`)

Sözleşme onayı: Edge `public-contract` HTML’ini yükleyip gösterir (önceki akış). Maliye için doğrudan `/maliye.html` linkini kullanın.
