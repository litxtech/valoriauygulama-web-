# Supabase — `ops` şeması ve KBS Edge (zorunlu)

Loglarda görülen hatalar:

| HTTP | Anlam |
|------|--------|
| **406 PGRST106** | `ops` şeması Data API'de **exposed değil** |
| **404** `kbs-admin-credentials` | Edge fonksiyonu **deploy edilmemiş** |

## 1) Exposed schemas (406 düzeltmesi)

1. [Supabase Dashboard](https://supabase.com/dashboard) → projeniz (`sbydlcujsiqmifybqzsi`)
2. **Project Settings** → **Data API** (veya **API Settings**)
3. **Exposed schemas** listesine **`ops`** ekleyin (`public` zaten var olmalı)
4. **Save**
5. 1–2 dakika bekleyin

Doğrulama (SQL Editor):

```sql
SELECT id, role FROM ops.app_users LIMIT 5;
```

## 2) Edge deploy (404 düzeltmesi)

Proje kökünde (Supabase CLI giriş yapılmış):

```bash
supabase link --project-ref sbydlcujsiqmifybqzsi
supabase secrets set KBS_CREDENTIAL_SECRET=...   # VPS .env ile aynı
supabase functions deploy kbs-admin-credentials
```

Dashboard → **Edge Functions** listesinde `kbs-admin-credentials` görünmeli.

## 3) ops.app_users satırı

SQL Editor → `scripts/sql/kbs-link-admin-app-user.sql` (e-postanızı yazın)

veya migration `282_ops_ensure_app_user_from_staff.sql` uygulayın; ilk kayıtta Edge otomatik oluşturur.

## 4) Sıra

1. Exposed schemas → `ops`
2. SQL app_users (e-posta script)
3. Secret `KBS_CREDENTIAL_SECRET`
4. `deploy kbs-admin-credentials`
5. Uygulama → KBS Ayarları → Kaydet
