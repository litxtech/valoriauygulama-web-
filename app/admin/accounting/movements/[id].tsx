import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { FinanceMovementReceiptActions } from '@/components/admin/FinanceMovementReceiptActions';
import {
  prepareFinanceMovementReceiptInput,
  type FinanceMovementReceiptInput,
} from '@/lib/financeMovementReceiptPdf';
import { expenseReceiptPreviewStyle } from '@/lib/expenseReceiptPreviewStyles';
import {
  fmtMoneyTry,
  MOVEMENT_KIND_LABELS,
  MOVEMENT_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  movementSummaryLine,
  type FinanceMovementKind,
  type MovementPaymentMethod,
} from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';
import { invalidateCounterpartyBalanceCache } from '@/lib/financeCounterpartyBalances';
import { LEDGER_SCOPE_LABELS, type FinanceLedgerScope } from '@/lib/financeLedger';

type Row = {
  id: string;
  organization_id: string;
  counterparty_id: string | null;
  kind: FinanceMovementKind;
  amount: number;
  movement_date: string;
  payment_method: MovementPaymentMethod;
  category: string;
  counterparty_name: string | null;
  description: string;
  receipt_urls: string[] | null;
  created_at: string;
  counterparty?: { name: string } | null;
  guest?: { full_name: string | null } | null;
  project?: { name: string } | null;
  creator?: { full_name: string | null } | null;
  source_payment_request_id?: string | null;
};

