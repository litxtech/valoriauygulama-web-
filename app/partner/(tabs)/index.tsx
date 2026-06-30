import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { useFocusEffect } from 'expo-router';
import { usePartnerAuthStore } from '@/stores/partnerAuthStore';
import { PartnerEntryLedgerRow } from '@/components/breakfastPartner/PartnerEntryLedgerRow';
import {
  PartnerChip,
  PartnerEmptyState,
  PartnerEntryDateSelector,
  PartnerField,
  PartnerGlassCard,
  PartnerPrimaryButton,
  PartnerSectionTitle,
  PartnerStatTile,
} from '@/components/breakfastPartner/PartnerUi';
import {
  fmtPartnerMoney,
  formatPartnerDateTurkish,
  formatPartnerTime,
  listPartnerDailyEntriesLedger,
  partnerDefaultEntryTarget,
  partnerEntryDateForTarget,
  partnerEntryDeadlineHint,
  canPartnerEditEntryDate,
  resolvePartnerTodayEntryStatus,
  todayIstanbulDate,
  tomorrowIstanbulDate,
  upsertPartnerDailyEntry,
  type PartnerDailyEntryLedgerRow,
  type PartnerEntryTarget,
} from '@/lib/breakfastPartner';
import {
  getPartnerAccountCache,
  invalidatePartnerAccountCache,
  loadPartnerAccountSnapshot,
  refreshPartnerAccountAfterPayment,
} from '@/lib/partnerAccountCache';
import { PartnerStripeCheckoutHost } from '@/components/payment/PartnerStripeCheckoutHost';
import { usePartnerStripeCheckout } from '@/hooks/usePartnerStripeCheckout';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

const QUICK_COUNTS = [5, 10, 15, 20, 25, 30] as const;

function buildOptimisticEntry(
  partner: { hotel: { id: string; organization_id: string }; effectiveUnitPrice: number },
  recordDate: string,
  count: number,
  noteText: string,
  entryId: string,
  previous: PartnerDailyEntryLedgerRow | null
): PartnerDailyEntryLedgerRow {
  const unitPrice = previous?.unit_price_snapshot || partner.effectiveUnitPrice || 0;
  const lineTotal = count * unitPrice;
  const now = new Date().toISOString();
  return {
    id: entryId,
    partner_hotel_id: partner.hotel.id,
    organization_id: partner.hotel.organization_id,
    record_date: recordDate,
    guest_count: count,
    unit_price_snapshot: unitPrice,
    line_total: lineTotal,
    note: noteText.trim() || null,
    agreement_id: previous?.agreement_id ?? null,
    created_at: previous?.created_at ?? now,
    updated_at: now,
    amount_remaining: count <= 0 ? 0 : previous?.amount_remaining ?? lineTotal,
    agreement_status: count <= 0 ? null : previous?.agreement_status ?? 'open',
  };
}

function mergeLedgerEntry(
  entries: PartnerDailyEntryLedgerRow[],
  entry: PartnerDailyEntryLedgerRow
): PartnerDailyEntryLedgerRow[] {
  const rest = entries.filter((e) => e.record_date !== entry.record_date);
  return [entry, ...rest].sort((a, b) => b.record_date.localeCompare(a.record_date));
}

function StatusBanner({
  entry,
  recordDate,
  target,
}: {
  entry: PartnerDailyEntryLedgerRow | null;
  recordDate: string;
  target: PartnerEntryTarget;
}) {
  const status = resolvePartnerTodayEntryStatus(entry);
  const dayWord = target === 'tomorrow' ? 'Yarın' : 'Bugün';
  const config =
    status === 'entered'
      ? {
          icon: 'checkmark-circle' as const,
          title: `${dayWord} kayıt girildi`,
          body: `${entry!.guest_count} kişi · ${formatPartnerTime(entry!.updated_at)}`,
          colors: [partnerTheme.successSoft, 'rgba(15,23,42,0.6)'] as const,
          accent: partnerTheme.success,
        }
      : status === 'zero'
        ? {
            icon: 'moon-outline' as const,
            title: `${dayWord} kahvaltı yok`,
            body: '0 kişi olarak işaretlendi',
            colors: [partnerTheme.infoSoft, 'rgba(15,23,42,0.6)'] as const,
            accent: partnerTheme.info,
          }
        : {
            icon: 'alert-circle-outline' as const,
            title: `${dayWord} için kayıt bekleniyor`,
            body: `${formatPartnerDateTurkish(recordDate, { weekday: true })} · ${partnerEntryDeadlineHint(target)}`,
            colors: [partnerTheme.dangerSoft, 'rgba(15,23,42,0.6)'] as const,
            accent: partnerTheme.danger,
          };

  return (
    <LinearGradient colors={[...config.colors]} style={styles.statusBanner}>
      <View style={[styles.statusIcon, { backgroundColor: `${config.accent}22` }]}>
        <Ionicons name={config.icon} size={22} color={config.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statusTitle}>{config.title}</Text>
        <Text style={styles.statusBody}>{config.body}</Text>
      </View>
    </LinearGradient>
  );
}

