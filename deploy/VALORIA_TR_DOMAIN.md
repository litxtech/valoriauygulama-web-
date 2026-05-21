# valoria.tr — canlı menü sitesi

## 1. Vercel’de domain

1. Vercel → proje (Expo web build) → **Settings → Domains**
2. **Add:** `valoria.tr` ve `www.valoria.tr`
3. DNS (domain sağlayıcınızda):
   - `A` → `76.76.21.21` (Vercel)
   - veya `CNAME` `www` → `cname.vercel-dns.com`

## 2. Ortam değişkeni

Vercel → **Environment Variables:**

```
EXPO_PUBLIC_APP_URL=https://valoria.tr
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

Deploy sonrası sabit QR adresleri:

| Amaç | URL |
|------|-----|
| Menü | `https://valoria.tr/menü/{slug}` |
| Sözleşme | `https://valoria.tr/sözleşme?t=TOKEN&l=tr` |
| Maliye | `https://valoria.tr/maliye?token=TOKEN` |

Eski yollar da çalışır: `/menu/...`, `/guest/sign-one`.

(`slug` = `organizations.slug`, örn. `valoria`)

## 3. Admin’den URL (push gerekmez)

**Yönetim → QR Merkezi → Canlı site adresi** alanına `https://valoria.tr` yazıp kaydedin.  
Migration `294_app_public_base_url_valoria_tr.sql` varsayılanı ayarlar.

## 4. Supabase migration (bir kez)

```bash
npx supabase db push
```

En azından:

- `293_hotel_kitchen_menu_public_qr.sql` — anon menü + Realtime
- `294_app_public_base_url_valoria_tr.sql` — varsayılan `https://valoria.tr`

## 5. Anlık menü güncellemesi (deploy gerekmez)

- Menü verisi **Supabase**’de; personel/admin yemek ekleyince **git push / Vercel redeploy gerekmez**.
- `https://valoria.tr/menu/{slug}` **Realtime** ile yenilenir; yedek ~30 sn poll.
- Test: Menü sayfasını tarayıcıda açık tutun → uygulamadan yemek ekleyin → “Menü güncellendi” görünür.

## 6. İlk deploy (domain / rota için bir kez)

Kod GitHub’da güncel olmalı (`app/menu/` rotası). Eski deploy menüyü açmaz.
