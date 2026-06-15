import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/supabaseTransientErrors';
import type { ManagedContractType } from '@/lib/managedContracts/constants';
import type { PartyFormState } from '@/components/contracts/PartyFormFields';

const INVOKE_TIMEOUT_MS = 58_000;

export type GeneratedManagedContract = {
  title?: string;
  contractType?: ManagedContractType;
  startDate?: string | null;
  endDate?: string | null;
  bodyText?: string;
  specialClauses?: string | null;
  party1?: Partial<PartyFormState> | null;
  party2?: Partial<PartyFormState> | null;
};

export type GenerateManagedContractContext = {
  title?: string;
  startDate?: string;
  endDate?: string;
  bodyText?: string;
  specialClauses?: string;
  party1?: PartyFormState;
  party2?: PartyFormState;
  organizationName?: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Oturum gerekli — AI sözleşme için giriş yapın');
  }
  return { Authorization: `Bearer ${token}` };
}

export async function generateManagedContractWithAi(input: {
  prompt: string;
  organizationId: string;
  contractType: ManagedContractType;
  context?: GenerateManagedContractContext;
}): Promise<GeneratedManagedContract> {
  const prompt = input.prompt.trim();
  if (!prompt) {
    throw new Error('Lütfen sözleşme talebinizi yazın');
  }

  const headers = await authHeaders();
  const { data, error } = await withTimeout(
    supabase.functions.invoke('generate-managed-contract', {
      body: {
        prompt,
        organizationId: input.organizationId,
        contractType: input.contractType,
        context: input.context ?? {},
      },
      headers,
    }),
    INVOKE_TIMEOUT_MS,
    'generate-managed-contract',
  );

  const payload = (data ?? {}) as {
    contract?: GeneratedManagedContract;
    error?: string;
  };

  if (payload.contract?.bodyText?.trim()) {
    return payload.contract;
  }

  if (error) {
    const ctx = error as { message?: string; context?: { json?: () => Promise<unknown> } };
    let detail = payload?.error || ctx.message || 'AI sözleşme isteği başarısız';
    try {
      const body = await ctx.context?.json?.();
      if (body && typeof body === 'object' && 'error' in body) {
        detail = String((body as { error?: string }).error ?? detail);
      }
    } catch {
      // ignore
    }
    throw new Error(detail);
  }

  if (payload?.error) throw new Error(payload.error);
  throw new Error('AI sözleşme metni üretemedi');
}

export function mergePartyForm(base: PartyFormState, patch?: Partial<PartyFormState> | null): PartyFormState {
  if (!patch) return base;
  return {
    role: patch.role?.trim() ? patch.role : base.role,
    company: patch.company?.trim() ? patch.company : base.company,
    fullName: patch.fullName?.trim() ? patch.fullName : base.fullName,
    authorityTitle: patch.authorityTitle?.trim() ? patch.authorityTitle : base.authorityTitle,
    taxOrId: patch.taxOrId?.trim() ? patch.taxOrId : base.taxOrId,
    phone: patch.phone?.trim() ? patch.phone : base.phone,
    email: patch.email?.trim() ? patch.email : base.email,
    address: patch.address?.trim() ? patch.address : base.address,
  };
}
