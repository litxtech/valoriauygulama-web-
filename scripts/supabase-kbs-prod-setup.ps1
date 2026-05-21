# Valoria KBS — Supabase Production (sbydlcujsiqmifybqzsi)
# Kullanım:
#   $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # Dashboard → Account → Access Tokens (data_api_config_write)
#   $env:SUPABASE_SERVICE_ROLE_KEY = "..."  # Project Settings → API → service_role
#   .\scripts\supabase-kbs-prod-setup.ps1 -AdminEmail "support@litxtech.com"
#
# İsteğe bağlı deploy:
#   .\scripts\supabase-kbs-prod-setup.ps1 -AdminEmail "..." -DeployEdge

param(
  [string]$ProjectRef = "sbydlcujsiqmifybqzsi",
  [string]$AdminEmail = "support@litxtech.com",
  [switch]$DeployEdge
)

$ErrorActionPreference = "Stop"
$BaseUrl = "https://$ProjectRef.supabase.co"
$MgmtUrl = "https://api.supabase.com/v1/projects/$ProjectRef/postgrest"

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# --- 1) PostgREST: expose ops schema (Management API) ---
Write-Step "PostgREST db_schema (public + ops)"
$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
  Write-Host "SUPABASE_ACCESS_TOKEN yok — Dashboard'da elle yapın:" -ForegroundColor Yellow
  Write-Host "  Data API → Settings → Exposed schemas: public, ops → Save"
} else {
  $headers = @{
    Authorization = "Bearer $token"
    "Content-Type" = "application/json"
  }
  try {
    $current = Invoke-RestMethod -Uri $MgmtUrl -Headers @{ Authorization = "Bearer $token" } -Method Get
    Write-Host "Mevcut db_schema: $($current.db_schema)"
  } catch {
    Write-Host "GET postgrest config: $($_.Exception.Message)" -ForegroundColor Yellow
  }

  $body = @{ db_schema = "public,graphql_public,ops" } | ConvertTo-Json
  try {
    $updated = Invoke-RestMethod -Uri $MgmtUrl -Headers $headers -Method Patch -Body $body
    Write-Host "Güncellendi db_schema: $($updated.db_schema)" -ForegroundColor Green
  } catch {
    Write-Host "PATCH başarısız: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Dashboard → Data API → Settings → Exposed schemas: public, ops"
  }
}

# --- 2) REST test: ops.app_users ---
Write-Step "REST test (ops profile)"
$srk = $env:SUPABASE_SERVICE_ROLE_KEY
if (-not $srk) {
  Write-Host "SUPABASE_SERVICE_ROLE_KEY yok — SQL Editor adımını atlayıp sadece Dashboard SQL kullanın." -ForegroundColor Yellow
} else {
  $restHeaders = @{
    apikey = $srk
    Authorization = "Bearer $srk"
    Accept = "application/json"
    "Accept-Profile" = "ops"
  }
  $testUrl = "$BaseUrl/rest/v1/app_users?select=id&limit=1"
  try {
    $r = Invoke-WebRequest -Uri $testUrl -Headers $restHeaders -Method Get -UseBasicParsing
    Write-Host "REST ops OK (status $($r.StatusCode))" -ForegroundColor Green
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host "REST ops FAIL (status $status) — Exposed schemas veya migration 283 gerekli" -ForegroundColor Red
  }
}

# --- 3) SQL: bootstrap + app_users (requires service role or run in SQL Editor) ---
Write-Step "ops.app_users + demo hotel"
$sql = @"
SELECT ops.bootstrap_demo_hotel('valoria-ops', 'Valoria Hotel (OPS)', '', 101, 8);
INSERT INTO ops.app_users (id, hotel_id, full_name, role, is_active, kbs_access_enabled)
SELECT u.id, h.id, COALESCE(s.full_name, u.email, 'Admin'),
  CASE WHEN s.role = 'manager' THEN 'manager' ELSE 'admin' END, true, true
FROM auth.users u
LEFT JOIN public.staff s ON s.auth_id = u.id AND s.is_active = true AND s.deleted_at IS NULL
CROSS JOIN ops.hotels h
WHERE h.code = 'valoria-ops' AND u.email = '$AdminEmail'
LIMIT 1
ON CONFLICT (id) DO UPDATE SET hotel_id = EXCLUDED.hotel_id, role = EXCLUDED.role,
  is_active = true, kbs_access_enabled = true;
"@

$sqlFile = Join-Path $PSScriptRoot "sql\_kbs-setup-temp.sql"
$sql | Set-Content -Path $sqlFile -Encoding UTF8
Write-Host "SQL dosyası: $sqlFile"
Write-Host "Supabase SQL Editor'de bu dosyanın içeriğini yapıştırıp Run edin (service role gerekmez)."

if ($srk) {
  Write-Host "veya: supabase link --project-ref $ProjectRef && supabase db execute -f `"$sqlFile`""
}

# --- 4) Edge deploy ---
if ($DeployEdge) {
  Write-Step "Edge deploy kbs-admin-credentials"
  Set-Location (Join-Path $PSScriptRoot "..")
  supabase link --project-ref $ProjectRef
  supabase functions deploy kbs-admin-credentials
  Write-Host "Secrets: supabase secrets set KBS_CREDENTIAL_SECRET=..." -ForegroundColor Yellow
}

Write-Step "Bitti"
Write-Host @"

Kontrol listesi:
  [ ] Data API → Exposed schemas: public + ops
  [ ] SQL Editor → _kbs-setup-temp.sql veya kbs-link-admin-app-user.sql
  [ ] Edge secret KBS_CREDENTIAL_SECRET
  [ ] supabase functions deploy kbs-admin-credentials
  [ ] Uygulama → KBS Ayarları → Kaydet

"@
