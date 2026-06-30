import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { getEdgeFunctionErrorMessage, parseEdgeFunctionErrorBody } from '@/lib/functionsError';
import {
  isSupabaseUnavailableError,
  sanitizeSupabaseErrorMessage,
  sleepMs,
  withTimeout,
} from '@/lib/supabaseTransientErrors';
import { staffTipText, type StaffTipPaymentMethod, type StaffTipStatus, mapGuestTipEdgeError, staffTipLang } from '@/lib/staffTipsI18n';
import type { AdminGuestAccountSummary } from '@/lib/adminGuestAccountSummary';

export type StaffTipRow = {
  id: string;
  guest_id: string;
  staff_id: string;
  organization_id: string | null;
  amount: number;
  currency: string;
  payment_method: StaffTipPaymentMethod;
  note: string | null;
  room_number: string | null;
  status: StaffTipStatus;
  confirmed_at: string | null;
  refunded_at?: string | null;
  stripe_refund_id?: string | null;
  payment_request_id?: string | null;
  thank_you_message?: string | null;
  thank_you_at?: string | null;
  created_at: string;
  staff?: {
    full_name: string | null;
    profile_image?: string | null;
    department?: string | null;
    position?: string | null;
  } | null;
  guest?: AdminGuestAccountSummary | null;
};

const TIP_REQUEST_TIMEOUT_MS = 15_000;
const TIP_MAX_ATTEMPTS = 4;

function isTipTransientError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    isSupabaseUnavailableError(message) ||
    /522|523|502|504|edge function|send-expo-push|notify-admins|non-2xx|server_unavailable|supabase_unavailable|timed out/i.test(
      m
    )
  );
}

function isGuestNotFoundError(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('misafir oturumu') || m.includes('oturum yok') || m.includes('giriş yap');
}

function mapTipError(message: string): string {
  const lower = message.toLowerCase();
  if (isTipTransientError(message)) return staffTipText('tipErrorUnavailable');
  if (lower.includes('could not find the function') && lower.includes('create_guest_staff_tip')) {
    return staffTipText('tipErrorNotDeployed');
  }
  if (isGuestNotFoundError(message)) return staffTipText('tipErrorLogin');
  if (
    lower.includes('bahşiş gönderilemez') ||
    lower.includes('tips_disabled') ||
    lower.includes('not accepted for this staff')
  ) {
    return staffTipText('tipErrorBlocked');
  }
  if (lower.includes('row-level security') || lower.includes('permission denied')) {
    return staffTipText('tipErrorLogin');
  }
  return sanitizeSupabaseErrorMessage(message) || staffTipText('tipErrorGeneric');
}

function newTipId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function ensureGuestSessionUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new Error(staffTipText('tipErrorLogin'));
  return uid;
}

async function resolveGuestId(authUserId: string): Promise<string> {
  const { data, error } = await supabase
    .from('guests')
    .select('id')
    .eq('auth_user_id', authUserId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && !isTipTransientError(error.message)) {
    throw new Error(mapTipError(error.message));
  }
  if (data?.id) return data.id;

  const row = await getOrCreateGuestForCurrentSession();
  if (!row?.guest_id) throw new Error(staffTipText('tipErrorLogin'));
  return row.guest_id;
}

/** PostgREST return=minimal — RETURNING/SELECT RLS yok, Edge yok. */
async function insertStaffTipReturnMinimal(body: {
  id: string;
  guest_id: string;
  staff_id: string;
  amount: number;
  payment_method: StaffTipPaymentMethod;
  note: string | null;
}): Promise<{ error: { message: string } | null }> {
  if (!supabaseUrl) return { error: { message: 'Supabase URL yok' } };
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) return { error: { message: staffTipText('tipErrorLogin') } };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/staff_tips`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${accessToken}`,
        Prefer: 'return=minimal',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let message = res.statusText;
      try {
        const j = (await res.json()) as { message?: string; error?: string; details?: string };
        message = j.message || j.error || j.details || message;
      } catch {
        const t = await res.text();
        if (t) message = t.slice(0, 400);
      }
      return { error: { message } };
    }
    return { error: null };
  } catch (e) {
    return { error: { message: (e as Error).message ?? 'Ağ hatası' } };
  }
}

