# KBS — kısa özet

**Kurulum (Railway):** [`deploy/RAILWAY_KURULUM.md`](./RAILWAY_KURULUM.md)

Hetzner / pm2 / sabit IP **kullanılmıyor**.

| Ne | Nerede |
|----|--------|
| Şifre, oda atama | Supabase Edge |
| Jandarma bildirimi, bağlantı testi | Railway (`railway-service` + `kbs-gateway-service`) |
| Mobil | `EXPO_PUBLIC_KBS_UI_ENABLED=true`, `EXPO_PUBLIC_RAILWAY_API_URL` |

```text
Mobil → Supabase → https://valoriahotel-production.up.railway.app → Jandarma
```
