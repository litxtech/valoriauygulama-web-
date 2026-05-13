import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Switch,
  RefreshControl,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { escapeHtmlMealMenu, formatTrFullDayLabelFromYmd } from '@/lib/mealMenuDate';

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

function daysInMonth(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

type DayFields = { breakfast: string; lunch: string; dinner: string };

export default function AdminMealMenuScreen() {
  const staff = useAuthStore((s) => s.staff);
  const { selectedOrganizationId } = useAdminOrgStore();
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [notifyDaily, setNotifyDaily] = useState(true);
  const [daysMap, setDaysMap] = useState<Record<string, DayFields>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const effectiveOrgId = useMemo(() => {
    if (staff?.role === 'admin') {
      if (selectedOrganizationId === 'all') return null;
      return selectedOrganizationId;
    }
    return staff?.organization_id ?? null;
  }, [staff?.role, staff?.organization_id, selectedOrganizationId]);

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
      .select('id, notify_daily')
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
      return;
    }

    setMenuId(menu.id);
    setNotifyDaily(!!menu.notify_daily);

    const { data: dayRows, error: dayErr } = await supabase
      .from('staff_meal_menu_days')
      .select('meal_date, breakfast, lunch, dinner')
      .eq('menu_id', menu.id);

    if (dayErr) {
      Alert.alert('Hata', dayErr.message);
      return;
    }

    const map: Record<string, DayFields> = {};
    const dim = daysInMonth(viewMonth);
    for (let day = 1; day <= dim; day++) {
      const key = `${viewMonth.getFullYear()}-${pad2(viewMonth.getMonth() + 1)}-${pad2(day)}`;
      map[key] = { breakfast: '', lunch: '', dinner: '' };
    }
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
  }, [effectiveOrgId, periodMonthStr, viewMonth]);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const createMenu = async () => {
    if (!effectiveOrgId || !staff?.id) return;
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
      const dim = daysInMonth(viewMonth);
      const map: Record<string, DayFields> = {};
      for (let day = 1; day <= dim; day++) {
        const key = `${viewMonth.getFullYear()}-${pad2(viewMonth.getMonth() + 1)}-${pad2(day)}`;
        map[key] = { breakfast: '', lunch: '', dinner: '' };
      }
      setDaysMap(map);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Oluşturulamadı');
    }
  };

  const saveDays = async () => {
    if (!menuId) return;
    setSaving(true);
    try {
      const rows = Object.entries(daysMap).map(([meal_date, v]) => ({
        menu_id: menuId,
        meal_date,
        breakfast: v.breakfast.trim() || null,
        lunch: v.lunch.trim() || null,
        dinner: v.dinner.trim() || null,
      }));

      const { error } = await supabase.from('staff_meal_menu_days').upsert(rows, {
        onConflict: 'menu_id,meal_date',
      });
      if (error) throw new Error(error.message);
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
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  const sortedDayKeys = useMemo(() => Object.keys(daysMap).sort(), [daysMap]);

  const exportMonthPdf = async () => {
    if (!menuId || !effectiveOrgId || staff?.role !== 'admin') return;
    setPdfLoading(true);
    try {
      const hotel = escapeHtmlMealMenu((orgName ?? '').trim() || 'Otel');
      const monthTitle = escapeHtmlMealMenu(periodLabel);
      const tableRows = sortedDayKeys
        .map((ymd) => {
          const f = daysMap[ymd] ?? { breakfast: '', lunch: '', dinner: '' };
          const label = escapeHtmlMealMenu(formatTrFullDayLabelFromYmd(ymd));
          const b = f.breakfast.trim() ? escapeHtmlMealMenu(f.breakfast) : '—';
          const l = f.lunch.trim() ? escapeHtmlMealMenu(f.lunch) : '—';
          const di = f.dinner.trim() ? escapeHtmlMealMenu(f.dinner) : '—';
          return `<tr><td style="vertical-align:top;padding:8px;border:1px solid #e5e7eb;font-weight:600;width:210px">${label}</td><td style="padding:8px;border:1px solid #e5e7eb;font-size:13px;line-height:1.45"><strong>Kahvaltı:</strong> ${b}<br/><strong>Öğle:</strong> ${l}<br/><strong>Akşam:</strong> ${di}</td></tr>`;
        })
        .join('');
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Aylık yemek listesi</title></head><body style="font-family:system-ui,sans-serif;color:#111827;padding:12px">
<h1 style="font-size:20px;margin:0 0 4px">${hotel}</h1>
<h2 style="font-size:16px;margin:0 0 16px;color:#374151;font-weight:600">Aylık yemek listesi — ${monthTitle}</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${tableRows}</table>
<p style="margin-top:16px;font-size:11px;color:#6b7280">Valoria — Personel yemek menüsü</p>
</body></html>`;
      const { uri } = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
      });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Aylık yemek listesi PDF' });
      } else {
        Alert.alert('PDF hazır', uri);
      }
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.orgRow}>
        <AdminOrganizationPicker canUseAll={staff?.role === 'admin'} ownOrganizationId={staff?.organization_id} />
      </View>

      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthNav} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{periodLabel}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthNav} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={adminTheme.colors.primary} />
        </TouchableOpacity>
      </View>

      {!effectiveOrgId ? (
        <Text style={styles.hint}>
          {staff?.role === 'admin'
            ? 'Menüyü düzenlemek için üstten tek bir otel seçin (Tüm Oteller ile kayıt yapılamaz).'
            : 'Hesabınıza organizasyon atanmış olmalı.'}
        </Text>
      ) : loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={adminTheme.colors.primary} />
      ) : !menuId ? (
        <View style={styles.card}>
          <Text style={styles.cardText}>Bu ay için henüz menü yok. Personelin görmesi ve günlük bildirim için oluşturun.</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={createMenu}>
            <Text style={styles.primaryBtnText}>Bu ay için menü oluştur</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.notifyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.notifyTitle}>Günlük bildirim</Text>
              <Text style={styles.notifySub}>Her sabah (≈08:00 TR) personelin telefonuna bugünün yemekleri gider.</Text>
            </View>
            <Switch value={notifyDaily} onValueChange={toggleNotify} trackColor={{ false: '#ccc', true: adminTheme.colors.primary }} />
          </View>

          {staff?.role === 'admin' ? (
            <TouchableOpacity
              style={[styles.pdfBtn, pdfLoading && styles.primaryBtnDisabled]}
              onPress={exportMonthPdf}
              disabled={pdfLoading}
              activeOpacity={0.85}
            >
              {pdfLoading ? (
                <ActivityIndicator color={adminTheme.colors.primary} />
              ) : (
                <>
                  <Ionicons name="document-text-outline" size={22} color={adminTheme.colors.primary} />
                  <Text style={styles.pdfBtnText}>PDF indir (tüm ay — seçili otel)</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]} onPress={saveDays} disabled={saving}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Tüm günleri kaydet</Text>
            )}
          </TouchableOpacity>

          {sortedDayKeys.map((ymd) => {
            const fields = daysMap[ymd] ?? { breakfast: '', lunch: '', dinner: '' };
            return (
              <View key={ymd} style={styles.dayCard}>
                <Text style={styles.dayTitle}>{formatTrFullDayLabelFromYmd(ymd)}</Text>
                <Text style={styles.fieldLabel}>Kahvaltı</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Örn. Peynir, zeytin, çay"
                  placeholderTextColor={adminTheme.colors.textMuted}
                  value={fields.breakfast}
                  onChangeText={(t) =>
                    setDaysMap((m) => ({ ...m, [ymd]: { ...fields, breakfast: t } }))
                  }
                  multiline
                />
                <Text style={styles.fieldLabel}>Öğle</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Örn. Mercimek çorbası, pilav, salata"
                  placeholderTextColor={adminTheme.colors.textMuted}
                  value={fields.lunch}
                  onChangeText={(t) =>
                    setDaysMap((m) => ({ ...m, [ymd]: { ...fields, lunch: t } }))
                  }
                  multiline
                />
                <Text style={styles.fieldLabel}>Akşam</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Örn. Izgara tavuk, makarna"
                  placeholderTextColor={adminTheme.colors.textMuted}
                  value={fields.dinner}
                  onChangeText={(t) =>
                    setDaysMap((m) => ({ ...m, [ymd]: { ...fields, dinner: t } }))
                  }
                  multiline
                />
              </View>
            );
          })}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 16, paddingBottom: 40 },
  orgRow: { marginBottom: 12 },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  monthNav: { padding: 8 },
  monthTitle: { fontSize: 17, fontWeight: '700', color: adminTheme.colors.text },
  hint: { color: adminTheme.colors.textMuted, textAlign: 'center', marginTop: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  cardText: { color: adminTheme.colors.textSecondary, marginBottom: 14, lineHeight: 22 },
  notifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    gap: 12,
  },
  notifyTitle: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  notifySub: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, lineHeight: 18 },
  primaryBtn: {
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  primaryBtnDisabled: { opacity: 0.7 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: adminTheme.colors.primary,
  },
  pdfBtnText: { color: adminTheme.colors.primary, fontSize: 15, fontWeight: '700' },
  dayCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  dayTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.primary, marginBottom: 10 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    borderRadius: 10,
    padding: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    minHeight: 44,
    marginBottom: 10,
    textAlignVertical: 'top',
  },
});