async function createStaffTipDirect(params: {
  guestId: string;
  staffId: string;
  amount: number;
  paymentMethod: StaffTipPaymentMethod;
  note?: string;
}): Promise<string> {
  const tipId = newTipId();
  const { error } = await withTimeout(
    insertStaffTipReturnMinimal({
      id: tipId,
      guest_id: params.guestId,
      staff_id: params.staffId,
      amount: params.amount,
      payment_method: params.paymentMethod,
      note: params.note?.trim() || null,
    }),
    TIP_REQUEST_TIMEOUT_MS,
    'staff_tips insert'
  );
  if (error) throw new Error(error.message);
  return tipId;
}

async function createStaffTipRpc(params: {
  staffId: string;
  amount: number;
  paymentMethod: StaffTipPaymentMethod;
  note?: string;
}): Promise<string> {
  const { data, error } = await withTimeout(
    supabase.rpc('create_guest_staff_tip', {
      p_app_token: '',
      p_staff_id: params.staffId,
      p_amount: params.amount,
      p_payment_method: params.paymentMethod,
      p_note: params.note?.trim() || null,
    }),
    TIP_REQUEST_TIMEOUT_MS,
    'create_guest_staff_tip'
  );
  if (error) throw new Error(error.message || staffTipText('tipErrorGeneric'));
  if (!data) throw new Error(staffTipText('tipErrorGeneric'));
  return String(data);
}

async function createStaffTipOnce(params: {
  guestId: string;
  staffId: string;
  amount: number;
  paymentMethod: StaffTipPaymentMethod;
  note?: string;
}): Promise<string> {
  try {
    return await createStaffTipDirect(params);
  } catch (directErr) {
    const directMsg = (directErr as Error)?.message ?? '';
    if (!isTipTransientError(directMsg) && !directMsg.toLowerCase().includes('row-level security')) {
      throw directErr;
    }
    return createStaffTipRpc({
      staffId: params.staffId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      note: params.note,
    });
  }
}

async function createStaffTipWithRetry(params: {
  guestId: string;
  staffId: string;
  amount: number;
  paymentMethod: StaffTipPaymentMethod;
  note?: string;
}): Promise<string> {
  let lastMessage = staffTipText('tipErrorGeneric');
  for (let attempt = 0; attempt < TIP_MAX_ATTEMPTS; attempt++) {
    try {
      return await createStaffTipOnce(params);
    } catch (e) {
      lastMessage = (e as Error)?.message ?? lastMessage;
      if (attempt < TIP_MAX_ATTEMPTS - 1 && isTipTransientError(lastMessage)) {
        await sleepMs(1500 * (attempt + 1));
        continue;
      }
      throw new Error(mapTipError(lastMessage));
    }
  }
  throw new Error(mapTipError(lastMessage));
}

export async function createGuestStaffTip(params: {
  staffId: string;
  staffName: string;
  amount: number;
  paymentMethod: StaffTipPaymentMethod;
  note?: string;
  guestName?: string;
  roomNumber?: string | null;
}): Promise<string> {
  const authUserId = await ensureGuestSessionUserId();
  let guestId = await resolveGuestId(authUserId);

  try {
    return await createStaffTipWithRetry({
      guestId,
      staffId: params.staffId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      note: params.note,
    });
  } catch (e) {
    const msg = (e as Error)?.message ?? '';
    if (!isGuestNotFoundError(msg) && msg !== staffTipText('tipErrorLogin')) {
      throw e;
    }
    const row = await getOrCreateGuestForCurrentSession();
    if (!row?.guest_id) throw e;
    guestId = row.guest_id;
    return createStaffTipWithRetry({
      guestId,
      staffId: params.staffId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      note: params.note,
    });
  }
}

/** Bahşiş geçmişinde yalnızca ödemesi tamamlanmış kayıtlar */
export function isPaidStaffTip(row: Pick<StaffTipRow, 'status' | 'confirmed_at'>): boolean {
  return row.status === 'confirmed' && row.confirmed_at != null;
}

