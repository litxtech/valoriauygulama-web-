import { edgeInvokeToApiResult } from '@/lib/functionsError';
import { invokeSupabaseEdgeFunction } from '@/lib/edgeInvokeTimeout';
import type { ApiResult } from '@/lib/kbsApi';
import { supabase } from '@/lib/supabase';

type KbsSettingsRow = {
  facility_code?: string | null;
  username?: string | null;
  kullanici_tc?: string | null;
  provider_type?: string | null;
  is_active?: boolean | null;
  has_password?: boolean;
  last_tested_at?: string | null;
  updated_at?: string | null;
};

const FN = 'kbs-admin-credentials';
const DEPLOY_HINT =
  'kbs-admin-credentials deploy edilmemiş veya JWT kapısı hata veriyor. Çalıştırın: supabase functions deploy kbs-admin-credentials (config.toml verify_jwt=false ile).';

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function invokeKbsCredentials<T>(body: Record<string, unknown>): Promise<ApiResult<T>> {
  const token = await getAccessToken();
  if (!token) return { ok: false, error: { code: 'AUTH', message: 'Oturum gerekli' } };

  let data: unknown;
  let error: unknown;
  try {
    const invoked = await invokeSupabaseEdgeFunction(FN, {
      body,
      headers: { Authorization: `Bearer ${token}` },
    });
    data = invoked.data;
    error = invoked.error;
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'TIMEOUT',
        message: e instanceof Error ? e.message : String(e),
      },
    };
  }

  return edgeInvokeToApiResult<T>({ data, error, deployHint: DEPLOY_HINT });
}

/** VPS köprüsü olmadan KBS kimlik okuma/yazma (Supabase Edge). */
export async function kbsAdminCredentialsGet(): Promise<ApiResult<KbsSettingsRow | null>> {
  return invokeKbsCredentials<KbsSettingsRow | null>({ action: 'get' });
}

/** Jandarma KBS SOAP testi — VPS köprüsü (ops-proxy) gerekmez. */
export async function kbsAdminCredentialsTestConnection(): Promise<
  ApiResult<{ message: string; via?: string }>
> {
  return invokeKbsCredentials<{ message: string; via?: string }>({ action: 'test_connection' });
}

export async function kbsAdminCredentialsSave(payload: {
  facilityCode: string;
  username: string;
  password?: string;
  apiKey?: string;
  providerType: string;
  isActive: boolean;
}): Promise<ApiResult<{ saved: boolean }>> {
  return invokeKbsCredentials<{ saved: boolean }>({ action: 'save', payload });
}
