# KBS Ops API (`railway-service`)

Mobil ve Supabase Edge’in konuştuğu **dış KBS API** (Fastify).

## Üretim: Railway

- **Root Directory:** `railway-service`
- **Health:** `GET /health`
- **Kurulum:** [`../deploy/RAILWAY_KURULUM.md`](../deploy/RAILWAY_KURULUM.md)

`KBS_GATEWAY_URL` (Supabase) = bu servisin public URL’si (ör. `https://valoriahotel-production.up.railway.app`).

İç SOAP: `GATEWAY_BASE_URL` → Railway’de **kbs-core** (`kbs-gateway-service`) URL’si.

## Yerel

```bash
npm ci && npm run build && npm run dev
```

İki süreç birlikte (ops + core): repo kökünde `npm run build:kbs-stack`, sonra `deploy/GATEWAY_PM2.md` (yalnızca yerel).
