import { supabase } from '@/lib/supabase';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';

export type PaymentReceiptAdminContact = {
  id: string;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  role: string | null;
};

const ADMIN_ROLES = new Set(['admin', 'owner']);

function isReceiptAdminRole(role: string | null | undefined): boolean {
  return ADMIN_ROLES.has((role ?? '').trim().toLowerCase());
}

/** Ödeme fişi iletilebilecek tüm admin / owner hesapları. */
export async function listPaymentReceiptAdminStaff(): Promise<PaymentReceiptAdminContact[]> {
  const { data: rpcData } = await supabase.rpc('messaging_list_staff_for_guest');
  const rows = (Array.isArray(rpcData) ? rpcData : rpcData ? [rpcData] : []) as PaymentReceiptAdminContact[];

  const admins = rows.filter((r) => isReceiptAdminRole(r.role));
  return sortStaffAdminFirst(admins, (a, b) =>
    (a.full_name ?? '').localeCompare(b.full_name ?? '', 'tr')
  );
}
