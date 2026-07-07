# Valoria · Çekilen Kimlikler Web Paneli

Personelin çektiği kimlik/pasaport belgelerini **web üzerinden** görüntülemek için hafif bir panel. Mobil uygulamayla **aynı Supabase projesine** doğrudan bağlanır.

## Özellikler

- **Oturum koruması:** Personel, mobil uygulamayla aynı Supabase hesabıyla (e-posta/şifre) giriş yapar. Oturum tarayıcıda güvenli saklanır; giriş yapılmadan hiçbir veri gösterilmez.
- **Yetki + otel kapsamı:** Erişim `ensure_my_ops_app_user` RPC + `ops.guest_documents` RLS ile sağlanır. Kimlik çekim yetkisi (`id_capture` / `kbs_mrz_scan` / admin / manager) olmayan hesaplar veri göremez. Her personel yalnızca **kendi otelinin** tüm çekimlerini görür.
- **Anında güncelleme (realtime):** `ops.guest_documents` tablosuna Supabase Realtime ile abone olunur. Yeni kimlik yüklendiğinde veya güncellendiğinde liste otomatik yenilenir (debounce'lı).
- **Temiz OCR okuma:** `parsed_payload` + belge/misafir sütunları mobil uygulamadaki mantığın birebir portuyla normalize edilir. Ad, soyad, kimlik/pasaport no, seri no, doğum tarihi, yaş, uyruk, son kullanım, cinsiyet, medeni hal, anne/baba adı, belge türü ve veren ülke temiz gösterilir. Alanlar tek tıkla veya toptan kopyalanabilir. Ön/arka görsel büyütülebilir.

## Kurulum

```bash
cd web-kbs
npm install
cp .env.example .env   # değerleri doldurun
npm run dev            # http://localhost:5180
```

`.env` içindeki değerler mobil uygulamanın env'iyle **birebir aynı** olmalı:

| web-kbs (.env)          | Mobil (Expo)                     |
| ----------------------- | -------------------------------- |
| `VITE_SUPABASE_URL`     | `EXPO_PUBLIC_SUPABASE_URL`       |
| `VITE_SUPABASE_ANON_KEY`| `EXPO_PUBLIC_SUPABASE_ANON_KEY`  |

## Gereksinimler (Supabase tarafı)

- **`ops` şeması Data API'de açık olmalı:** Dashboard → Project Settings → Data API → Exposed schemas → `ops` ekli olmalı (mobil uygulama zaten bunu kullanıyor).
- **Realtime publication:** `ops.guest_documents` `supabase_realtime` publication'ında olmalı (migration `213` ekliyor).
- **RLS:** `ops.guest_documents` SELECT policy `hotel_id = ops.current_hotel_id()` — otel kapsamını ve realtime yetkisini sağlar.

## Derleme / dağıtım

```bash
npm run build     # dist/ üretir (statik)
npm run preview   # dist önizleme
```

`dist/` herhangi bir statik barındırmada (Vercel, Netlify, Cloudflare Pages, nginx) yayınlanabilir. Panel salt-okunur olduğundan servis tarafı gerektirmez; güvenlik RLS + Supabase Auth ile sağlanır.

## Mimari notlar

- Tüm veri erişimi tarayıcıdan Supabase anon client + kullanıcı JWT ile yapılır; **service-role anahtarı kullanılmaz**.
- OCR/parse mantığı `src/lib/parse.ts`, `personName.ts`, `nationality.ts` altında — mobil `lib/kbsCaptureParsedFields.ts` & yardımcılarının portudur. Mobil taraf değişirse burası da güncellenmeli.
