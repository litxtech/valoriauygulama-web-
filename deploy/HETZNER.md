# Hetzner VPS — KBS (tek sunucu, sabit IP)

> **Sabit IP:** Aşağıda `YOUR_STATIC_IP` geçen her yeri, Hetzner’den aldığınız **genel IPv4** ile değiştirin (örnek: `95.216.xxx.xxx`). Bu dosyayı repo’ya gerçek IP ile commit etmeyin; yalnızca kopyalayıp sunucuda kullanın.

## 0) Hetzner Cloud — “Create a server” ekranında ne seçeceksiniz?

| Alan | Öneri |
|------|--------|
| **Type** | **Shared** yeterli (KBS için iki Node süreci + OS; Dedicated şart değil). |
| **Plan** | Başlangıç için **cpx22** (2 vCPU, 4 GB RAM, 80 GB disk) genelde yeter. Çok eşzamanlı trafik veya ileride başka servisler aynı makinede olacaksa **cpx32**. |
| **Location** | Müşteri ve Jandarma gecikmesi için **Almanya / Finlandiya** (Hetzner’in EU lokasyonlarından biri) mantıklı; Türkiye’ye en yakın seçeneği tercih edebilirsiniz. |
| **Image** | **Ubuntu 24.04 LTS** veya **22.04 LTS** (Apps’ten Docker şart değil; düz Ubuntu + Node yeter). |
| **Networking** | **Public IPv4** açık olsun (Supabase Edge `KBS_GATEWAY_URL` bu IP’ye gidecek). IPv6 ücretsiz; açabilirsiniz. **Primary IP**: Sunucu oluşunca atanır; “Floating IP” ayrıca satın aldıysanız sunucuya **Primary IP olarak bağlayın** ki beyan ettiğiniz sabit adres hep bu sunucuya işaret etsin. |
| **Private network** | Tek sunucu için **zorunlu değil**. İleride birden fazla sunucu olursa eklenir. |
| **SSH keys** | **Mutlaka ekleyin** (güvenlik + root şifresi e-postası gelmez). OpenSSH formatında public key. |
| **Volumes** | Başlangıçta **gerekmez**; 80 GB yeterli değilse sonra volume eklenebilir. |
| **Firewalls** | Şimdi boş bırakıp sunucu geldikten sonra da kural yazabilirsiniz; öneri: **SSH (22)** + **TCP 4000** (Ops API) gelen; **4001 dışarı kapalı**. Hetzner Firewall’u sunucuya **atan** unutmayın. |
| **Backups** | İsterseniz açın (%20 ek); KBS üretimi için iyi fikir. |
| **Placement / Labels** | Zorunlu değil. İsim: **valoria** uygun. |
| **Cloud config** | Boş bırakın (ilk kurulumda `deploy/HETZNER.md` + `GATEWAY_PM2.md` ile ilerlersiniz). |

Sunucu **Running** olduktan sonra: Hetzner panelinden **IPv4**’ü not edin → `YOUR_STATIC_IP` olarak Supabase ve dokümantasyonda kullanın.

Kimlik bildirimi (KBS) uçtan uca test: **`deploy/KBS_E2E_TEST.md`**, SQL provizyon: **`scripts/sql/kbs-ops-test-provision.sql`**.

## Akış

```
Mobil → Supabase (Auth, DB) → Edge ops-proxy → http://YOUR_STATIC_IP:4000 (Ops API) → http://127.0.0.1:4001 (iç SOAP gateway) → Jandarma KBS
```

- Mobil **doğrudan** Jandarma’ya bağlanmaz (`lib/kbsApi` yalnızca Edge `ops-proxy`).
- KBS’ye giden SOAP trafiği **VPS’in giden IP’sinden** çıkar (Hetzner’de genelde atanmış genel IPv4; “Floating IP” / ek sabit IP kullanıyorsanız sunucuya o IP’yi bağlayıp çıkışın o IP’den gitmesini sağlayın — Hetzner dokümantasyonuna bakın).

## 1) Supabase Edge secrets

```bash
supabase secrets set KBS_GATEWAY_URL=http://YOUR_STATIC_IP:4000
supabase secrets set KBS_GATEWAY_TOKEN=<uzun-rastgele-güvenli-değer>
supabase functions deploy ops-proxy
```

- URL sonunda **`/` yok**, adres içinde **boşluk yok**.
- `KBS_GATEWAY_TOKEN`, VPS’teki `railway-service/.env` içindeki **`KBS_GATEWAY_TOKEN`** ile **aynı** olmalı.

## 2) VPS — iki süreç (PM2)

| Süreç (PM2 adı) | Klasör | Port | Dış dünya |
|------------------|--------|------|-----------|
| `valoria-kbs-ops` | `railway-service/` | **4000** | Evet (`KBS_GATEWAY_URL`) |
| `valoria-kbs-core` | `kbs-gateway-service/` | **4001** | Hayır (yalnız `127.0.0.1`) |

