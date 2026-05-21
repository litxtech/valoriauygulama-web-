import { z } from 'zod';

const REQUIRED_ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GATEWAY_BASE_URL',
  'GATEWAY_SHARED_SECRET',
  'KBS_CREDENTIAL_SECRET'
] as const;

/**
 * `GATEWAY_BASE_URL` boşsa, aynı anlama gelen yedek isimlerden doldur (KBS_SOAP_GATEWAY_URL / INTERNAL_KBS_GATEWAY_URL).
 * Supabase `KBS_GATEWAY_URL` burada kullanılmaz — o değişken Edge → **dış Ops API** içindir; bu ise Ops → **iç SOAP gateway** içindir.
 */
function coalesceGatewayBaseUrl(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...input };
  const primary = String(out.GATEWAY_BASE_URL ?? '').trim();
  if (primary) return out;
  const alt = String(out.KBS_SOAP_GATEWAY_URL ?? out.INTERNAL_KBS_GATEWAY_URL ?? '').trim();
  if (alt) out.GATEWAY_BASE_URL = alt;
  return out;
}

/** Railway boş `PORT=` verirse z.coerce 0 üretir; dinleyici yanlış porta düşer. */
function normalizePort(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out = { ...input };
  const raw = out.PORT;
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    delete out.PORT;
  }
  return out;
}

/** Panelde yalnızca host verilmişse https ekle (ör. kbs-core-xxx.up.railway.app). */
function ensureHttpUrl(value: unknown): string | undefined {
  const s = String(value ?? '').trim();
  if (!s) return undefined;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),

  SUPABASE_URL: z.preprocess(ensureHttpUrl, z.string().url()),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  APP_ENV: z.enum(['local', 'staging', 'prod']).default('local'),

  GATEWAY_BASE_URL: z.preprocess(ensureHttpUrl, z.string().url()),
  GATEWAY_SHARED_SECRET: z.string().min(16),

  KBS_CREDENTIAL_SECRET: z.string().min(16),

  /** Supabase Edge ops-proxy → VPS: aynı değer Edge secret KBS_GATEWAY_TOKEN ile eşleşmeli. Boşsa (yalnızca yerel) kontrol yapılmaz. */
  KBS_GATEWAY_TOKEN: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

export type Env = z.infer<typeof EnvSchema>;

export function formatEnvLoadError(err: z.ZodError, input: NodeJS.ProcessEnv = process.env): string {
  const normalized = coalesceGatewayBaseUrl(input);
  const missing = REQUIRED_ENV_KEYS.filter((k) => !String(normalized[k] ?? '').trim());
  const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
  const hint =
    missing.length > 0
      ? ` Eksik/boş: ${missing.join(', ')}. Railway → kbs-ops → Variables (Runtime) bkz. deploy/RAILWAY_KURULUM.md`
      : '';
  return `Invalid env: ${issues}.${hint}`;
}

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(normalizePort(coalesceGatewayBaseUrl(input)));
  if (!parsed.success) {
    throw new Error(formatEnvLoadError(parsed.error, input));
  }
  return parsed.data;
}

/** Railway `PORT` öncelikli; env şeması yedek. */
export function resolveListenPort(envPort: number): number {
  const raw = process.env.PORT;
  if (raw === undefined || String(raw).trim() === '') return envPort;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0 && Number.isInteger(n)) return n;
  return envPort;
}

