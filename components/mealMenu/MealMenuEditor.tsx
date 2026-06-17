import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { toLocalYmd } from '@/lib/mealMenuDate';
import {
  DEFAULT_MEAL_MENU_PDF_APPROVER,
  DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE,
  type MealMenuPdfDay,
} from '@/lib/mealMenuPdf';
import { fetchMealMenuForMonth } from '@/lib/staffMealMenu';
import { invalidateStaffMealMenuCache } from '@/lib/staffMealMenuCache';
import {
  groupDayKeysByWeek,
  menuStatsFromDaysMap,
  weekKeyForYmd,
  type MealFields,
  editableMealDayKeys,
  buildEmptyDaysMap,
  isPastMealMonth,
  monthStartDate,
  countFilledSlots,
} from '@/lib/mealMenuUi';
import {
  MealMonthNavigator,
  MealMenuStatsStrip,
  MealDayEditorCard,
  MealMenuEmptyState,
  MealSaveBar,
  MealPdfActionRow,
  MealNotifyCard,
  MealCollapsibleSection,
  adminMealPalette,
} from '@/components/mealMenu/MealMenuUi';
import { MealMenuPdfSettingsCard } from '@/components/mealMenu/MealMenuPdfSettingsCard';
import { MealMenuAiAssistant } from '@/components/mealMenu/MealMenuAiAssistant';
import { MealMonthDayPicker } from '@/components/mealMenu/MealMonthDayPicker';

