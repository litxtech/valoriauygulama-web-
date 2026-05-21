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
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { formatTrFullDayLabelFromYmd, toLocalYmd } from '@/lib/mealMenuDate';
import {
  DEFAULT_MEAL_MENU_PDF_APPROVER,
  DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE,
  exportMealMenuPdf,
  generateMealMenuPdfFile,
  sendMealMenuPdfToPrinterEmail,
  type MealMenuPdfDay,
} from '@/lib/mealMenuPdf';
import {
  groupDayKeysByWeek,
  menuStatsFromDaysMap,
  weekKeyForYmd,
  type MealFields,
  dayFillStatus,
  editableMealDayKeys,
  buildEmptyDaysMap,
  isPastMealMonth,
  monthStartDate,
} from '@/lib/mealMenuUi';
import {
  MealMonthNavigator,
  MealMenuStatsStrip,
  MealWeekSectionHeader,
  MealDayEditorCard,
  MealMenuEmptyState,
  MealAdminActionBar,
  MealNotifyCard,
  adminMealPalette,
} from '@/components/mealMenu/MealMenuUi';
import { MealMenuPdfSettingsCard } from '@/components/mealMenu/MealMenuPdfSettingsCard';

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
  /** PDF alt not / hazırlayan düzenlenebilir (admin veya yemek listesi yetkisi) */
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [printerMailLoading, setPrinterMailLoading] = useState(false);
  const [pdfApproverName, setPdfApproverName] = useState(DEFAULT_MEAL_MENU_PDF_APPROVER);
  const [pdfFooterNote, setPdfFooterNote] = useState(DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE);
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(() => new Set());

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

  const load = useCallback(async () => {
    if (!effectiveOrgId) {
      setMenuId(null);
      setDaysMap({});
      return;
    }
    const { data: menu, error: menuErr } = await supabase
      .from('staff_meal_menus')
      .select('id, notify_daily, pdf_approver_name, pdf_footer_note')
      .eq('organization_id', effectiveOrgId)
      .eq('period_month', periodMonthStr)
      .maybeSingle();

    if (menuErr) {
      Alert.alert('Hata', menuErr.message);
      setMenuId(null);
      setDaysMap({});
      return;
    }

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
    setPdfApproverName(
      (menu as { pdf_approver_name?: string | null }).pdf_approver_name?.trim() || DEFAULT_MEAL_MENU_PDF_APPROVER
    );
    setPdfFooterNote(
      (menu as { pdf_footer_note?: string | null }).pdf_footer_note?.trim() || DEFAULT_MEAL_MENU_PDF_FOOTER_NOTE
    );

    const { data: dayRows, error: dayErr } = await supabase
      .from('staff_meal_menu_days')
      .select('meal_date, breakfast, lunch, dinner')
      .eq('menu_id', menu.id);

    if (dayErr) {
      Alert.alert('Hata', dayErr.message);
      return;
    }

    const keys = editableMealDayKeys(viewMonth, todayYmd);
    const map = buildEmptyDaysMap(keys);
    for (const r of dayRows ?? []) {
      const d = (r as { meal_date: string; breakfast: string | null; lunch: string | null; dinner: string | null }).meal_date.slice(0, 10);
      if (map[d]) {
        map[d] = {
          breakfast: (r as { breakfast?: string | null }).breakfast ?? '',
          lunch: (r as { lunch?: string | null }).lunch ?? '',
          dinner: (r as { dinner?: string | null }).dinner ?? '',
        };
      }
    }
    setDaysMap(map);
  }, [effectiveOrgId, periodMonthStr, viewMonth, todayYmd]);

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
    const first = editableMealDayKeys(viewMonth, todayYmd)[0];
    if (first) setExpandedWeeks(new Set([weekKeyForYmd(first)]));
    else setExpandedWeeks(new Set());
  }, [periodMonthStr, todayYmd, viewMonth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const createMenu = async () => {
    if (!effectiveOrgId || !staffId) return;
    if (editableKeys.length === 0) {
      Alert.alert(
        'Tarih',
        pastMonth
          ? 'Geçmiş aylar için menü oluşturulamaz. Bugün ve sonrası için ileri bir ay seçin.'
          : 'Bu ayda bugünden sonra düzenlenecek gün kalmadı.'
      );
      return;
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
      setExpandedWeeks(new Set(first ? [weekKeyForYmd(first)] : []));
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Oluşturulamadı');
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
  const weekGroups = useMemo(() => groupDayKeysByWeek(sortedDayKeys), [sortedDayKeys]);
  const stats = useMemo(() => menuStatsFromDaysMap(daysMap, todayYmd), [daysMap, todayYmd]);

  const toggleWeek = (weekKey: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(weekKey)) next.delete(weekKey);
      else next.add(weekKey);
      return next;
    });
  };

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
      const uri = await generateMealMenuPdfFile(payload);
      await sendMealMenuPdfToPrinterEmail(payload, uri);
      Alert.alert('Gönderildi', 'Belge yazıcı e-posta adresine gönderildi.');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yazıcıya gönderilemedi');
    } finally {
      setPrinterMailLoading(false);
    }
  };

  const monthSubtitle = orgName ? orgName : undefined;

  return (
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
          Sadece bugün ({formatTrFullDayLabelFromYmd(todayYmd)}) ve sonraki günler listelenir. Geçmiş günler düzenlenemez.
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
        <MealMenuEmptyState
          icon="restaurant-outline"
          title="Bu ay için menü yok"
          message={`${editableKeys.length} gün için menü oluşturun (bugün ve sonrası). Personel uygulamada görür; sabah bildirimi açıksa günlük hatırlatma gider.`}
          palette={adminMealPalette}
          action={
            <TouchableOpacity style={styles.createBtn} onPress={createMenu} activeOpacity={0.85}>
              <Text style={styles.createBtnText}>Menü oluştur</Text>
            </TouchableOpacity>
          }
        />
      ) : (
        <>
          <MealMenuStatsStrip
            mode="admin"
            filledDays={stats.filledDays}
            partialDays={stats.partialDays}
            totalDays={stats.totalDays}
            palette={adminMealPalette}
          />

          <MealNotifyCard value={notifyDaily} onValueChange={toggleNotify} palette={adminMealPalette} />

          {showPdf ? (
            <MealMenuPdfSettingsCard
              approverName={pdfApproverName}
              footerNote={pdfFooterNote}
              onApproverChange={setPdfApproverName}
              onFooterNoteChange={setPdfFooterNote}
              editable={canEditPdfMeta}
            />
          ) : null}

          <MealAdminActionBar
            saving={saving}
            pdfLoading={pdfLoading}
            printerMailLoading={printerMailLoading}
            onSave={saveDays}
            onPdf={exportMonthPdf}
            onPrinterMail={sendMonthPdfToPrinter}
            showPdf={showPdf}
            showPrinterMail={showPdf}
            palette={adminMealPalette}
          />

          <Text style={styles.sectionHint}>
            Gün gün kahvaltı, öğle ve akşam yazın. Haftalara dokunarak açıp kapatabilirsiniz.
          </Text>

          {weekGroups.length === 0 ? (
            <MealMenuEmptyState
              icon="calendar-outline"
              title="Gösterilecek gün yok"
              message="Bu ayda bugünden itibaren düzenlenecek gün kalmadı."
              palette={adminMealPalette}
            />
          ) : null}

          {weekGroups.map((week) => {
            const filledInWeek = week.keys.filter(
              (k) => dayFillStatus(daysMap[k] ?? { breakfast: '', lunch: '', dinner: '' }) === 'full'
            ).length;
            const expanded = expandedWeeks.has(week.weekKey);
            return (
              <View key={week.weekKey} style={styles.weekBlock}>
                <MealWeekSectionHeader
                  label={week.label}
                  dayCount={week.keys.length}
                  filledCount={filledInWeek}
                  expanded={expanded}
                  onToggle={() => toggleWeek(week.weekKey)}
                  palette={adminMealPalette}
                />
                {expanded
                  ? week.keys.map((ymd) => {
                      const fields = daysMap[ymd] ?? { breakfast: '', lunch: '', dinner: '' };
                      return (
                        <MealDayEditorCard
                          key={ymd}
                          ymd={ymd}
                          fields={fields}
                          isToday={ymd === todayYmd}
                          onChange={(next) => setDaysMap((m) => ({ ...m, [ymd]: next }))}
                          palette={adminMealPalette}
                        />
                      );
                    })
                  : null}
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 48 },
  dateHint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    lineHeight: 18,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  sectionHint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginBottom: 8,
    lineHeight: 18,
  },
  weekBlock: { marginBottom: 4 },
  createBtn: {
    marginTop: 20,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  createBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
