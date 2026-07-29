import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import { PosReceiptInvoiceEditor } from '@/components/admin/PosReceiptInvoiceEditor';
import {
  deletePosReceiptInvoice,
  getPosReceiptInvoice,
  markPosReceiptInvoiced,
  updatePosReceiptStatus,
  type SavePosReceiptInput,
} from '@/lib/posReceiptInvoice/api';
import { useAuthStore } from '@/stores/authStore';

export default function PosReceiptInvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const isAdmin = me?.app_permissions?.super_admin === true || me?.role === 'admin';
  const [loading, setLoading] = useState(true);
  const [organizationId, setOrganizationId] = useState('');
  const [status, setStatus] = useState<string>('draft');
  const [initial, setInitial] = useState<(Partial<SavePosReceiptInput> & { id: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await getPosReceiptInvoice(id);
    if (res.error || !res.row) {
      setError(res.error ?? 'Kayıt bulunamadı');
      setInitial(null);
    } else {
      const r = res.row;
      setOrganizationId(r.organization_id);
      setStatus(r.status);
      setInitial({
        id: r.id,
        existingReceiptUrls: r.receipt_urls,
        receiptNo: r.receipt_no ?? '',
        merchantName: r.merchant_name ?? '',
        merchantTaxId: r.merchant_tax_id ?? '',
        buyerName: r.buyer_name ?? '',
        receiptDate: r.receipt_date ?? '',
        receiptTime: r.receipt_time ?? '',
        invoiceDueOn: r.invoice_due_on ?? '',
        paidBy: r.paid_by ?? '',
        paymentBank: r.payment_bank ?? '',
        paymentMethod: r.payment_method ?? '',
        paymentReceivedOn: r.payment_received_on ?? '',
        cardLast4: r.card_last4 ?? '',
        receiptTotal: r.receipt_total,
        lineItems: r.line_items,
        venueScope: r.venue_scope,
        relatedOrders: r.related_order_ids,
        relatedWaybills: r.related_waybill_ids,
        extraFields: r.extra_fields,
        kdvExemptionReason: r.kdv_exemption_reason ?? '',
        descriptionNote: r.description_note ?? '',
        ocrRawText: r.ocr_raw_text ?? '',
        ocrConfidence: r.ocr_confidence ?? '',
        ocrWarnings: r.ocr_warnings,
        status: r.status,
      });
      setError(null);
    }
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const locked = status === 'invoiced' || status === 'cancelled';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (error || !initial) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>{error ?? 'Kayıt yok'}</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        {status === 'draft' || status === 'ready' ? (
          <TouchableOpacity
            style={styles.markBtn}
            disabled={marking}
            onPress={() => {
              Alert.alert('Fatura kesildi', 'Bu fiş fatura kesildi olarak işaretlensin mi?', [
                { text: 'İptal', style: 'cancel' },
                {
                  text: 'Evet',
                  onPress: () => {
                    void (async () => {
                      setMarking(true);
                      const res = await markPosReceiptInvoiced(initial.id);
                      setMarking(false);
                      if (res.error) Alert.alert('Hata', res.error);
                      else {
                        setStatus('invoiced');
                        setInitial({ ...initial, status: 'invoiced' });
                        Alert.alert('Tamam', 'Fatura kesildi olarak işaretlendi.');
                      }
                    })();
                  },
                },
              ]);
            }}
          >
            {marking ? (
              <ActivityIndicator size="small" color="#15803d" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                <Text style={styles.markText}>Fatura kesildi</Text>
              </>
            )}
          </TouchableOpacity>
        ) : status === 'invoiced' ? (
          <TouchableOpacity
            style={styles.reopenBtn}
            onPress={() => {
              void (async () => {
                const res = await updatePosReceiptStatus(initial.id, 'ready');
                if (res.error) Alert.alert('Hata', res.error);
                else {
                  setStatus('ready');
                  setInitial({ ...initial, status: 'ready' });
                }
              })();
            }}
          >
            <Ionicons name="refresh-outline" size={16} color="#0369a1" />
            <Text style={styles.reopenText}>Geri al</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.donePill}>
            <Ionicons name="close-circle" size={16} color="#94a3b8" />
            <Text style={styles.cancelledText}>İptal edildi</Text>
          </View>
        )}

        {!locked ? (
          <TouchableOpacity
            style={styles.cancelBtn}
            disabled={cancelling}
            onPress={() => {
              Alert.alert('Fişi iptal et', 'Bu fiş listeden kaldırılır (iptal).', [
                { text: 'Vazgeç', style: 'cancel' },
                {
                  text: 'İptal et',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      setCancelling(true);
                      const res = await updatePosReceiptStatus(initial.id, 'cancelled');
                      setCancelling(false);
                      if (res.error) Alert.alert('Hata', res.error);
                      else
                        router.replace({
                          pathname: '/admin/accounting/pos-receipts',
                          params: {
                            venue:
                              initial.venueScope === 'restaurant' ? 'restaurant' : 'hotel',
                          },
                        });
                    })();
                  },
                },
              ]);
            }}
          >
            <Text style={styles.cancelText}>İptal et</Text>
          </TouchableOpacity>
        ) : null}

        {isAdmin ? (
          <TouchableOpacity
            style={styles.delBtn}
            onPress={() => {
              Alert.alert('Sil', 'Bu fiş kaydı kalıcı olarak silinsin mi?', [
                { text: 'Vazgeç', style: 'cancel' },
                {
                  text: 'Sil',
                  style: 'destructive',
                  onPress: () => {
                    void (async () => {
                      const res = await deletePosReceiptInvoice(initial.id);
                      if (res.error) Alert.alert('Hata', res.error);
                      else
                        router.replace({
                          pathname: '/admin/accounting/pos-receipts',
                          params: {
                            venue:
                              initial.venueScope === 'restaurant' ? 'restaurant' : 'hotel',
                          },
                        });
                    })();
                  },
                },
              ]);
            }}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
          </TouchableOpacity>
        ) : null}
      </View>
      <PosReceiptInvoiceEditor
        organizationId={organizationId || me?.organization_id || ''}
        createdByStaffId={me?.id}
        initial={initial}
        readOnly={locked}
        onSaved={() => {
          Alert.alert('Güncellendi', 'Fiş kaydı kaydedildi.');
          void load();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  err: { color: '#b91c1c' },
  toolbar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  markBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#dcfce7',
    borderRadius: 10,
  },
  reopenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#e0f2fe',
    borderRadius: 10,
  },
  reopenText: { color: '#0369a1', fontWeight: '700' },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f1f5f9',
    borderRadius: 10,
  },
  markText: { color: '#15803d', fontWeight: '700' },
  cancelledText: { color: '#64748b', fontWeight: '700' },
  cancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
  },
  cancelText: { color: '#b91c1c', fontWeight: '700' },
  delBtn: { padding: 8 },
});
