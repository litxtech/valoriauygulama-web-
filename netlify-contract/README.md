# Valoria – Vercel statik site (`netlify-contract`)

Bu klasör tek bir Vercel projesi olarak yayınlanır. İçinde **birbirinden bağımsız iki ayrı uygulama** vardır; karıştırılmamalıdır:

| Dosya / rota | Ne işe yarar |
|----------------|---------------|
| **`index.html`** (site kökü `/`) | **Misafir sözleşme onayı** — `public-contract` Edge’ten HTML alır, onay `guests` / `contract_acceptances` ile ilgilidir. |
| **`maliye.html`** (`/maliye.html`) | **Maliye / denetim evrak merkezi** — PIN, evrak listesi, formlar; tamamen **`public-maliye`** API’si ile ilgilidir. Sözleşme akışı değildir. |

Aynı Supabase projesine bağlanırlar; işlev ve veri modeli ayrıdır.

## Deploy (Vercel)

1. [Vercel](https://vercel.com) → Add New Project.
2. Git repo’yu bağla veya **Import** ile bu klasörü yükle.
3. **Root Directory** → `netlify-contract`.
4. **Framework Preset** → Other, **Build Command** → `npm run build`, **Output Directory** → `.`  
   - `npm run build` yalnızca **Maliye** sayfasının ihtiyaç duyduğu `maliye-config.js` dosyasını üretir (anon key). Sözleşme kökü bu dosyaya ihtiyaç duymaz.
5. Deploy → `https://PROJE-ADIN.vercel.app`

## Sözleşme onayı (kökn `/`)

```
https://PROJE-ADIN.vercel.app/?token=valoria-resepsiyon-qr&lang=tr
```

- `token`: `contract_lobby_tokens` / `room_qr_codes`
- `lang`: `tr`, `en`, `ar`, …

Akış: sayfa `public-contract` HTML’ini yükler → misafir onaylar → `public-contract` POST.

## Maliye evrak merkezi (ayrı URL)

```
https://PROJE-ADIN.vercel.app/maliye.html?token=valoria-maliye-qr
```

- Bu sayfa **sözleşme formu değildir**; yalnızca denetim evrakları ve günlük formlar içindir.
- Tarayıcı `public-maliye` fonksiyonuna `format=json` ile istek atar.

### Ortam değişkenleri (Maliye build için)

| Değişken | Açıklama |
|----------|----------|
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` veya `MALIYE_SUPABASE_ANON_KEY` | Supabase **anon / public** anahtar → `maliye-config.js` içine yazılır. |
| `EXPO_PUBLIC_SUPABASE_URL` | İsteğe bağlı; yoksa `gen-maliye-config` varsayılan proje URL’ini kullanır. |

Yerelde: `EXPO_PUBLIC_SUPABASE_ANON_KEY=... npm run build` — `maliye-config.js` git’e girmez (`.gitignore`).

## Bağlantılar (Supabase Edge)

- Sözleşme: `…/functions/v1/public-contract` (kök sayfa yükleyicide sabit).
- Maliye: `…/functions/v1/public-maliye` (`maliye-config.js` içindeki `apiBase`).

## Uygulama store linkleri

`success.html` içindeki Play / App Store linklerini kendi uygulama bilgilerinizle güncelleyin.
