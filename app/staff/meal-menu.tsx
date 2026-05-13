import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { formatTrFullDayLabelFromYmd, toLocalYmd } from '@/lib/mealMenuDate';

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

type DayRow = { meal_date: string; breakfast: string | null; lunch: string | null; dinner: string | null };

export default function StaffMealMenuScreen() {
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const [viewMonth, setViewMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [menuId, setMenuId] = useState<string | null>(null);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(true);

  const periodLabel = `${MONTHS_TR[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  const periodMonthStr = firstDayOfMonth(viewMonth);

  const todayStr = toLocalYmd(new Date());

  const load = useCallback(async () => {
    if (!staff?.organization_id) {
      setMenuId(null);
      setRows([]);
      return;
    }
    const { data: menu } = await supabase
      .from('staff_meal_menus')
      .select('id')
      .eq('organization_id', staff.organization_id)
      .eq('period_month', periodMonthStr)
      .maybeSingle();

    if (!menu) {
      setMenuId(null);
      setRows([]);
      return;
    }

    setMenuId(menu.id);
    const { data: dayRows, error } = await supabase
      .from('staff_meal_menu_days')
      .select('meal_date, breakfast, lunch, dinner')
      .eq('menu_id', menu.id)
      .order('meal_date', { ascending: true });

    if (error) {
      Alert.alert('Hata', error.message);
      setRows([]);
      return;
    }

    const dim = daysInMonth(viewMonth);
    const byDate: Record<string, DayRow> = {};
    for (const r of (dayRows ?? []) as DayRow[]) {
      const key = r.meal_date.slice(0, 10);
      byDate[key] = r;
    }
    const merged: DayRow[] = [];
    for (let day = 1; day <= dim; day++) {
      const key = `${viewMonth.getFullYear()}-${pad2(viewMonth.getMonth() + 1)}-${pad2(day)}`;
      merged.push(
        byDate[key] ?? {
          meal_date: key,
          breakfast: null,
          lunch: null,
          dinner: null,
        }
      );
    }
    setRows(merged);
  }, [staff?.organization_id, periodMonthStr, viewMonth]);

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

  /** Bugünden önceki günler listelenmez (tarihi geçen menü otomatik düşer). */
  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      const ymd = r.meal_date.slice(0, 10);
      if (ymd < todayStr) return false;
      const hasAny = !!(r.breakfast?.trim() || r.lunch?.trim() || r.dinner?.trim());
      return hasAny;
    });
  }, [rows, todayStr]);

  const shiftMonth = (delta: number) => {
    setViewMonth((d) => new Date(d.getFullYear(), d.getMonth() + delta, 1));
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.monthBar}>
        <TouchableOpacity onPress={() => shiftMonth(-1)} style={styles.monthNav} hitSlop={12}>
          <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
        <Text style={styles.monthTitle}>{periodLabel}</Text>
        <TouchableOpacity onPress={() => shiftMonth(1)} style={styles.monthNav} hitSlop={12}>
          <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={theme.colors.primary} />
      ) : !staff?.organization_id ? (
        <Text style={styles.empty}>Organizasyon atanmadı.</Text>
      ) : !menuId ? (
        <Text style={styles.empty}>Bu ay için yönetimden henüz menü girilmemiş.</Text>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}>
          {visibleRows.map((r) => {
            const ymd = r.meal_date.slice(0, 10);
            const isToday = ymd === todayStr;
            const titleLine = formatTrFullDayLabelFromYmd(ymd);
            return (
              <View key={ymd} style={[styles.card, isToday && styles.cardToday]}>
                <Text style={styles.dayHead}>
                  {titleLine}
                  {isToday ? ' · Bugün' : ''}
                </Text>
                {!!r.breakfast?.trim() && (
                  <Text style={styles.line}>
                    <Text style={styles.lab}>Kahvaltı: </Text>
                    {r.breakfast}
                  </Text>
                )}
                {!!r.lunch?.trim() && (
                  <Text style={styles.line}>
                    <Text style={styles.lab}>Öğle: </Text>
                    {r.lunch}
                  </Text>
                )}
                {!!r.dinner?.trim() && (
                  <Text style={styles.line}>
                    <Text style={styles.lab}>Akşam: </Text>
                    {r.dinner}
                  </Text>
                )}
              </View>
            );
          })}
          {visibleRows.length === 0 ? (
            <Text style={styles.empty}>
              Bu ay için bugünden itibaren gösterilecek yemek satırı yok (geçmiş günler veya boş günler listelenmez).
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  monthNav: { padding: 8 },
  monthTitle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
  scroll: { flex: 1, paddingHorizontal: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardToday: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: '#f0f9ff',
  },
  dayHead: { fontSize: 15, fontWeight: '700', color: theme.colors.primary, marginBottom: 8 },
  line: { fontSize: 15, color: theme.colors.text, marginBottom: 6, lineHeight: 22 },
  lab: { fontWeight: '600', color: theme.colors.textSecondary },
  empty: { textAlign: 'center', color: theme.colors.textMuted, marginTop: 32, paddingHorizontal: 24, lineHeight: 22 },
});
