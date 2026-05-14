# Valoria – Misafir sözleşme onayı (Vercel)

Bu klasör **yalnızca** misafir sözleşme / kurallar onayı içindir. **Maliye evrak portalı bu klasörde yoktur** — ayrı klasör: `netlify-maliye` (ayrı Vercel projesi).

## Deploy (Vercel)

1. [Vercel](https://vercel.com) → Add New Project.
2. Repo bağla; **Root Directory** → `netlify-contract`.
3. **Framework** → Other, **Build Command** → boş veya `echo OK`, **Output Directory** → `.`
4. Deploy → `https://PROJE-ADIN.vercel.app`

## QR / paylaşım

```
https://PROJE-ADIN.vercel.app/?token=valoria-resepsiyon-qr&lang=tr
```

- `token`: `contract_lobby_tokens` / `room_qr_codes`
- `lang`: `tr`, `en`, …

Akış: `index.html` → Edge `public-contract` HTML yüklenir → onay `guests` / `contract_acceptances`.

## Bağlantı

- Edge: `https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/public-contract` (yüklemede sabit).

## Mağaza linkleri

`success.html` içindeki Play / App Store adreslerini güncelleyin.