**Ortam dosyaları:** Sunucuda oluşturun (repoya commit etmeyin):

- `railway-service/.env` — şablon: `railway-service/.env.example`
- `kbs-gateway-service/.env` — şablon: `kbs-gateway-service/.env.example`

**Ops tarafında** iç gateway adresi: **`GATEWAY_BASE_URL=http://127.0.0.1:4001`** (PM2 `ecosystem.config.cjs` bunu zaten verir; `.env` içinde çakışan satır varsa PM2 `env` bölümü önceliklidir.)

### Zorunlu değişkenler (özet)

| Değişken | Nerede | Not |
|----------|--------|-----|
| `PORT` | Ops: 4000, Core: 4001 | PM2 verir; `.env` ile uyumlu tutun |
| `SUPABASE_URL` | Her iki `.env` | Supabase proje kökü |
| `SUPABASE_SERVICE_ROLE_KEY` | Her iki `.env` | Service role (yalnız sunucu) |
| `GATEWAY_SHARED_SECRET` | Her iki `.env` | **Aynı** string, ≥16 karakter |
| `KBS_CREDENTIAL_SECRET` | Her iki `.env` | **Aynı** string, ≥16 karakter |
| `KBS_GATEWAY_TOKEN` | Sadece `railway-service/.env` | Supabase `KBS_GATEWAY_TOKEN` ile aynı |
| `GATEWAY_BASE_URL` | Ops | **`http://127.0.0.1:4001`** (sabit IP buraya yazılmaz) |
| `OFFICIAL_PROVIDER_MODE` | Core | Üretim: `http` |
| `OFFICIAL_PROVIDER_BASE_URL` | Core | Jandarma SOAP WSDL kökü (`.env.example` ile aynı) |

### Derleme ve başlatma

```bash
cd /path/to/valoria-hotel
npm run build:hetzner-stack
cd railway-service
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup
```

Ayrıntı ve güvenlik duvarı: **`deploy/GATEWAY_PM2.md`**.

### Sağlık kontrolleri

```bash
curl -sS http://127.0.0.1:4001/gateway/health
curl -sS http://127.0.0.1:4000/health
curl -sS http://YOUR_STATIC_IP:4000/health
```

Beklenen: JSON içinde `ok: true` (4000 yanıtında `service: "valoria-kbs-gateway"`).

**Firewall:** Gelen olarak **4000** ve **22**; **4001** dışarı kapalı.

## 3) Sırları siz üretin (ben üretmem / repoya yazmam)

Aşağıdakileri **sunucuda** veya güvenli bir yerde oluşturup yalnızca `.env` + Supabase’e yapıştırın:

```bash
# Örnek: 32 bayt hex (iki serviste aynı olacak değerler için iki kez çalıştırmayın; bir kez üretip kopyalayın)
openssl rand -hex 32   # GATEWAY_SHARED_SECRET veya KBS_CREDENTIAL_SECRET için
openssl rand -hex 32   # diğeri için
openssl rand -hex 24   # KBS_GATEWAY_TOKEN için
```

**Bana iletmeyin:** `SUPABASE_SERVICE_ROLE_KEY`, `GATEWAY_SHARED_SECRET`, `KBS_CREDENTIAL_SECRET`, `KBS_GATEWAY_TOKEN`.  
**Bana iletebilirsiniz (kurulum için yeterli):** Yalnızca **yeni sabit IPv4** (ve isteğe bağlı: Supabase proje ref / URL — service role yine sizde kalsın).

## 4) Veritabanı

İlgili migration örnekleri: `137_ops_official_checkin_system.sql`, `143_kbs_logs_and_staff_access.sql`, `150_official_submission_kbs_tracking_columns.sql`.

## 5) IP’yi verdikten sonra yapılacaklar (checklist)

1. Bu dosyada ve `deploy/HETZNER.md` dışında kopyaladığınız notlarda `YOUR_STATIC_IP` → gerçek IP.
2. Supabase: `KBS_GATEWAY_URL=http://<GERÇEK_IP>:4000` + token + `ops-proxy` deploy.
3. VPS firewall: 4000 açık, 4001 kapalı.
4. `pm2 restart ecosystem.config.cjs` veya tam yeniden başlatma.

## Hazır komutlar (IP’yi bir kez tanımlayın)

```bash
export H=YOUR_STATIC_IP
supabase secrets set KBS_GATEWAY_URL=http://${H}:4000
# KBS_GATEWAY_TOKEN zaten ayarlıysa tekrar set etmeyin; değiştiriyorsanız:
# supabase secrets set KBS_GATEWAY_TOKEN=<yeni-değer>
supabase functions deploy ops-proxy
curl -sS "http://${H}:4000/health"
```
