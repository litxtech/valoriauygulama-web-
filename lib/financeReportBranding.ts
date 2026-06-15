import { supabase } from '@/lib/supabase';

/** PDF başlığında işletme adı yoksa */
export const DEFAULT_FINANCE_DOCUMENT_BRAND = 'Valoria Hotel';

export type FinanceReportBranding = {
  organizationName: string;
  /** PDF / yazdır üst satır (büyük marka) */
  documentBrandTitle: string;
};

/**
 * Belge başlığı: finance_report_brand → işletme adı → varsayılan.
 * Alt satırda tesis adı her zaman organizations.name ile uyumludur.
 */
export function resolveFinanceReportBranding(opts?: {
  organizationName?: string | null;
  financeReportBrand?: string | null;
}): FinanceReportBranding {
  const organizationName = opts?.organizationName?.trim() || DEFAULT_FINANCE_DOCUMENT_BRAND;
  const documentBrandTitle = opts?.financeReportBrand?.trim() || organizationName;
  return { organizationName, documentBrandTitle };
}

export function footerOptsFromOrganization(
  org?: { name?: string | null; finance_report_brand?: string | null } | null
) {
  return {
    organizationName: org?.name,
    financeReportBrand: org?.finance_report_brand,
  };
}

export async function fetchFinanceReportBranding(organizationId: string): Promise<FinanceReportBranding> {
  const { data } = await supabase
    .from('organizations')
    .select('name, finance_report_brand')
    .eq('id', organizationId)
    .maybeSingle();
  return resolveFinanceReportBranding({
    organizationName: data?.name,
    financeReportBrand: (data as { finance_report_brand?: string | null } | null)?.finance_report_brand,
  });
}
