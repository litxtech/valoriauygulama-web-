import { useCallback, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { useFocusEffect } from 'expo-router';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { PartnerEntryLedgerRow } from '@/components/breakfastPartner/PartnerEntryLedgerRow';
import {
  PartnerBottomSheet,
  PartnerEmptyState,
  PartnerField,
  PartnerScreenTitle,
  PartnerPrimaryButton,
  PartnerGlassCard,
} from '@/components/breakfastPartner/PartnerUi';
import { PartnerReportExportButtons } from '@/components/breakfastPartner/PartnerReportExportButtons';
import { loadPartnerPortalActivityReport } from '@/lib/breakfastPartnerReportPdf';
import {
  formatPartnerDateTurkish,
  canPartnerEditEntryDate,
  listPartnerDailyEntriesLedger,
  upsertPartnerDailyEntry,
  type PartnerDailyEntryLedgerRow,
} from '@/lib/breakfastPartner';
import { refreshPartnerAccountAfterPayment } from '@/lib/partnerAccountCache';
import { PartnerStripeCheckoutHost } from '@/components/payment/PartnerStripeCheckoutHost';
import { usePartnerStripeCheckout } from '@/hooks/usePartnerStripeCheckout';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

export default function PartnerHistoryScreen() {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;
  const partner = usePartnerAuthStore((s) => s.partner)!;
  const [entries, setEntries] = useState<PartnerDailyEntryLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payingEntryId, setPayingEntryId] = useState<string | null>(null);
  const [editEntry, setEditEntry] = useState<PartnerDailyEntryLedgerRow | null>(null);
  const [editCount, setEditCount] = useState('');
  const [editNote, setEditNote] = useState('');
  const [saving, setSaving] = useState(false);
  const { startPayment, payingKey, checkout, dismissCheckout, finishCheckout } = usePartnerStripeCheckout(
    async (result) => {
      if (result.status === 'success') {
        await refreshPartnerAccountAfterPayment(partner.hotel.id);
      }
      void load();
    }
  );

  const load = useCallback(async () => {
    try {
      const rows = await listPartnerDailyEntriesLedger(90, partner.hotel.id);
      setEntries(rows);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [partner.hotel.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const payEntry = async (entry: PartnerDailyEntryLedgerRow) => {
    if (!entry.agreement_id) {
      Alert.alert('Hata', 'Bu kayıt için ödeme oluşturulamadı.');
      return;
    }
    setPayingEntryId(entry.id);
    try {
      await startPayment({ agreementId: entry.agreement_id, amount: entry.amount_remaining }, entry.id);
    } finally {
      setPayingEntryId(null);
    }
  };

  const openEdit = (entry: PartnerDailyEntryLedgerRow) => {
    setEditEntry(entry);
    setEditCount(String(entry.guest_count));
    setEditNote(entry.note ?? '');
  };

  const saveEdit = async () => {
    if (!editEntry) return;
    const count = parseInt(editCount.replace(/\D/g, ''), 10);
    if (Number.isNaN(count) || count < 0) {
      Alert.alert('Hata', 'Geçerli kişi sayısı girin.');
      return;
    }
    setSaving(true);
    const result = await upsertPartnerDailyEntry(editEntry.record_date, count, editNote);
    setSaving(false);
    if ('error' in result) {
      Alert.alert('Hata', result.error);
      return;
    }
    setEditEntry(null);
    void load();
  };

  const canEdit = (entry: PartnerDailyEntryLedgerRow) => canPartnerEditEntryDate(entry.record_date);

  if (loading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={partnerTheme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PartnerScreenTitle title="Geçmiş kayıtlar" subtitle="Son 90 gün · ödeme ve düzenleme" />
      <View style={styles.exportWrap}>
        <PartnerGlassCard>
          <PartnerReportExportButtons
            compact
            hint="Son 90 günlük kayıtlarınızı PDF olarak alın veya yazdırın."
            loadReport={() => loadPartnerPortalActivityReport(partner.hotel.id, 90)}
            disabled={loading}
          />
        </PartnerGlassCard>
      </View>
      <FlatList
        style={styles.list}
        data={entries}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: scrollBottomPad, paddingHorizontal: 18, paddingTop: 8, flexGrow: 1 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />
        }
        ListEmptyComponent={<PartnerEmptyState icon="calendar-outline" title="Henüz kayıt yok" body="İlk kahvaltı sayınızı ana sayfadan girebilirsiniz." />}
        renderItem={({ item }) => (
          <PartnerEntryLedgerRow
            entry={item}
            paying={payingEntryId === item.id || payingKey === item.id}
            onPay={(row) => void payEntry(row)}
            onEdit={openEdit}
            showEdit={canEdit(item)}
          />
        )}
      />

      <PartnerBottomSheet
        visible={!!editEntry}
        title={editEntry ? `${formatPartnerDateTurkish(editEntry.record_date, { weekday: true })} · düzenle` : 'Düzenle'}
        onClose={() => setEditEntry(null)}
      >
        <PartnerField label="Kişi sayısı" value={editCount} onChangeText={setEditCount} keyboardType="number-pad" />
        <PartnerField
          label="Not"
          value={editNote}
          onChangeText={setEditNote}
          multiline
          style={{ minHeight: 76, textAlignVertical: 'top' }}
        />
        <PartnerPrimaryButton label="Kaydet" onPress={saveEdit} loading={saving} />
        <PartnerPrimaryButton label="İptal" variant="ghost" onPress={() => setEditEntry(null)} />
      </PartnerBottomSheet>
      <PartnerStripeCheckoutHost checkout={checkout} onClose={dismissCheckout} onFinished={finishCheckout} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  list: { flex: 1 },
  exportWrap: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 4 },
  boot: { flex: 1, backgroundColor: partnerTheme.bg, alignItems: 'center', justifyContent: 'center' },
});
