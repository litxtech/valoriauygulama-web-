import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type StaffCaller = {
  id: string;
  organization_id: string | null;
  role: string;
  full_name: string | null;
};

export async function resolveStaffCaller(
  admin: SupabaseClient,
  token: string,
  anonKey: string,
  supabaseUrl: string
): Promise<{ staff: StaffCaller } | { error: string; status: number }> {
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) return { error: "Oturum geçersiz", status: 401 };

  const { data: staffRow } = await admin
    .from("staff")
    .select("id, organization_id, role, full_name, is_active, deleted_at")
    .eq("auth_id", user.id)
    .maybeSingle();

  if (!staffRow?.id || staffRow.deleted_at || staffRow.is_active === false) {
    return { error: "Personel kaydı bulunamadı", status: 403 };
  }
  if (!staffRow.organization_id && staffRow.role !== "admin") {
    return { error: "Otel (organization) atanmamış", status: 400 };
  }

  return {
    staff: {
      id: staffRow.id,
      organization_id: staffRow.organization_id,
      role: staffRow.role,
      full_name: staffRow.full_name,
    },
  };
}

export { paymentQrStandOpenUrl } from "../_shared/paymentLinkPage.ts";