export async function fetchMyStaffTips(): Promise<StaffTipRow[]> {
  const { data, error } = await supabase
    .from('staff_tips')
    .select(
      'id, guest_id, staff_id, organization_id, amount, currency, payment_method, note, room_number, status, confirmed_at, refunded_at, stripe_refund_id, payment_request_id, thank_you_message, thank_you_at, created_at, staff:staff_id(full_name, profile_image, department, position), guest:guest_id(full_name)'
    )
    .eq('status', 'confirmed')
    .not('confirmed_at', 'is', null)
    .order('confirmed_at', { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  return ((data ?? []) as StaffTipRow[]).filter(isPaidStaffTip);
}

export async function fetchStaffTipsReceived(): Promise<StaffTipRow[]> {
  const { data, error } = await supabase
    .from('staff_tips')
    .select('id, guest_id, staff_id, organization_id, amount, currency, payment_method, note, room_number, status, confirmed_at, thank_you_message, thank_you_at, created_at, guest:guest_id(full_name)')
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffTipRow[];
}

const ADMIN_GUEST_SELECT =
  'id, full_name, phone, email, status, id_number, check_in_at, check_out_at, created_at, auth_user_id, is_guest_app_account, rooms:room_id(room_number)';

export async function fetchAdminStaffTips(statusFilter: StaffTipStatus | 'all' = 'all'): Promise<StaffTipRow[]> {
  let query = supabase
    .from('staff_tips')
    .select(
      `id, guest_id, staff_id, organization_id, amount, currency, payment_method, note, room_number, status, confirmed_at, refunded_at, stripe_refund_id, payment_request_id, thank_you_message, thank_you_at, created_at, staff:staff_id(full_name), guest:guest_id(${ADMIN_GUEST_SELECT})`
    )
    .order('created_at', { ascending: false })
    .limit(120);

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as StaffTipRow[];
}

export async function fetchStaffTipByPaymentRequest(paymentRequestId: string): Promise<StaffTipRow | null> {
  const { data: pr, error: prErr } = await supabase
    .from('payment_requests')
    .select('reference_type, reference_id')
    .eq('id', paymentRequestId)
    .maybeSingle();
  if (prErr || !pr || pr.reference_type !== 'staff_tip' || !pr.reference_id) return null;

  const { data, error } = await supabase
    .from('staff_tips')
    .select(
      'id, guest_id, staff_id, organization_id, amount, currency, payment_method, note, room_number, status, confirmed_at, thank_you_message, thank_you_at, created_at, staff:staff_id(full_name)'
    )
    .eq('id', pr.reference_id)
    .maybeSingle();
  if (error || !data) return null;
  return data as StaffTipRow;
}

export async function sendStaffTipThankYou(tipId: string, message: string): Promise<void> {
  const { error } = await supabase.rpc('send_staff_tip_thank_you', {
    p_tip_id: tipId,
    p_message: message.trim(),
  });
  if (error) {
    const msg = error.message ?? '';
    if (msg.includes('ALREADY_THANKED')) throw new Error(staffTipText('tipThankYouAlreadySent'));
    if (msg.includes('UNAUTHORIZED')) throw new Error(staffTipText('tipErrorThankYouUnauthorized'));
    if (msg.includes('TIP_NOT_FOUND')) throw new Error(staffTipText('tipErrorThankYouNotFound'));
    if (msg.includes('INVALID_MESSAGE')) throw new Error(staffTipText('tipErrorThankYouInvalid'));
    throw new Error(msg.trim() || staffTipText('tipErrorThankYouGeneric'));
  }
}

export async function confirmStaffTip(tipId: string, status: 'confirmed' | 'cancelled' = 'confirmed'): Promise<void> {
  const { error } = await supabase.rpc('confirm_staff_tip', { p_tip_id: tipId, p_status: status });
  if (error) throw new Error(error.message);
}

/** Misafir — Stripe/ödeme yarım kaldıysa bekleyen bahşişi iptal et (geçmişte görünmez) */
export async function cancelGuestStaffTipIfPending(tipId: string): Promise<void> {
  const status = await fetchStaffTipStatus(tipId);
  if (status !== 'pending') return;
  const { error } = await supabase.rpc('cancel_guest_staff_tip', { p_tip_id: tipId });
  if (error) {
    const msg = (error.message ?? '').toLowerCase();
    if (msg.includes('could not find the function') || msg.includes('cancel_guest_staff_tip')) return;
    throw new Error(error.message);
  }
}

export async function refundStaffTip(tipId: string): Promise<void> {
  const { data, error } = await invokeEdgeWithAuth('refund-staff-tip', { tip_id: tipId });
  if (error) {
    const parsed = await parseEdgeFunctionErrorBody(error);
    const msg = parsed?.message ?? (await getEdgeFunctionErrorMessage(error));
    throw new Error(msg || 'İade işlemi başarısız');
  }
  const payload = data as { error?: string; error_code?: string; ok?: boolean };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.ok) throw new Error('İade işlemi başarısız');
}

export async function acceptStaffTipPayment(params: {
  tipId?: string;
  paymentRequestId?: string;
}): Promise<void> {
  const { data, error } = await invokeEdgeWithAuth('accept-staff-tip-payment', {
    tip_id: params.tipId ?? null,
    payment_request_id: params.paymentRequestId ?? null,
  });
  if (error) {
    const parsed = await parseEdgeFunctionErrorBody(error);
    const msg = parsed?.message ?? (await getEdgeFunctionErrorMessage(error));
    throw new Error(msg || 'Ödeme kabul edilemedi');
  }
  const payload = data as { error?: string; ok?: boolean };
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.ok) throw new Error('Ödeme kabul edilemedi');
}

