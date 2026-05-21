import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { canManageStaffMealMenu, canSubmitMealMenuKitchenConfirm } from '@/lib/staffPermissions';
import { toLocalYmd } from '@/lib/mealMenuDate';
import { countFilledSlots } from '@/lib/mealMenuUi';
import {
  fetchMealMenuForMonth,
  fetchKitchenConfirmationsForMenu,
  submitKitchenConfirmation,
  rowToMealFields,
  mealDayHasContent,
  summarizeMonthDays,
  type MealKitchenConfirmation,
  type MealMenuDayRow,
} from '@/lib/staffMealMenu';
import {
  MealMonthNavigator,
  MealMenuStatsStrip,
  MealDayViewCard,
  MealMenuEmptyState,
  staffMealPalette,
} from '@/components/mealMenu/MealMenuUi';
import { MealMonthDayPicker } from '@/components/mealMenu/MealMonthDayPicker';
import { MealKitchenConfirmPanel } from '@/components/mealMenu/MealKitchenConfirmPanel';
import { supabase } from '@/lib/supabase';
import {
  DEFAULT_MEAL_MENU_PDF_APPROVER,
  DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE,
  exportMealMenuPdf,
  generateMealMenuPdfFile,
  sendMealMenuPdfToPrinterEmail,
} from '@/lib/mealMenuPdf';

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export default function StaffMealMenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mealDate: mealDateParam } = useLocalSearchParams<{ mealDate?: string }>();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const canManage = canManageStaffMealMenu(staff);
  const canKitchen = canSubmitMealMenuKitchenConfirm(staff);

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rows, setRows] = useState<MealMenuDayRow[]>([]);
  const [confirmations, setConfirmations] = useState<Record<string, MealKitchenConfirmation>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmSaving, setConfirmSaving] = useState(false);
  const [selectedYmd, setSelectedYmd] = useState(() => toLocalYmd(new Date()));
  const [orgName, setOrgName] = useState<string | null>(null);
  const [pdfApproverName, setPdfApproverName] = useState(DEFAULT_MEAL_MENU_PDF_APPROVER);
  const [pdfFooterNote, setPdfFooterNote] = useState(DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printerMailLoading, setPrinterMailLoading] = useState(false);

  /** Push / bildirimden gelen gün (YYYY-MM-DD) */
  useEffect(() => {
    const raw = typeof mealDateParam === 'string' ? mealDateParam.trim().slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;
    setSelectedYmd(raw);
    const [y, m] = raw.split('-').map((x) => parseInt(x, 10));
    if (y && m) setViewMonth(new Date(y, m - 1, 1));
  }, [mealDateParam]);

  const todayStr = toLocalYmd(new Date());
  const periodLabel = `${MONTHS_TR[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;

  useEffect(() => {
    if (!staff?.organization_id) {
      setOrgName(null);
      return;
    }
    supabase
      .from('organizations')
      .select('name')
      .eq('id', staff.organization_id)
      .maybeSingle()
      .then(({ data }) => setOrgName((data as { name?: string } | null)?.name ?? null));
  }, [staff?.organization_id]);

  const load = useCallback(async () => {
    if (!staff?.organization_id) {
      setMenuId(null);
      setRows([]);
      setConfirmations({});
      return;
    }
    try {
      const { menu, days } = await fetchMealMenuForMonth(staff.organization_id, viewMonth);
      setMenuId(menu?.id ?? null);
      setRows(days);
      setPdfApproverName(menu?.pdf_approver_name?.trim() || DEFAULT_MEAL_MENU_PDF_APPROVER);
      setPdfFooterNote(menu?.pdf_footer_note?.trim() || DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);
      if (menu?.id) {
        const conf = await fetchKitchenConfirmationsForMenu(menu.id);
        setConfirmations(conf);
      } else {
        setConfirmations({});
      }
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yüklenemedi');
      setMenuId(null);
      setRows([]);
      setConfirmations({});
    }
  }, [staff?.organization_id, viewMonth]);

  useEffect(() => {
    let c = false;
    (async () => {
      setLoading(true);
      await load();
      if (!c) setLoading(false);
    })();
    return () => {
      c = true;
    };
  }, [load]);

  useEffect(() => {
    const prefix = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
    if (selectedYmd.startsWith(prefix)) return;
    setSelectedYmd(todayStr.startsWith(prefix) ? todayStr : `${prefix}-01`);
  }, [viewMonth, todayStr, selectedYmd]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const dayChips = useMemo(() => {
    return rows.map((r) => {
      const ymd = r.meal_date.slice(0, 10);
      const fields = rowToMealFields(r);
      return {
        ymd,
        hasContent: mealDayHasContent(fields),
        isToday: ymd === todayStr,
        isPast: ymd < todayStr,
        isFuture: ymd > todayStr,
        kitchenConfirmed: !!confirmations[ymd],
      };
    });
  }, [rows, todayStr, confirmations]);

  const selectedRow = useMemo(
    () => rows.find((r) => r.meal_date.slice(0, 10) === selectedYmd) ?? null,
    [rows, selectedYmd]
  );
  const selectedFields = selectedRow ? rowToMealFields(selectedRow) : null;
  const selectedHasContent = selectedFields ? mealDayHasContent(selectedFields) : false;
  const monthSummary = useMemo(() => summarizeMonthDays(rows), [rows]);

  const shiftMonth = (delta: number) => {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  const buildPdfPayload = () => ({
    hotelName: (orgName ?? '').trim() || 'Otel',
    periodLabel,
    approverName: pdfApproverName,
    footerNote: pdfFooterNote,
    days: rows.map((r) => ({
      ymd: r.meal_date.slice(0, 10),
      fields: rowToMealFields(r),
    })),
  });

  const handleExportPdf = async () => {
    if (!menuId) return;
    setPdfLoading(true);
    try {
      await exportMealMenuPdf(buildPdfPayload());
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı');
    } finally {
      setPdfLoading(false);
    }
  };

  const handlePrinterMail = async () => {
    if (!menuId) return;
    setPrinterMailLoading(true);
    try {
      const payload = buildPdfPayload();
      const uri = await generateMealMenuPdfFile(payload);
      await sendMealMenuPdfToPrinterEmail(payload, uri);
      Alert.alert('Gönderildi', 'Belge yazıcı e-posta adresine gönderildi.');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yazıcıya gönderilemedi');
    } finally {
      setPrinterMailLoading(false);
    }
  };

  const handleKitchenSubmit = async (payload: {
    prepared: boolean;
    samples: boolean;
    preserved: boolean;
    note: string;
  }) => {
    if (!staff?.organization_id || !staff.id || !menuId) return;
    if (selectedYmd > todayStr) {
      Alert.alert(t('staffMealKitchenConfirmTitle'), t('staffMealKitchenFutureBlocked'));
      return;
    }
    setConfirmSaving(true);
    try {
      await submitKitchenConfirmation({
        organizationId: staff.organization_id,
        menuId,
        mealDate: selectedYmd,
        staffId: staff.id,
        preparedMeals: payload.prepared,
        tookSamples: payload.samples,
        preservedSamples: payload.preserved,
        note: payload.note,
      });
      await load();
      Alert.alert(t('staffMealKitchenConfirmTitle'), t('staffMealKitchenSaved'));
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kaydedilemedi');
    } finally {
      setConfirmSaving(false);
    }
  };

  const showKitchenPanel =
    canKitchen &&
    selectedHasContent &&
    selectedYmd <= todayStr &&
    !!menuId;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <MealMonthNavigator
          periodLabel={periodLabel}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          palette={staffMealPalette}
          subtitle={t('staffMealBrowseSubtitle', { count: monthSummary.withContent })}
          compact
        />

        {menuId && !loading ? (
          <View style={styles.pickerBlock}>
            <MealMonthDayPicker
              days={dayChips}
              selectedYmd={selectedYmd}
              onSelect={setSelectedYmd}
              primaryColor={theme.colors.primary}
              mutedColor={theme.colors.textMuted}
              borderColor={theme.colors.borderLight}
              compact
            />
          </View>
        ) : null}

        <View style={styles.linkRow}>
          <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/staff/meal-menu-history')} activeOpacity={0.88}>
            <Ionicons name="time-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.linkBtnText}>{t('staffMealHistoryTitle')}</Text>
          </TouchableOpacity>
          {canManage ? (
            <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/staff/meal-menu-edit')} activeOpacity={0.88}>
              <Ionicons name="create-outline" size={18} color={theme.colors.primary} />
              <Text style={styles.linkBtnText}>{t('staffMealMenuManageCta')}</Text>
            </TouchableOpacity>
          ) : null}
          {canManage && menuId && !loading ? (
            <>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={handleExportPdf}
                disabled={pdfLoading || printerMailLoading}
                activeOpacity={0.88}
              >
                {pdfLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="print-outline" size={18} color={theme.colors.primary} />
                )}
                <Text style={styles.linkBtnText}>PDF / Yazdır</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={handlePrinterMail}
                disabled={printerMailLoading || pdfLoading}
                activeOpacity={0.88}
              >
                {printerMailLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Ionicons name="mail-outline" size={18} color={theme.colors.primary} />
                )}
                <Text style={styles.linkBtnText}>Yazıcı Mail</Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        {loading ? (
          <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
        ) : !staff?.organization_id ? (
          <MealMenuEmptyState
            icon="alert-circle-outline"
            title="Organizasyon yok"
            message="Hesabınıza otel atanmamış."
            palette={staffMealPalette}
          />
        ) : !menuId ? (
          <MealMenuEmptyState
            icon="restaurant-outline"
            title="Menü henüz yok"
            message="Bu ay için yemek listesi yayınlanmadı."
            palette={staffMealPalette}
          />
        ) : (
          <>
            <MealMenuStatsStrip
              mode="staff"
              filledDays={monthSummary.filled}
              partialDays={monthSummary.partial}
              totalDays={monthSummary.withContent}
              todaySlots={
                selectedYmd === todayStr && selectedFields ? countFilledSlots(selectedFields) : undefined
              }
              palette={staffMealPalette}
            />

            {selectedHasContent && selectedFields ? (
              <MealDayViewCard
                ymd={selectedYmd}
                fields={selectedFields}
                isToday={selectedYmd === todayStr}
                palette={staffMealPalette}
                compact
              />
            ) : (
              <MealMenuEmptyState
                icon="restaurant-outline"
                title={t('staffMealDayEmptyTitle')}
                message={t('staffMealDayEmptyMessage')}
                palette={staffMealPalette}
              />
            )}

            {confirmations[selectedYmd] && !showKitchenPanel ? (
              <View style={styles.confirmedBanner}>
                <Ionicons name="shield-checkmark" size={20} color="#16a34a" />
                <Text style={styles.confirmedBannerText}>{t('staffMealKitchenConfirmedDay')}</Text>
              </View>
            ) : null}

            {showKitchenPanel ? (
              <MealKitchenConfirmPanel
                key={`${selectedYmd}-${confirmations[selectedYmd]?.id ?? 'new'}`}
                ymd={selectedYmd}
                existing={confirmations[selectedYmd] ?? null}
                canSubmit={selectedYmd <= todayStr}
                saving={confirmSaving}
                onSubmit={handleKitchenSubmit}
                palette={{
                  primary: theme.colors.primary,
                  border: theme.colors.borderLight,
                  text: theme.colors.text,
                  muted: theme.colors.textMuted,
                  surface: '#fff',
                }}
              />
            ) : null}

            <Text style={styles.monthListTitle}>{t('staffMealMonthAllDays')}</Text>
            {rows
              .filter((r) => mealDayHasContent(rowToMealFields(r)))
              .map((r) => {
                const ymd = r.meal_date.slice(0, 10);
                const conf = confirmations[ymd];
                return (
                  <TouchableOpacity key={ymd} onPress={() => setSelectedYmd(ymd)} activeOpacity={0.9}>
                    <View style={styles.monthRow}>
                      <MealDayViewCard
                        ymd={ymd}
                        fields={rowToMealFields(r)}
                        isToday={ymd === todayStr}
                        palette={staffMealPalette}
                        compact
                      />
                      {conf ? (
                        <View style={styles.confTag}>
                          <Ionicons name="checkmark-circle" size={14} color="#16a34a" />
                          <Text style={styles.confTagText}>{t('staffMealKitchenShort')}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  pickerBlock: { marginBottom: 2 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  loader: { marginTop: 28, marginBottom: 16 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  linkBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  confirmedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#dcfce7',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  confirmedBannerText: { color: '#166534', fontWeight: '600', flex: 1 },
  monthListTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
  monthRow: { position: 'relative' },
  confTag: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  confTagText: { fontSize: 11, fontWeight: '700', color: '#166534' },
});
