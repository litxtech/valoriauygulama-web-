import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { useFocusEffect } from 'expo-router';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { PartnerEntryLedgerRow } from '@/components/breakfastPartner/PartnerEntryLedgerRow';
import { PartnerLaundryLedgerRow } from '@/components/breakfastPartner/PartnerLaundryLedgerRow';
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
import {
  listPartnerLaundryLedger,
  type PartnerLaundryLedgerRow as LaundryLedgerRow,
} from '@/lib/breakfastPartnerLaundry';
import { refreshPartnerAccountAfterPayment } from '@/lib/partnerAccountCache';
import { PartnerStripeCheckoutHost } from '@/components/payment/PartnerStripeCheckoutHost';
import { usePartnerStripeCheckout } from '@/hooks/usePartnerStripeCheckout';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

type HistoryTab = 'breakfast' | 'laundry';

export default function PartnerHistoryScreen() {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets, { partner: true }) + 24;
  const partner = usePartnerAuthStore((s) => s.partner)!;
  const [tab, setTab] = useState<HistoryTab>('breakfast');
  const [entries, setEntries] = useState<PartnerDailyEntryLedgerRow[]>([]);
  const [laundryEntries, setLaundryEntries] = useState<LaundryLedgerRow[]>([]);
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
    const [breakfastResult, laundryResult] = await Promise.allSettled([
      listPartnerDailyEntriesLedger(90, partner.hotel.id),
      listPartnerLaundryLedger(90, partner.hotel.id),
    ]);
    setEntries(breakfastResult.status === 'fulfilled' ? breakfastResult.value : []);
    setLaundryEntries(laundryResult.status === 'fulfilled' ? laundryResult.value : []);
    if (laundryResult.status === 'rejected') {
      console.warn(
        '[partner/history] laundry ledger',
        laundryResult.reason instanceof Error ? laundryResult.reason.message : laundryResult.reason
      );
    }
    setLoading(false);
    setRefreshing(false);
  }, [partner.hotel.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const payBreakfastEntry = async (entry: PartnerDailyEntryLedgerRow) => {
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

  const payLaundryEntry = async (entry: LaundryLedgerRow) => {
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
      <PartnerScreenTitle title="Geçmiş kayıtlar" subtitle="Kahvaltı ve çamaşır · ödeme / PDF" />
      <View style={styles.exportWrap}>
        <PartnerGlassCard>
          <PartnerReportExportButtons
            compact
            hint="Kahvaltı + çamaşır cari özetinizi PDF alın veya yazdırın."
            loadReport={() => loadPartnerPortalActivityReport(partner.hotel.id, 90)}
            disabled={loading}
          />
        </PartnerGlassCard>
      </View>

      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'breakfast' && styles.segmentBtnActive]}
          onPress={() => setTab('breakfast')}
        >
          <Text style={[styles.segmentText, tab === 'breakfast' && styles.segmentTextActive]}>
            Kahvaltı ({entries.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, tab === 'laundry' && styles.segmentBtnActive]}
          onPress={() => setTab('laundry')}
        >
          <Text style={[styles.segmentText, tab === 'laundry' && styles.segmentTextActive]}>
            Çamaşır ({laundryEntries.length})
          </Text>
        </TouchableOpacity>
      </View>

      {tab === 'breakfast' ? (
        <FlatList
          style={styles.list}
          data={entries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom: scrollBottomPad,
            paddingHorizontal: 18,
            paddingTop: 8,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={partnerTheme.accent}
            />
          }
          ListEmptyComponent={
            <PartnerEmptyState
              icon="calendar-outline"
              title="Henüz kahvaltı kaydı yok"
              body="İlk kahvaltı sayınızı ana sayfadan girebilirsiniz."
            />
          }
          renderItem={({ item }) => (
            <PartnerEntryLedgerRow
              entry={item}
              paying={payingEntryId === item.id || payingKey === item.id}
              onPay={(row) => void payBreakfastEntry(row)}
              onEdit={openEdit}
              showEdit={canEdit(item)}
            />
          )}
        />
      ) : (
        <FlatList
          style={styles.list}
          data={laundryEntries}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingBottom: scrollBottomPad,
            paddingHorizontal: 18,
            paddingTop: 8,
            flexGrow: 1,
          }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
              tintColor={partnerTheme.accent}
            />
          }
          ListEmptyComponent={
            <PartnerEmptyState
              icon="shirt-outline"
              title="Henüz çamaşır kaydı yok"
              body="Personel yıkama kaydı girdiğinde burada görünecek; satırdan ödeyebilirsiniz."
            />
          }
          renderItem={({ item }) => (
            <PartnerLaundryLedgerRow
              entry={item}
              paying={payingEntryId === item.id || payingKey === item.id}
              onPay={(row) => void payLaundryEntry(row)}
            />
          )}
        />
      )}

      <PartnerBottomSheet
        visible={!!editEntry}
        title={
          editEntry
            ? `${formatPartnerDateTurkish(editEntry.record_date, { weekday: true })} · düzenle`
            : 'Düzenle'
        }
        onClose={() => setEditEntry(null)}
      >
        <PartnerField
          label="Kişi sayısı"
          value={editCount}
          onChangeText={setEditCount}
          keyboardType="number-pad"
        />
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
  segment: {
    flexDirection: 'row',
    marginHorizontal: 18,
    marginTop: 8,
    marginBottom: 4,
    padding: 4,
    borderRadius: partnerRadii.md,
    backgroundColor: partnerTheme.card,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: partnerRadii.sm, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: partnerTheme.accent },
  segmentText: { color: partnerTheme.muted, fontWeight: '700', fontSize: 13 },
  segmentTextActive: { color: '#0f172a' },
});