export function subscribeMyStaffTips(onChange: () => void): () => void {
  const channel = supabase
    .channel('guest_my_staff_tips')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'staff_tips' }, () => onChange())
    .subscribe();

  const poll = setInterval(() => onChange(), 30_000);

  return () => {
    clearInterval(poll);
    void supabase.removeChannel(channel);
  };
}

export type GuestStaffTipStripeResult = {
  tipId: string;
  paymentRequestId: string;
  payUrl: string;
  amount: number;
  currency: string;
};

export async function createGuestStaffTipStripePayment(params: {
  staffId: string;
  amount: number;
  currency?: string;
  note?: string;
}): Promise<GuestStaffTipStripeResult> {
  await getOrCreateGuestForCurrentSession();

  const { data, error } = await invokeEdgeWithAuth('create-guest-tip-payment', {
    staff_id: params.staffId,
    amount: params.amount,
    currency: params.currency ?? 'try',
    note: params.note?.trim() || null,
    lang: staffTipLang(),
  });

  if (error) {
    const parsed = await parseEdgeFunctionErrorBody(error);
    const msg = parsed?.message ?? (await getEdgeFunctionErrorMessage(error));
    if (/stripe|STRIPE_SECRET/i.test(msg)) throw new Error(staffTipText('tipErrorPay'));
    throw new Error(mapGuestTipEdgeError({ error: msg, error_code: parsed?.code }));
  }

  const payload = data as {
    tip_id?: string;
    payment_request_id?: string;
    public_token?: string;
    open_url?: string;
    pay_url?: string;
    amount?: number;
    currency?: string;
    error?: string;
    error_code?: string;
  };

  if (payload?.error_code || payload?.error) {
    throw new Error(mapGuestTipEdgeError(payload));
  }
  if (!payload?.tip_id || !payload?.pay_url) {
    throw new Error(staffTipText('tipErrorGeneric'));
  }

  const payUrl = payload.pay_url?.trim() || '';
  if (!payUrl) {
    throw new Error(staffTipText('tipErrorGeneric'));
  }

  return {
    tipId: payload.tip_id,
    paymentRequestId: payload.payment_request_id ?? '',
    payUrl,
    amount: Number(payload.amount ?? params.amount),
    currency: payload.currency ?? params.currency ?? 'try',
  };
}

export async function fetchStaffTipStatus(tipId: string): Promise<StaffTipStatus | null> {
  const { data, error } = await supabase.from('staff_tips').select('status').eq('id', tipId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.status as StaffTipStatus | undefined) ?? null;
}

export function waitForStaffTipPaid(
  tipId: string,
  timeoutMs = 180_000
): { promise: Promise<void>; cancel: () => void } {
  let settled = false;
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let timeoutTimer: ReturnType<typeof setTimeout> | undefined;

  const cleanup = () => {
    if (pollTimer) clearInterval(pollTimer);
    if (timeoutTimer) clearTimeout(timeoutTimer);
    pollTimer = undefined;
    timeoutTimer = undefined;
    void supabase.removeChannel(channel);
  };

  const channel = supabase.channel(`staff_tip_pay_${tipId}`);

  const cancel = () => {
    if (settled) return;
    settled = true;
    cleanup();
  };

  const promise = new Promise<void>((resolve, reject) => {
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    channel
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'staff_tips', filter: `id=eq.${tipId}` },
        (payload) => {
          const status = (payload.new as { status?: StaffTipStatus }).status;
          if (status === 'confirmed') finish(resolve);
          if (status === 'cancelled') finish(() => reject(new Error(staffTipText('tipPayCancelled'))));
        }
      )
      .subscribe();

    pollTimer = setInterval(() => {
      void fetchStaffTipStatus(tipId)
        .then((status) => {
          if (status === 'confirmed') finish(resolve);
          if (status === 'cancelled') finish(() => reject(new Error(staffTipText('tipPayCancelled'))));
        })
        .catch(() => {});
    }, 2500);

    // Webhook gecikse bile misafire hata göstermeyiz; ödeme dönüş ekranı / geçmiş yeterli.
    timeoutTimer = setTimeout(() => {
      finish(resolve);
    }, timeoutMs);
  });

  return { promise, cancel };
}