export default function PartnerPortalScreen() {
  const insets = useSafeAreaInsets();
  const scrollBottomPad = insets.bottom + getFloatingTabBarTotalHeight(insets) + 24;
  const partner = usePartnerAuthStore((s) => s.partner)!;

  const todayIso = todayIstanbulDate();
  const tomorrowIso = tomorrowIstanbulDate();
  const [entryTarget, setEntryTarget] = useState<PartnerEntryTarget>(() => partnerDefaultEntryTarget());
  const recordDate = partnerEntryDateForTarget(entryTarget);
  const tomorrowEntryOpen = canPartnerEditEntryDate(tomorrowIso);
  const [ledgerEntries, setLedgerEntries] = useState<PartnerDailyEntryLedgerRow[]>([]);
  const activeEntry = useMemo(
    () => ledgerEntries.find((e) => e.record_date === recordDate) ?? null,
    [ledgerEntries, recordDate]
  );
  const listedEntries = useMemo(
    () => ledgerEntries.filter((e) => e.guest_count > 0),
    [ledgerEntries]
  );

  const [guestCount, setGuestCount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [payingEntryId, setPayingEntryId] = useState<string | null>(null);
  const cachedBalance = getPartnerAccountCache(partner.hotel.id);
  const [openBalance, setOpenBalance] = useState(cachedBalance?.openBalance ?? 0);
  const [monthGuests, setMonthGuests] = useState(cachedBalance?.monthGuests ?? 0);
  const [monthAmount, setMonthAmount] = useState(cachedBalance?.monthAmount ?? 0);
  const openBalanceRef = useRef(openBalance);
  openBalanceRef.current = openBalance;

  const load = useCallback(async (opts?: { forceBalance?: boolean }) => {
    try {
      const entries = await listPartnerDailyEntriesLedger(31, partner.hotel.id).catch(
        () => [] as PartnerDailyEntryLedgerRow[]
      );
      setLedgerEntries(entries);

      const snap = await loadPartnerAccountSnapshot(partner.hotel.id, {
        force: opts?.forceBalance ?? false,
      });
      setOpenBalance(snap.openBalance);
      setMonthGuests(snap.monthGuests);
      setMonthAmount(snap.monthAmount);
    } finally {
      setRefreshing(false);
    }
  }, [partner.hotel.id]);

  const { startPayment, payingKey, checkout, dismissCheckout, finishCheckout } = usePartnerStripeCheckout(
    async (result) => {
      if (result.status !== 'success') {
        void load();
        return;
      }
      const snap = await refreshPartnerAccountAfterPayment(partner.hotel.id, {
        previousBalance: openBalanceRef.current,
      });
      setOpenBalance(snap.openBalance);
      setMonthGuests(snap.monthGuests);
      setMonthAmount(snap.monthAmount);
      void load();
    }
  );

  useEffect(() => {
    if (entryTarget === 'tomorrow' && !tomorrowEntryOpen) {
      setEntryTarget('today');
    }
  }, [entryTarget, tomorrowEntryOpen]);

  useEffect(() => {
    if (activeEntry) {
      setGuestCount(String(activeEntry.guest_count));
      setNote(activeEntry.note ?? '');
    } else {
      setGuestCount('');
      setNote('');
    }
  }, [activeEntry?.id, activeEntry?.guest_count, activeEntry?.note, recordDate]);

  useFocusEffect(
    useCallback(() => {
      void load({ forceBalance: true });
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

  const submit = async (count: number) => {
    if (count < 0 || Number.isNaN(count)) {
      Alert.alert('Hata', 'Geçerli bir kişi sayısı girin.');
      return;
    }
    setSaving(true);
    const result = await upsertPartnerDailyEntry(recordDate, count, note);
    setSaving(false);
    if ('error' in result) {
      Alert.alert('Kayıt hatası', result.error);
      return;
    }

    const optimistic = buildOptimisticEntry(partner, recordDate, count, note, result.id, activeEntry);
    setLedgerEntries((prev) => mergeLedgerEntry(prev, optimistic));

    const dayLabel = entryTarget === 'tomorrow' ? 'Yarınki' : 'Bugünkü';
    const msg =
      count === 0
        ? `${dayLabel} kahvaltı olmadığı kaydedildi.`
        : `${formatPartnerDateTurkish(recordDate, { weekday: true })} için ${count} kişi cariye işlendi.`;
    Alert.alert('Kaydedildi', msg);
    invalidatePartnerAccountCache(partner.hotel.id);
    void load({ forceBalance: true });
  };

  const save = () => {
    const count = parseInt(guestCount.replace(/\D/g, ''), 10);
    if (Number.isNaN(count)) {
      Alert.alert('Hata', 'Geçerli bir kişi sayısı girin.');
      return;
    }
    void submit(count);
  };

  const linePreview = (parseInt(guestCount.replace(/\D/g, ''), 10) || 0) * (partner.effectiveUnitPrice || 0);
  const parsedCount = parseInt(guestCount.replace(/\D/g, ''), 10);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: scrollBottomPad }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={partnerTheme.accent} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.statsRow}>
          <PartnerStatTile label="Bu ay kişi" value={String(monthGuests)} />
          <PartnerStatTile label="Bu ay tutar" value={fmtPartnerMoney(monthAmount)} />
          <PartnerStatTile label="Açık cari" value={fmtPartnerMoney(openBalance)} accent />
        </View>

        <StatusBanner entry={activeEntry} recordDate={recordDate} target={entryTarget} />

        <View style={styles.content}>
          <PartnerGlassCard glow>
            <PartnerSectionTitle
              icon="sunny-outline"
              title={entryTarget === 'tomorrow' ? 'Yarınki kahvaltı' : 'Bugünkü kahvaltı'}
              hint={`Kişi başı kahvaltı ${fmtPartnerMoney(partner.effectiveUnitPrice)} · Türkiye saati`}
            />

            <PartnerEntryDateSelector
              todayIso={todayIso}
              tomorrowIso={tomorrowIso}
              value={entryTarget}
              onChange={setEntryTarget}
              tomorrowDisabled={!tomorrowEntryOpen}
              onTomorrowBlocked={() => {
                Alert.alert(
                  'Süre doldu',
                  'Yarın için ön bildirim bugün 23:59\'da kapandı. Kahvaltı gününde bugün kartından girebilirsiniz.'
                );
              }}
              deadlineHint={partnerEntryDeadlineHint(entryTarget)}
            />

            <View style={styles.chipRow}>
              <PartnerChip label="Kahvaltı yok (0)" tone="zero" onPress={() => { setGuestCount('0'); void submit(0); }} />
              {QUICK_COUNTS.map((n) => (
                <PartnerChip
                  key={n}
                  label={String(n)}
                  active={parsedCount === n}
                  onPress={() => setGuestCount(String(n))}
                />
              ))}
            </View>

            <PartnerField
              label="Kişi sayısı"
              value={guestCount}
              onChangeText={setGuestCount}
              keyboardType="number-pad"
              placeholder="0"
            />

            <PartnerField
              label="Not (isteğe bağlı)"
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Örn. grup oda 201-205"
              style={{ minHeight: 76, textAlignVertical: 'top' }}
            />

            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Tahmini tutar</Text>
              <Text style={styles.previewValue}>{fmtPartnerMoney(linePreview)}</Text>
            </View>

            <PartnerPrimaryButton label="Kaydet ve cariye işle" onPress={save} loading={saving} />
          </PartnerGlassCard>

          <PartnerGlassCard style={{ marginTop: 14 }}>
            <PartnerSectionTitle
              icon="list-outline"
              title="Kahvaltı kayıtları"
              hint="Girilen kayıtlar · açık tutarda Öde"
            />
            {listedEntries.length === 0 ? (
              <PartnerEmptyState
                icon="restaurant-outline"
                title="Henüz kahvaltı kaydı yok"
                body="Kişi sayısı girdiğinizde kayıtlar burada listelenir."
              />
            ) : (
              listedEntries.map((entry) => (
                <PartnerEntryLedgerRow
                  key={entry.id}
                  entry={entry}
                  paying={payingEntryId === entry.id || payingKey === entry.id}
                  onPay={(row) => void payEntry(row)}
                />
              ))
            )}
          </PartnerGlassCard>
        </View>
      </ScrollView>
      <PartnerStripeCheckoutHost checkout={checkout} onClose={dismissCheckout} onFinished={finishCheckout} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  scroll: { flex: 1, backgroundColor: partnerTheme.bg },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  content: { paddingHorizontal: 18, paddingTop: 0, paddingBottom: 0 },
  statusBanner: {
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    borderRadius: partnerRadii.lg,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
    marginHorizontal: 18,
    marginBottom: 14,
  },
  statusIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { color: partnerTheme.text, fontWeight: '800', fontSize: 15 },
  statusBody: { color: partnerTheme.muted, fontSize: 13, marginTop: 3 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4, marginTop: 4 },
  previewRow: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: partnerTheme.cardBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewLabel: { color: partnerTheme.muted, fontWeight: '600' },
  previewValue: { color: partnerTheme.accent, fontWeight: '800', fontSize: 18 },
});
