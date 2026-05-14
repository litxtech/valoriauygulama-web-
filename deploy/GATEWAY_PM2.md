# KBS yığını — PM2 (Hetzner tek VPS)

İki ayrı Node süreci: **Ops API** (dış :4000) + **iç SOAP gateway** (:4001). Tanım: `railway-service/ecosystem.config.cjs`.

## Önce: doğru dizin ve doğru süreç

- **`cd railway-service: No such file`** → Repoyu sunucuya klonlayın, örnek: `git clone <REPO_URL> valoria-hotel && cd valoria-hotel`.
- **`pm2: command not found`** → `sudo npm install -g pm2` (Node 20+ önerilir; `--env-file` için gerekli).
- **`curl .../health` sadece `OK` dönüyorsa** → Port **4000**’de bu projenin Fastify Ops API’si çalışmıyor olabilir. Beklenen JSON örneği: `{"ok":true,"service":"valoria-kbs-gateway",...}`.

## 1) Ortam dosyaları (VPS’te, repoda yok — siz oluşturursunuz)

| Dosya | İçerik özeti |
|--------|----------------|
| `railway-service/.env` | `SUPABASE_*`, `GATEWAY_SHARED_SECRET`, `KBS_CREDENTIAL_SECRET`, `KBS_GATEWAY_TOKEN` (Supabase ile aynı). `GATEWAY_BASE_URL` yazmayın da olur; PM2 **`http://127.0.0.1:4001`** verir. |
| `kbs-gateway-service/.env` | Aynı `SUPABASE_*`, aynı `GATEWAY_SHARED_SECRET` ve `KBS_CREDENTIAL_SECRET`, `OFFICIAL_PROVIDER_MODE=http`, `OFFICIAL_PROVIDER_BASE_URL` (Jandarma SOAP). `PORT=4001` şablonda; PM2 de 4001 verir. |

Şablonlar: `railway-service/.env.example`, `kbs-gateway-service/.env.example`.

## 2) Derleme ve PM2

```bash
cd /path/to/valoria-hotel
npm run build:hetzner-stack

cd railway-service
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
# çıkan `sudo env PATH=... pm2 startup ...` komutunu bir kez çalıştırın
```

**Süreç adları:** `valoria-kbs-core` (:4001) önce, `valoria-kbs-ops` (:4000) sonra başlar.

## 3) Kontrol

```bash
pm2 status
curl -sS http://127.0.0.1:4001/gateway/health
curl -sS http://127.0.0.1:4000/health
curl -sS http://SUNUCU_PUBLIC_IP:4000/health
```

İç gateway (:4001) dışarıdan **erişilmemeli**; UFW vb. ile yalnızca **4000** ve **22** açık olsun.

## 4) Güncelleme (deploy)

```bash
cd /path/to/valoria-hotel
git pull
npm run build:hetzner-stack
pm2 restart ecosystem.config.cjs
```

## 5) Port çakışması

Eski süreç 4000’i tutuyorsa: `pm2 list` → `pm2 delete <eski_ad>` veya `sudo ss -tlnp | grep 4000` ile PID kontrolü.

## systemd (alternatif)

Tek süreç için örnek aşağıda; iki süreç için PM2 önerilir. İsterseniz iki ayrı `.service` unit tanımlayın (WorkingDirectory ve `ExecStart` her klasör için).

```ini
[Unit]
Description=Valoria KBS Ops API (Node)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/valoria-hotel/railway-service
Environment=NODE_ENV=production
Environment=PORT=4000
Environment=GATEWAY_BASE_URL=http://127.0.0.1:4001
EnvironmentFile=/path/to/valoria-hotel/railway-service/.env
ExecStart=/usr/bin/node dist/app/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

İç gateway için ikinci unit: `WorkingDirectory=.../kbs-gateway-service`, `Environment=PORT=4001`, `After=` ile Ops’tan sonra başlatın veya manuel sıra.