export default function AccountingMovementDetail() {
  const { id, returnCounterpartyId } = useLocalSearchParams<{
    id: string;
    returnCounterpartyId?: string;
  }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const selectedOrg = useAdminOrgStore((s) =>
    s.organizations.find((o) => o.id === (s.selectedOrganizationId !== 'all' ? s.selectedOrganizationId : me?.organization_id))
  );
  const [row, setRow] = useState<Row | null>(null);
  const [receiptInput, setReceiptInput] = useState<FinanceMovementReceiptInput | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (!row) {
      setReceiptInput(null);
      return;
    }
    let cancelled = false;
    prepareFinanceMovementReceiptInput(row, selectedOrg).then((input) => {
      if (!cancelled) setReceiptInput(input);
    });
    return () => {
      cancelled = true;
    };
  }, [row, selectedOrg?.name]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const selectBase = `
        id,
        organization_id,
        counterparty_id,
        kind,
        amount,
        movement_date,
        payment_method,
        category,
        counterparty_name,
        description,
        receipt_urls,
        created_at,
        counterparty:counterparty_id(name, phone, party_type, profile_image),
        guest:guest_id(full_name),
        project:project_id(name),
        creator:created_by_staff_id(full_name),
        source_payment_request_id
      `;
    let { data, error } = await supabase
      .from('finance_movements')
      .select(`${selectBase}, ledger_scope`)
      .eq('id', id)
      .single();
    if (error?.message?.includes('ledger_scope')) {
      const res = await supabase.from('finance_movements').select(selectBase).eq('id', id).single();
      data = res.data;
      error = res.error;
    }
    if (error || !data) setRow(null);
    else
      setRow({
        ...(data as object),
        ledger_scope: (data as { ledger_scope?: FinanceLedgerScope }).ledger_scope ?? 'hotel',
      } as Row);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const goBackAfterDelete = () => {
    const cpId = returnCounterpartyId || row?.counterparty_id;
    if (cpId) {
      router.replace({
        pathname: '/admin/accounting/counterparties/[id]',
        params: { id: cpId },
      } as never);
      return;
    }
    router.replace('/admin/accounting/movements' as never);
  };

  const deleteRow = () => {
    Alert.alert('Sil', 'Bu ödeme / tahsilat kaydı silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const org = row?.organization_id;
          const { error } = await supabase.from('finance_movements').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else {
            if (org) invalidateCounterpartyBalanceCache(org);
            goBackAfterDelete();
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Kayıt bulunamadı.</Text>
      </View>
    );
  }

  const who =
    row.guest?.full_name?.trim() ||
    row.counterparty?.name?.trim() ||
    row.counterparty_name?.trim() ||
    '—';
  const receipts = Array.isArray(row.receipt_urls) ? row.receipt_urls : [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
        <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
        <Text style={styles.backHubText}>Muhasebe</Text>
      </TouchableOpacity>

      <AdminCard>
        <View style={styles.kindBannerRow}>
          <View
            style={[
              styles.kindBanner,
              row.kind === 'income' ? styles.kindIncome : styles.kindExpense,
            ]}
          >
            <Text style={styles.kindBannerText}>{MOVEMENT_KIND_LABELS[row.kind]}</Text>
            <Text style={styles.kindAmt}>{fmtMoneyTry(Number(row.amount))}</Text>
          </View>
          <TouchableOpacity style={styles.moreBtn} onPress={() => setMenuVisible(true)} hitSlop={12}>
            <Ionicons name="ellipsis-vertical" size={24} color={adminTheme.colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.summary}>
          {movementSummaryLine({
            kind: row.kind,
            amount: Number(row.amount),
            counterpartyLabel: who,
            category: row.category,
          })}
        </Text>
        <View style={styles.metaGrid}>
          <Text style={styles.metaLabel}>Tarih</Text>
          <Text style={styles.metaVal}>{formatDateShort(row.movement_date)}</Text>
          <Text style={styles.metaLabel}>Ödeme</Text>
          <Text style={styles.metaVal}>
            {row.source_payment_request_id ? 'Kart (Stripe POS)' : PAYMENT_METHOD_LABELS[row.payment_method]}
          </Text>
          <Text style={styles.metaLabel}>Kategori</Text>
          <Text style={styles.metaVal}>{MOVEMENT_CATEGORY_LABELS[row.category] ?? row.category}</Text>
          <Text style={styles.metaLabel}>Kapsam</Text>
          <Text style={styles.metaVal}>
            {LEDGER_SCOPE_LABELS[(row as Row & { ledger_scope?: FinanceLedgerScope }).ledger_scope ?? 'hotel']}
          </Text>
          <Text style={styles.metaLabel}>{row.guest?.full_name ? 'Misafir' : 'Cari'}</Text>
          <Text style={styles.metaVal}>{who}</Text>
          {row.project?.name ? (
            <>
              <Text style={styles.metaLabel}>Proje</Text>
              <Text style={styles.metaVal}>{row.project.name}</Text>
            </>
          ) : null}
          {row.description?.trim() ? (
            <>
              <Text style={styles.metaLabel}>Açıklama</Text>
              <Text style={styles.metaVal}>{row.description.trim()}</Text>
            </>
          ) : null}
          <Text style={styles.metaLabel}>Kayıt</Text>
          <Text style={styles.metaVal}>
            {formatDateShort(row.created_at)}
            {row.creator?.full_name ? ` · ${row.creator.full_name}` : ''}
          </Text>
        </View>
      </AdminCard>

      {receiptInput ? <FinanceMovementReceiptActions input={receiptInput} /> : null}

      {receipts.length > 0 ? (
        <AdminCard>
          <Text style={styles.sectionTitle}>Fiş / belge</Text>
          <View style={styles.thumbs}>
            {receipts.map((url) => (
              <TouchableOpacity key={url} onPress={() => Linking.openURL(url)}>
                <Image source={{ uri: url }} style={styles.thumb} />
              </TouchableOpacity>
            ))}
          </View>
        </AdminCard>
      ) : (
        <AdminCard>
          <Text style={styles.noReceipt}>Fiş eklenmemiş (opsiyonel).</Text>
        </AdminCard>
      )}

      <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuOverlay} onPress={() => setMenuVisible(false)}>
          <Pressable style={styles.menuSheet} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                router.push({
                  pathname: '/admin/accounting/movements/edit',
                  params: {
                    id: row.id,
                    ...(returnCounterpartyId || row.counterparty_id
                      ? { returnCounterpartyId: returnCounterpartyId || row.counterparty_id! }
                      : {}),
                  },
                } as never);
              }}
            >
              <Ionicons name="create-outline" size={20} color={adminTheme.colors.primary} />
              <Text style={styles.menuItemText}>Düzenle</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={() => {
                setMenuVisible(false);
                deleteRow();
              }}
            >
              <Ionicons name="trash-outline" size={20} color="#dc2626" />
              <Text style={[styles.menuItemText, styles.menuItemDanger]}>Kaydı sil</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuCancelText}>İptal</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: adminTheme.colors.textMuted },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  kindBannerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  kindBanner: { flex: 1, borderRadius: 10, padding: 16 },
  moreBtn: { padding: 8, marginTop: 4 },
  kindIncome: { backgroundColor: '#dcfce7' },
  kindExpense: { backgroundColor: '#fee2e2' },
  kindBannerText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  kindAmt: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  summary: { fontSize: 14, color: adminTheme.colors.textMuted, marginBottom: 12 },
  metaGrid: { gap: 4 },
  metaLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 8 },
  metaVal: { fontSize: 15, color: adminTheme.colors.text, fontWeight: '500' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: expenseReceiptPreviewStyle,
  noReceipt: { fontSize: 14, color: adminTheme.colors.textMuted },
  menuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: adminTheme.colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.border,
  },
  menuItemText: { fontSize: 16, fontWeight: '600', color: adminTheme.colors.text, flex: 1 },
  menuItemDanger: { color: '#dc2626' },
  menuCancel: { paddingVertical: 16, alignItems: 'center' },
  menuCancelText: { fontSize: 16, color: adminTheme.colors.textMuted, fontWeight: '600' },
});
