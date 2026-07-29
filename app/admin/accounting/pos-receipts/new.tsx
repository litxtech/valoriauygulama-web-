import { View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { PosReceiptInvoiceEditor } from '@/components/admin/PosReceiptInvoiceEditor';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { useAuthStore } from '@/stores/authStore';
import type { PosVenueScope } from '@/lib/posReceiptInvoice/types';

export default function NewPosReceiptInvoice() {
  const router = useRouter();
  const params = useLocalSearchParams<{ venue?: string }>();
  const me = useAuthStore((s) => s.staff);
  const selectedOrganizationId = useAdminOrgStore((s) => s.selectedOrganizationId);
  const canUseAll = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const orgId = canUseAll ? selectedOrganizationId : me?.organization_id ?? null;
  const venueScope: PosVenueScope = params.venue === 'restaurant' ? 'restaurant' : 'hotel';

  if (!orgId || orgId === 'all') {
    return (
      <View style={styles.root}>
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={me?.organization_id} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={me?.organization_id} />
      <PosReceiptInvoiceEditor
        organizationId={orgId}
        createdByStaffId={me?.id}
        initial={{ venueScope }}
        onSaved={() => {
          router.replace({
            pathname: '/admin/accounting/pos-receipts',
            params: { venue: venueScope },
          });
        }}
        onCancel={() => router.back()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
});
