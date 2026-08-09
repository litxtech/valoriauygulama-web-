import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Platform,
} from 'react-native';
import { printToLocalPdfFile } from '@/lib/persistExpoPrintPdf';
import * as Sharing from 'expo-sharing';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { formatDateShort } from '@/lib/date';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';

type CategorySum = { category_id: string; category_name: string; total: number; items: { expense_date: string; staff_name: string; description: string | null; amount: number }[] };

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) + ' ₺';
}

function getMonthYear(): { month: number; year: number } {
  const d = new Date();
  return { month: d.getMonth(), year: d.getFullYear() };
}

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

export default function ExpensesByCategoryScreen() {
  const [data, setData] = useState<CategorySum[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(getMonthYear());
  const [mailSending, setMailSending] = useState(false);

  const load = useCallback(async () => {
    const start = new Date(period.year, period.month, 1).toISOString().slice(0, 10);
    const end = new Date(period.year, period.month + 1, 0).toISOString().slice(0, 10);
    const { data: rows } = await supabase
      .from('staff_expenses')
      .select('id, amount, description, expense_date, category_id, category:category_id(name), staff:staff_id(full_name)')
      .eq('status', 'approved')
      .gte('expense_date', start)
      .lte('expense_date', end)
      .order('expense_date', { ascending: false });
    const list = (rows ?? []) as { id: string; amount: number; description: string | null; expense_date: string; category_id: string; category: { name: string } | null; staff: { full_name: string | null } | null }[];
    const byCat = new Map<string, CategorySum>();
    for (const r of list) {
      const name = r.category?.name ?? 'Diğer';
      if (!byCat.has(r.category_id)) {
        byCat.set(r.category_id, { category_id: r.category_id, category_name: name, total: 0, items: [] });
      }
      const rec = byCat.get(r.category_id)!;
      rec.total += Number(r.amount);
      rec.items.push({
        expense_date: r.expense_date,
        staff_name: r.staff?.full_name ?? '—',
        description: r.description,
        amount: Number(r.amount),
      });
    }
    setData(Array.from(byCat.values()).sort((a, b) => b.total - a.total));
    setLoading(false);
  }, [period.month, period.year]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  const exportCsv = useCallback(() => {
    const lines = ['Kategori,Tarih,Personel,Açıklama,Tutar'];
    for (const c of data) {
      for (const i of c.items) {
        lines.push(`"${c.category_name}","${i.expense_date}","${(i.staff_name || '').replace(/"/g, '""')}","${(i.description || '').replace(/"/g, '""')}",${i.amount}`);
      }
    }
    const csv = '\uFEFF' + lines.join('\n');
    if (Platform.OS === 'web') {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `harcama-kategori-${period.year}-${period.month + 1}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      Share.share({ message: csv, title: 'Harcama raporu (CSV)' }).catch(() => {});
    }
  }, [data, period]);

  const exportPdf = useCallback(async (mode: 'share' | 'mail' = 'share') => {
    const monthLabel = `${MONTH_NAMES[period.month]} ${period.year}`;
    let html = `
      <!DOCTYPE html><html><head><meta charset="utf-8"><style>
        body { font-family: sans-serif; padding: 20px; color: #333; }
        h1 { font-size: 18px; }
        h2 { font-size: 14px; margin-top: 16px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 12px; }
        th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
        th { background: #f5f5f5; }
        .total { font-weight: bold; }
      </style></head><body>
      <h1>VALORİA HOTEL – Kategori bazlı harcama – ${monthLabel}</h1>
      <p>Rapor tarihi: ${formatDateShort(new Date())}</p>
    `;
    const grandTotal = data.reduce((s, c) => s + c.total, 0);
    html += `<p><strong>Genel toplam: ${fmtMoney(grandTotal)}</strong></p>`;
    for (const c of data) {
      html += `<h2>${c.category_name} – Toplam: ${fmtMoney(c.total)}</h2><table><tr><th>Tarih</th><th>Personel</th><th>Açıklama</th><th>Tutar</th></tr>`;
      for (const i of c.items) {
        html += `<tr><td>${i.expense_date}</td><td>${(i.staff_name || '').replace(/</g, '&lt;')}</td><td>${(i.description || '').replace(/</g, '&lt;')}</td><td>${fmtMoney(i.amount)}</td></tr>`;
      }
      html += '</table>';
    }
    html += '</body></html>';
    try {
      const { uri } = await printToLocalPdfFile({ html });
      if (mode === 'mail') {
        await sendPdfToPrinterEmail({
          pdfUri: uri,
          subject: `Kategori Bazlı Harcama Raporu ${monthLabel}`,
          fileName: `harcama-kategori-${period.year}-${period.month + 1}.pdf`,
        });
        return;
      }
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: 'Harcama raporu (PDF)' });
    } catch (e) {
      console.warn('PDF export failed', e);
      if (mode === 'mail') throw e;
    }
  }, [data, period]);

  const prevMonth = () => {
    if (period.month === 0) setPeriod({ month: 11, year: period.year - 1 });
    else setPeriod({ ...period, month: period.month - 1 });
  };
  const nextMonth = () => {
    if (period.month === 11) setPeriod({ month: 0, year: period.year + 1 });
    else setPeriod({ ...period, month: period.month + 1 });
  };
  const monthLabel = `${MONTH_NAMES[period.month]} ${period.year}`;

  return (
    <View style={styles.container}>
      <View style={styles.periodRow}>
        <TouchableOpacity onPress={prevMonth} style={styles.periodBtn}>
          <Ionicons name="chevron-back" size={24} color={adminTheme.colors.text} />
        </TouchableOpacity>
        <Text style={styles.periodLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.periodBtn}>
          <Ionicons name="chevron-forward" size={24} color={adminTheme.colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color={adminTheme.colors.accent} style={styles.loader} />
        ) : (
          <>
            {data.map((c) => (
              <View key={c.category_id} style={styles.categoryBlock}>
                <Text style={styles.categoryTitle}>{c.category_name} – Toplam: {fmtMoney(c.total)}</Text>
                <View style={styles.itemList}>
                  {c.items.map((i, idx) => (
                    <View key={idx} style={styles.itemRow}>
                      <Text style={styles.itemDate}>{formatDateShort(i.expense_date)}</Text>
                      <Text style={styles.itemStaff} numberOfLines={1}>{i.staff_name}</Text>
                      <Text style={styles.itemAmount}>{fmtMoney(i.amount)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))}
            {data.length === 0 && <Text style={styles.empty}>Bu dönemde onaylanmış harcama yok.</Text>}
          </>
        )}

        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={exportCsv} activeOpacity={0.8}>
            <Ionicons name="download-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>Excel (CSV) indir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportBtn} onPress={exportPdf} activeOpacity={0.8}>
            <Ionicons name="document-text-outline" size={20} color={adminTheme.colors.accent} />
            <Text style={styles.exportBtnText}>PDF yazdır</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.exportBtn}
            onPress={async () => {
              setMailSending(true);
              try {
                await exportPdf('mail');
              } finally {
                setMailSending(false);
              }
            }}
            activeOpacity={0.8}
            disabled={mailSending}
          >
            {mailSending ? <ActivityIndicator size="small" color={adminTheme.colors.accent} /> : <Ionicons name="mail-outline" size={20} color={adminTheme.colors.accent} />}
            <Text style={styles.exportBtnText}>Yazıcı Mail</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  periodRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: adminTheme.colors.surface, borderBottomWidth: 1, borderBottomColor: adminTheme.colors.border },
  periodBtn: { padding: 8 },
  periodLabel: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  loader: { marginVertical: 24 },
  categoryBlock: { marginBottom: 20 },
  categoryTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8 },
  itemList: { backgroundColor: adminTheme.colors.surface, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.borderLight },
  itemDate: { width: 80, fontSize: 12, color: adminTheme.colors.textSecondary },
  itemStaff: { flex: 1, fontSize: 13, color: adminTheme.colors.text },
  itemAmount: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  empty: { fontSize: 14, color: adminTheme.colors.textMuted, textAlign: 'center', marginTop: 24 },
  exportRow: { flexDirection: 'row', gap: 12, marginTop: 24, justifyContent: 'center' },
  exportBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: adminTheme.colors.surface, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.border },
  exportBtnText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.accent },
});
