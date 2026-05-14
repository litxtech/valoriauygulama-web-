import { z } from 'zod';

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

const EnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  PORT: z.coerce.number().int().positive().default(3000),

  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),

  APP_ENV: z.enum(['local', 'staging', 'prod']).default('local'),

  GATEWAY_BASE_URL: z.string().url(),
  GATEWAY_SHARED_SECRET: z.string().min(16),

  KBS_CREDENTIAL_SECRET: z.string().min(16),

  /** Supabase Edge ops-proxy → VPS: aynı değer Edge secret KBS_GATEWAY_TOKEN ile eşleşmeli. Boşsa (yalnızca yerel) kontrol yapılmaz. */
  KBS_GATEWAY_TOKEN: z.string().optional(),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info')
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(coalesceGatewayBaseUrl(input));
  if (!parsed.success) {
    // Do not log secrets; zod output may contain values.
    throw new Error(`Invalid env: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
  }
  return parsed.data;
}

