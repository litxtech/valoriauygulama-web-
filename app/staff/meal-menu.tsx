import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { canManageStaffMealMenu } from '@/lib/staffPermissions';
import { toLocalYmd } from '@/lib/mealMenuDate';
import {
  countFilledSlots,
  mealMenuBrowseAnchorYmd,
  monthStartDate,
  isCurrentOrFutureMealMonth,
} from '@/lib/mealMenuUi';
import {
  fetchMealMenuForMonth,
  rowToMealFields,
  mealDayHasContent,
  summarizeMonthDays,
  type MealMenuDayRow,
  type MealMenuMonthMeta,
} from '@/lib/staffMealMenu';
import {
  getStaffMealMenuCache,
  setStaffMealMenuCache,
  staffMealMenuCacheKey,
  invalidateStaffMealMenuCache,
} from '@/lib/staffMealMenuCache';
import {
  MealMonthNavigator,
  MealMenuStatsStrip,
  MealDayViewCard,
  MealMenuEmptyState,
  staffMealPalette,
} from '@/components/mealMenu/MealMenuUi';
import { MealMonthDayPicker } from '@/components/mealMenu/MealMonthDayPicker';
import { PressableScale } from '@/components/premium/PressableScale';
import { supabase } from '@/lib/supabase';
import { DEFAULT_MEAL_MENU_PDF_APPROVER, DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE } from '@/lib/mealMenuPdf';
import { useStaffMealMenuLive } from '@/hooks/useStaffMealMenuLive';

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

  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rows, setRows] = useState<MealMenuDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedYmd, setSelectedYmd] = useState(() => toLocalYmd(new Date()));
  const [orgName, setOrgName] = useState<string | null>(null);
  const [pdfApproverName, setPdfApproverName] = useState(DEFAULT_MEAL_MENU_PDF_APPROVER);
  const [pdfFooterNote, setPdfFooterNote] = useState(DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printerMailLoading, setPrinterMailLoading] = useState(false);

  const todayStr = toLocalYmd(new Date());
  const currentMonthStart = useMemo(() => monthStartDate(new Date()), []);
  const listAnchorYmd = useMemo(
    () => mealMenuBrowseAnchorYmd(viewMonth, todayStr),
    [viewMonth, todayStr]
  );
  const canGoPrevMonth = viewMonth.getTime() > currentMonthStart.getTime();
  const periodLabel = `${MONTHS_TR[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;

  /** Push / bildirimden gelen gün (YYYY-MM-DD); geçmiş günler ana sayfada listelenmez */
  useEffect(() => {
    const raw = typeof mealDateParam === 'string' ? mealDateParam.trim().slice(0, 10) : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return;
    const [y, m] = raw.split('-').map((x) => parseInt(x, 10));
    const vm = y && m ? new Date(y, m - 1, 1) : viewMonth;
    const anchor = mealMenuBrowseAnchorYmd(vm, todayStr);
    setSelectedYmd(raw >= anchor ? raw : anchor);
    if (y && m) setViewMonth(vm);
  }, [mealDateParam, todayStr]);

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

  const applyMenuBundle = useCallback((menu: MealMenuMonthMeta | null, days: MealMenuDayRow[]) => {
    setMenuId(menu?.id ?? null);
    setRows(days);
    setPdfApproverName(menu?.pdf_approver_name?.trim() || DEFAULT_MEAL_MENU_PDF_APPROVER);
    setPdfFooterNote(menu?.pdf_footer_note?.trim() || DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);
  }, []);

  const load = useCallback(
    async (opts?: { background?: boolean; force?: boolean }) => {
      if (!staff?.organization_id) {
        setMenuId(null);
        setRows([]);
        return;
      }
      const cacheKey = staffMealMenuCacheKey(staff.organization_id, viewMonth);
      if (opts?.force) invalidateStaffMealMenuCache(staff.organization_id);
      const cached = opts?.force ? null : getStaffMealMenuCache(cacheKey);
      if (cached && !opts?.background) {
        applyMenuBundle(cached.menu, cached.days);
        setLoading(false);
      } else if (!opts?.background) {
        setLoading(true);
      }

      try {
        const { menu, days } = await fetchMealMenuForMonth(staff.organization_id, viewMonth);
        applyMenuBundle(menu, days);
        setStaffMealMenuCache(cacheKey, { menu, days });
        if (!opts?.background) setLoading(false);
      } catch (e: unknown) {
        if (opts?.force) invalidateStaffMealMenuCache(staff.organization_id);
        if (!opts?.background) {
          Alert.alert('Hata', (e as Error)?.message ?? 'Yüklenemedi');
          setMenuId(null);
          setRows([]);
          setLoading(false);
        }
      }
    },
    [staff?.organization_id, viewMonth, applyMenuBundle]
  );

  const refreshLive = useCallback(() => {
    void load({ background: true, force: true });
  }, [load]);

  useStaffMealMenuLive(staff?.organization_id, menuId, refreshLive);

  useFocusEffect(
    useCallback(() => {
      const cacheKey = staff?.organization_id
        ? staffMealMenuCacheKey(staff.organization_id, viewMonth)
        : null;
      const cached = cacheKey ? getStaffMealMenuCache(cacheKey) : null;
      if (cached) {
        applyMenuBundle(cached.menu, cached.days);
        setLoading(false);
        void load({ background: true });
      } else {
        void load();
      }
      return undefined;
    }, [load, staff?.organization_id, viewMonth, applyMenuBundle])
  );

  useEffect(() => {
    if (!isCurrentOrFutureMealMonth(viewMonth, todayStr)) {
      setViewMonth(currentMonthStart);
      return;
    }
    const prefix = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
    if (selectedYmd.startsWith(prefix) && selectedYmd >= listAnchorYmd) return;
    setSelectedYmd(listAnchorYmd);
  }, [viewMonth, todayStr, listAnchorYmd, currentMonthStart]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ force: true });
    setRefreshing(false);
  };

  const upcomingRows = useMemo(
    () => rows.filter((r) => r.meal_date.slice(0, 10) >= listAnchorYmd),
    [rows, listAnchorYmd]
  );

  const dayChips = useMemo(() => {
    return upcomingRows.map((r) => {
      const ymd = r.meal_date.slice(0, 10);
      const fields = rowToMealFields(r);
      return {
        ymd,
        hasContent: mealDayHasContent(fields),
        isToday: ymd === todayStr,
        isPast: ymd < todayStr,
        isFuture: ymd > todayStr,
      };
    });
  }, [upcomingRows, todayStr]);

  const upcomingWithContent = useMemo(
    () => upcomingRows.filter((r) => mealDayHasContent(rowToMealFields(r))).length,
    [upcomingRows]
  );

  const selectedRow = useMemo(
    () => rows.find((r) => r.meal_date.slice(0, 10) === selectedYmd) ?? null,
    [rows, selectedYmd]
  );
  const selectedFields = selectedRow ? rowToMealFields(selectedRow) : null;
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
      const { exportMealMenuPdf } = await import('@/lib/mealMenuPdf');
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
      const { generateMealMenuPdfFile, sendMealMenuPdfToPrinterEmail } = await import('@/lib/mealMenuPdf');
      const uri = await generateMealMenuPdfFile(payload);
      await sendMealMenuPdfToPrinterEmail(payload, uri);
      Alert.alert('Gönderildi', 'Belge yazıcı e-posta adresine gönderildi.');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yazıcıya gönderilemedi');
    } finally {
      setPrinterMailLoading(false);
    }
  };

  const renderUpcomingDay = useCallback(
    ({ item: r, index }: { item: MealMenuDayRow; index: number }) => {
      const ymd = r.meal_date.slice(0, 10);
      return (
        <PressableScale onPress={() => setSelectedYmd(ymd)} scaleTo={0.985} haptic={false}>
          <MealDayViewCard
            index={index}
            ymd={ymd}
            fields={rowToMealFields(r)}
            isToday={ymd === todayStr}
            palette={staffMealPalette}
            compact
            showWhenEmpty
            emptyMessage={t('staffMealDayEmptyMessage')}
            selected={ymd === selectedYmd}
          />
        </PressableScale>
      );
    },
    [selectedYmd, todayStr, t]
  );

  const listHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <MealMonthNavigator
          periodLabel={periodLabel}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          palette={staffMealPalette}
          subtitle={t('staffMealBrowseSubtitle', { count: upcomingWithContent })}
          prevDisabled={!canGoPrevMonth}
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
            <Ionicons name="time-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.linkBtnText}>{t('staffMealHistoryTitle')}</Text>
          </TouchableOpacity>
          {canManage ? (
            <TouchableOpacity style={styles.linkBtn} onPress={() => router.push('/staff/meal-menu-edit')} activeOpacity={0.88}>
              <Ionicons name="create-outline" size={14} color={theme.colors.primary} />
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
                  <Ionicons name="print-outline" size={14} color={theme.colors.primary} />
                )}
                <Text style={styles.linkBtnText}>PDF</Text>
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
                  <Ionicons name="mail-outline" size={14} color={theme.colors.primary} />
                )}
                <Text style={styles.linkBtnText}>Yazıcı</Text>
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

            <Text style={styles.monthListTitle}>{t('staffMealUpcomingDays')}</Text>
          </>
        )}
      </View>
    ),
    [
      periodLabel,
      canGoPrevMonth,
      upcomingWithContent,
      menuId,
      loading,
      dayChips,
      selectedYmd,
      canManage,
      pdfLoading,
      printerMailLoading,
      staff?.organization_id,
      monthSummary,
      selectedFields,
      todayStr,
      t,
      router,
      handleExportPdf,
      handlePrinterMail,
    ]
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={!loading && menuId ? upcomingRows : []}
        keyExtractor={(r) => r.meal_date.slice(0, 10)}
        renderItem={renderUpcomingDay}
        ListHeaderComponent={listHeader}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={8}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  listContent: { paddingHorizontal: 16, paddingTop: 4 },
  listHeader: {},
  pickerBlock: { marginBottom: 2 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  loader: { marginTop: 28, marginBottom: 16 },
  linkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  linkBtnText: { fontSize: 11, fontWeight: '600', color: theme.colors.text },
  monthListTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: 8,
    marginBottom: 8,
  },
});