const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function firstDayOfMonth(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

export type MealMenuEditorProps = {
  effectiveOrgId: string | null;
  staffId: string | undefined;
  staffRole: string | null | undefined;
  showPdf?: boolean;
  canEditPdfMeta?: boolean;
  headerSlot?: ReactNode;
  noOrgTitle?: string;
  noOrgMessage?: string;
};

export function MealMenuEditor({
  effectiveOrgId,
  staffId,
  staffRole,
  showPdf = false,
  canEditPdfMeta = true,
  headerSlot,
  noOrgTitle = 'Organizasyon gerekli',
  noOrgMessage = 'Hesabınıza otel atanmış olmalı.',
}: MealMenuEditorProps) {
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [notifyDaily, setNotifyDaily] = useState(true);
  const [daysMap, setDaysMap] = useState<Record<string, MealFields>>({});
  const [selectedYmd, setSelectedYmd] = useState<string>('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printerMailLoading, setPrinterMailLoading] = useState(false);
  const [pdfApproverName, setPdfApproverName] = useState(DEFAULT_MEAL_MENU_PDF_APPROVER);
  const [pdfFooterNote, setPdfFooterNote] = useState(DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);

  const todayYmd = toLocalYmd(new Date());
  const currentMonthStart = useMemo(() => monthStartDate(new Date()), []);

  const editableKeys = useMemo(
    () => editableMealDayKeys(viewMonth, todayYmd),
    [viewMonth, todayYmd]
  );
  const pastMonth = useMemo(() => isPastMealMonth(viewMonth, todayYmd), [viewMonth, todayYmd]);
  const canGoPrevMonth = viewMonth.getTime() > currentMonthStart.getTime();

  useEffect(() => {
    if (!effectiveOrgId) {
      setOrgName(null);
      return;
    }
    supabase
      .from('organizations')
      .select('name')
      .eq('id', effectiveOrgId)
      .maybeSingle()
      .then(({ data }) => setOrgName((data as { name?: string } | null)?.name ?? null));
  }, [effectiveOrgId]);

  const periodLabel = `${MONTHS_TR[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  const periodMonthStr = firstDayOfMonth(viewMonth);

  const pickDefaultYmd = useCallback(
    (keys: string[]) => {
      if (!keys.length) return '';
      const monthPrefix = `${viewMonth.getFullYear()}-${String(viewMonth.getMonth() + 1).padStart(2, '0')}`;
      if (todayYmd.startsWith(monthPrefix) && keys.includes(todayYmd)) return todayYmd;
      return keys[0];
    },
    [viewMonth, todayYmd]
  );

  const load = useCallback(async () => {
    if (!effectiveOrgId) {
      setMenuId(null);
      setDaysMap({});
      return;
    }
    try {
      const { menu, days } = await fetchMealMenuForMonth(effectiveOrgId, viewMonth);
      if (!menu) {
        setMenuId(null);
        setNotifyDaily(true);
        setDaysMap({});
        setPdfApproverName(DEFAULT_MEAL_MENU_PDF_APPROVER);
        setPdfFooterNote(DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);
        return;
      }

      setMenuId(menu.id);
      setNotifyDaily(!!menu.notify_daily);
      setPdfApproverName(menu.pdf_approver_name?.trim() || DEFAULT_MEAL_MENU_PDF_APPROVER);
      setPdfFooterNote(menu.pdf_footer_note?.trim() || DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);

      const keys = editableMealDayKeys(viewMonth, todayYmd);
      const map = buildEmptyDaysMap(keys);
      for (const r of days) {
        const d = r.meal_date.slice(0, 10);
        if (map[d]) {
          map[d] = {
            breakfast: r.breakfast ?? '',
            lunch: r.lunch ?? '',
            dinner: r.dinner ?? '',
          };
        }
      }
      setDaysMap(map);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yüklenemedi');
      setMenuId(null);
      setDaysMap({});
    }
  }, [effectiveOrgId, viewMonth, todayYmd]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    const keys = editableMealDayKeys(viewMonth, todayYmd);
    if (!keys.length) {
      setSelectedYmd('');
      return;
    }
    const focusYmd = pickDefaultYmd(keys);
    setSelectedYmd((prev) => (prev && keys.includes(prev) ? prev : focusYmd));
  }, [periodMonthStr, todayYmd, viewMonth, pickDefaultYmd]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const createMenu = async (): Promise<boolean> => {
    if (!effectiveOrgId || !staffId) return false;
    if (editableKeys.length === 0) {
      Alert.alert(
        'Tarih',
        pastMonth
          ? 'Geçmiş aylar için menü oluşturulamaz. Bugün ve sonrası için ileri bir ay seçin.'
          : 'Bu ayda bugünden sonra düzenlenecek gün kalmadı.'
      );
      return false;
    }
    try {
      const { data, error } = await supabase
        .from('staff_meal_menus')
        .insert({
          organization_id: effectiveOrgId,
          period_month: periodMonthStr,
          title: `${periodLabel} yemek listesi`,
          notify_daily: true,
        })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      setMenuId(data.id);
      setNotifyDaily(true);
      setDaysMap(buildEmptyDaysMap(editableKeys));
      const first = editableKeys[0];
      setSelectedYmd(first ?? '');
      return true;
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Oluşturulamadı');
      return false;
    }
  };

  const saveDays = async () => {
    if (!menuId) return;
    if (editableKeys.length === 0) {
      Alert.alert('Kayıt yok', 'Bugün ve sonrası için düzenlenecek gün bulunmuyor.');
      return;
    }
    setSaving(true);
    try {
      const rows = editableKeys.map((meal_date) => {
        const v = daysMap[meal_date] ?? { breakfast: '', lunch: '', dinner: '' };
        return {
          menu_id: menuId,
          meal_date,
          breakfast: v.breakfast.trim() || null,
          lunch: v.lunch.trim() || null,
          dinner: v.dinner.trim() || null,
        };
      });

      const { error } = await supabase.from('staff_meal_menu_days').upsert(rows, {
        onConflict: 'menu_id,meal_date',
      });
      if (error) throw new Error(error.message);

      const { error: metaErr } = await supabase
        .from('staff_meal_menus')
        .update({
          pdf_approver_name: pdfApproverName.trim() || DEFAULT_MEAL_MENU_PDF_APPROVER,
          pdf_footer_note: pdfFooterNote.trim() || DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE,
        })
        .eq('id', menuId);
      if (metaErr) throw new Error(metaErr.message);

      invalidateStaffMealMenuCache(effectiveOrgId ?? undefined);
      Alert.alert('Kaydedildi', 'Aylık yemek listesi güncellendi.');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const toggleNotify = async (value: boolean) => {
    setNotifyDaily(value);
    if (!menuId) return;
    const { error } = await supabase.from('staff_meal_menus').update({ notify_daily: value }).eq('id', menuId);
    if (error) {
      Alert.alert('Hata', error.message);
      setNotifyDaily(!value);
    }
  };

  const shiftMonth = (delta: number) => {
    if (delta < 0 && !canGoPrevMonth) return;
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  const sortedDayKeys = useMemo(() => editableKeys.filter((k) => k in daysMap).sort(), [editableKeys, daysMap]);
  const stats = useMemo(() => menuStatsFromDaysMap(daysMap, todayYmd), [daysMap, todayYmd]);

  const selectedIndex = sortedDayKeys.indexOf(selectedYmd);
  const goPrevDay = () => {
    if (selectedIndex > 0) setSelectedYmd(sortedDayKeys[selectedIndex - 1]);
  };
  const goNextDay = () => {
    if (selectedIndex >= 0 && selectedIndex < sortedDayKeys.length - 1) {
      setSelectedYmd(sortedDayKeys[selectedIndex + 1]);
    }
  };

  const dayChips = useMemo(
    () =>
      sortedDayKeys.map((ymd) => ({
        ymd,
        hasContent: countFilledSlots(daysMap[ymd] ?? { breakfast: '', lunch: '', dinner: '' }) > 0,
        isToday: ymd === todayYmd,
        isPast: ymd < todayYmd,
        isFuture: ymd > todayYmd,
      })),
    [sortedDayKeys, daysMap, todayYmd]
  );

  const selectedFields = daysMap[selectedYmd] ?? { breakfast: '', lunch: '', dinner: '' };

  const buildPdfPayload = async (): Promise<{
    hotelName: string;
    periodLabel: string;
    approverName: string;
    footerNote: string;
    days: MealMenuPdfDay[];
  }> => {
    if (!menuId) throw new Error('Menü bulunamadı');
    const { data: dayRows, error: dayErr } = await supabase
      .from('staff_meal_menu_days')
      .select('meal_date, breakfast, lunch, dinner')
      .eq('menu_id', menuId)
      .order('meal_date', { ascending: true });
    if (dayErr) throw new Error(dayErr.message);

    const byYmd = new Map<string, MealFields>();
    for (const r of dayRows ?? []) {
      const ymd = (r as { meal_date: string }).meal_date.slice(0, 10);
      byYmd.set(ymd, {
        breakfast: (r as { breakfast?: string | null }).breakfast ?? '',
        lunch: (r as { lunch?: string | null }).lunch ?? '',
        dinner: (r as { dinner?: string | null }).dinner ?? '',
      });
    }
    for (const [ymd, fields] of Object.entries(daysMap)) {
      byYmd.set(ymd, fields);
    }
    const pdfDays: MealMenuPdfDay[] = [...byYmd.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([ymd, fields]) => ({ ymd, fields }));

    return {
      hotelName: (orgName ?? '').trim() || 'Otel',
      periodLabel,
      approverName: pdfApproverName,
      footerNote: pdfFooterNote,
      days: pdfDays,
    };
  };

  const exportMonthPdf = async () => {
    if (!menuId || !showPdf) return;
    setPdfLoading(true);
    try {
      const { exportMealMenuPdf } = await import('@/lib/mealMenuPdf');
      await exportMealMenuPdf(await buildPdfPayload());
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    } finally {
      setPdfLoading(false);
    }
  };

  const sendMonthPdfToPrinter = async () => {
    if (!menuId || !showPdf) return;
    setPrinterMailLoading(true);
    try {
      const payload = await buildPdfPayload();
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

  const handleAiApply = (nextMap: Record<string, MealFields>, _count: number) => {
    setDaysMap((prev) => ({ ...prev, ...nextMap }));
  };

  const monthSubtitle = orgName ? orgName : undefined;

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        {headerSlot}

        <MealMonthNavigator
          periodLabel={periodLabel}
          onPrev={() => shiftMonth(-1)}
          onNext={() => shiftMonth(1)}
          palette={adminMealPalette}
          subtitle={monthSubtitle}
          prevDisabled={!canGoPrevMonth}
        />

        {!pastMonth && editableKeys.length > 0 ? (
          <Text style={styles.dateHint}>
            Gün şeridinden seçin veya oklarla gezinin. AI ile toplu doldurup tek tek düzenleyin.
          </Text>
        ) : null}

        {!effectiveOrgId ? (
          <MealMenuEmptyState icon="business-outline" title={noOrgTitle} message={noOrgMessage} palette={adminMealPalette} />
        ) : loading ? (
          <ActivityIndicator style={{ marginTop: 24 }} color={adminTheme.colors.primary} />
        ) : pastMonth ? (
          <MealMenuEmptyState
            icon="calendar-clear-outline"
            title="Geçmiş ay"
            message="Bu ay tamamen geçmişte kaldı. Menü yalnızca bugün ve sonrası için oluşturulur; ileri veya içinde bulunduğunuz ayı seçin."
            palette={adminMealPalette}
          />
        ) : editableKeys.length === 0 ? (
          <MealMenuEmptyState
            icon="calendar-outline"
            title="Düzenlenecek gün yok"
            message="Bu ayda bugünden sonra kayıt yapılacak gün kalmadı."
            palette={adminMealPalette}
          />
        ) : !menuId ? (
          <>
            {effectiveOrgId ? (
              <MealMenuAiAssistant
                organizationId={effectiveOrgId}
                organizationName={orgName}
                periodMonth={periodMonthStr}
                editableDates={editableKeys}
                todayYmd={todayYmd}
                daysMap={buildEmptyDaysMap(editableKeys)}
                onApply={handleAiApply}
                onFocusDate={(ymd) => setSelectedYmd(ymd)}
                onEnsureMenu={createMenu}
              />
            ) : null}
            <MealMenuEmptyState
              icon="restaurant-outline"
              title="Bu ay için menü yok"
              message={`${editableKeys.length} gün için menü oluşturun veya yukarıdaki AI ile doğrudan hazırlayın.`}
              palette={adminMealPalette}
              action={
                <TouchableOpacity style={styles.createBtn} onPress={() => void createMenu()} activeOpacity={0.85}>
                  <Ionicons name="add-circle-outline" size={20} color="#fff" />
                  <Text style={styles.createBtnText}>Boş menü oluştur</Text>
                </TouchableOpacity>
              }
            />
          </>
        ) : (
          <>
            <MealMenuStatsStrip
              mode="admin"
              filledDays={stats.filledDays}
              partialDays={stats.partialDays}
              totalDays={stats.totalDays}
              palette={adminMealPalette}
            />

            {effectiveOrgId ? (
              <MealMenuAiAssistant
                organizationId={effectiveOrgId}
                organizationName={orgName}
                periodMonth={periodMonthStr}
                editableDates={editableKeys}
                todayYmd={todayYmd}
                daysMap={daysMap}
                onApply={handleAiApply}
                onFocusDate={setSelectedYmd}
              />
            ) : null}

            <MealMonthDayPicker
              days={dayChips}
              selectedYmd={selectedYmd}
              onSelect={setSelectedYmd}
              primaryColor={adminMealPalette.primary}
              mutedColor={adminMealPalette.textMuted}
              borderColor={adminMealPalette.border}
              compact
            />

            {selectedYmd ? (
              <MealDayEditorCard
                compact
                ymd={selectedYmd}
                fields={selectedFields}
                isToday={selectedYmd === todayYmd}
                onChange={(next) => setDaysMap((m) => ({ ...m, [selectedYmd]: next }))}
                palette={adminMealPalette}
                onPrevDay={goPrevDay}
                onNextDay={goNextDay}
                prevDisabled={selectedIndex <= 0}
                nextDisabled={selectedIndex < 0 || selectedIndex >= sortedDayKeys.length - 1}
              />
            ) : null}

            <MealCollapsibleSection
              title="Bildirim & belge"
              subtitle={notifyDaily ? 'Sabah bildirimi açık' : 'Sabah bildirimi kapalı'}
              icon="options-outline"
              expanded={settingsOpen}
              onToggle={() => setSettingsOpen((v) => !v)}
              palette={adminMealPalette}
            >
              <MealNotifyCard
                compact
                value={notifyDaily}
                onValueChange={toggleNotify}
                palette={adminMealPalette}
              />
              {showPdf ? (
                <>
                  <MealMenuPdfSettingsCard
                    compact
                    approverName={pdfApproverName}
                    footerNote={pdfFooterNote}
                    onApproverChange={setPdfApproverName}
                    onFooterNoteChange={setPdfFooterNote}
                    editable={canEditPdfMeta}
                  />
                  <MealPdfActionRow
                    pdfLoading={pdfLoading}
                    printerMailLoading={printerMailLoading}
                    onPdf={exportMonthPdf}
                    onPrinterMail={sendMonthPdfToPrinter}
                    showPrinterMail={showPdf}
                    palette={adminMealPalette}
                  />
                </>
              ) : null}
            </MealCollapsibleSection>
          </>
        )}
      </ScrollView>

      {menuId && !loading && editableKeys.length > 0 ? (
        <View style={[styles.stickyBar, { borderColor: adminMealPalette.border }]}>
          <MealSaveBar saving={saving} onSave={saveDays} palette={adminMealPalette} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  content: { padding: 12, paddingBottom: 72 },
  dateHint: {
    fontSize: 11,
    color: adminTheme.colors.textMuted,
    lineHeight: 16,
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  stickyBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
  },
  createBtn: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
