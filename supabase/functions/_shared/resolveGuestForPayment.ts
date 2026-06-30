import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type ResolvedGuestForPayment = {
  id: string;
  full_name: string | null;
  organization_id: string | null;
  email: string | null;
  room_id?: string | null;
  rooms?: { room_number?: string | number | null } | null;
};

const GUEST_SELECT =
  "id, full_name, organization_id, email, room_id, rooms(room_number)";

export async function resolveGuestForPayment(
  admin: SupabaseClient,
  userClient: SupabaseClient | null,
  userId: string,
): Promise<ResolvedGuestForPayment | null> {
  const { data: guestRows } = await admin
    .from("guests")
    .select(GUEST_SELECT)
    .eq("auth_user_id", userId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const existing = guestRows?.[0] as ResolvedGuestForPayment | undefined;
  if (existing?.id) return existing;

  if (!userClient) return null;

  const { data: rpcRows, error: rpcErr } = await userClient.rpc("get_or_create_guest_for_caller", {
    p_full_name: null,
    p_device_install_id: null,
  });

  if (rpcErr) return null;

  const guestId = (Array.isArray(rpcRows) ? rpcRows[0] : null)?.guest_id as string | undefined;
  if (!guestId) return null;

  const { data: fresh } = await admin
    .from("guests")
    .select(GUEST_SELECT)
    .eq("id", guestId)
    .maybeSingle();

  return (fresh as ResolvedGuestForPayment | null) ?? null;
}

export function stripeCustomerEmailFromGuest(
  guest: { email?: string | null } | null | undefined,
): string | undefined {
  const email = (guest?.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
  return email;
}
