import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import {
  fmtMoneyTry,
  MOVEMENT_KIND_LABELS,
  MOVEMENT_CATEGORY_LABELS,
  PAYMENT_METHOD_LABELS,
  movementSummaryLine,
  type FinanceMovementKind,
  type MovementPaymentMethod,
} from '@/lib/financeLedger';
import { formatDateShort } from '@/lib/date';

type Row = {
  id: string;
  kind: FinanceMovementKind;
  amount: number;
  movement_date: string;
  payment_method: MovementPaymentMethod;
  category: string;
  counterparty_name: string | null;
  description: string;
  receipt_urls: string[] | null;
  created_at: string;
  counterparty?: { name: string } | null;
  project?: { name: string } | null;
  creator?: { full_name: string | null } | null;
};

export default function AccountingMovementDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('finance_movements')
      .select(
        `
        id,
        kind,
        amount,
        movement_date,
        payment_method,
        category,
        counterparty_name,
        description,
        receipt_urls,
        created_at,
        counterparty:counterparty_id(name),
        project:project_id(name),
        creator:created_by_staff_id(full_name)
      `
      )
      .eq('id', id)
      .single();
    if (error || !data) setRow(null);
    else setRow(data as unknown as Row);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const deleteRow = () => {
    Alert.alert('Sil', 'Bu hareket silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('finance_movements').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else router.replace('/admin/accounting/movements' as never);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!row) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Kayıt bulunamadı.</Text>
      </View>
    );
  }

  const who = row.counterparty?.name?.trim() || row.counterparty_name?.trim() || '—';
  const receipts = Array.isArray(row.receipt_urls) ? row.receipt_urls : [];

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backHub} onPress={() => router.push('/admin/accounting')} activeOpacity={0.8}>
        <Ionicons name="calculator-outline" size={18} color={adminTheme.colors.primary} />
        <Text style={styles.backHubText}>Muhasebe</Text>
      </TouchableOpacity>

      <AdminCard>
        <View
          style={[
            styles.kindBanner,
            row.kind === 'income' ? styles.kindIncome : styles.kindExpense,
          ]}
        >
          <Text style={styles.kindBannerText}>{MOVEMENT_KIND_LABELS[row.kind]}</Text>
          <Text style={styles.kindAmt}>{fmtMoneyTry(Number(row.amount))}</Text>
        </View>
        <Text style={styles.summary}>
          {movementSummaryLine({
            kind: row.kind,
            amount: Number(row.amount),
            counterpartyLabel: who,
            category: row.category,
          })}
        </Text>
        <View style={styles.metaGrid}>
          <Text style={styles.metaLabel}>Tarih</Text>
          <Text style={styles.metaVal}>{formatDateShort(row.movement_date)}</Text>
          <Text style={styles.metaLabel}>Ödeme</Text>
          <Text style={styles.metaVal}>{PAYMENT_METHOD_LABELS[row.payment_method]}</Text>
          <Text style={styles.metaLabel}>Kategori</Text>
          <Text style={styles.metaVal}>{MOVEMENT_CATEGORY_LABELS[row.category] ?? row.category}</Text>
          <Text style={styles.metaLabel}>Cari</Text>
          <Text style={styles.metaVal}>{who}</Text>
          {row.project?.name ? (
            <>
              <Text style={styles.metaLabel}>Proje</Text>
              <Text style={styles.metaVal}>{row.project.name}</Text>
            </>
          ) : null}
          {row.description?.trim() ? (
            <>
              <Text style={styles.metaLabel}>Açıklama</Text>
              <Text style={styles.metaVal}>{row.description.trim()}</Text>
            </>
          ) : null}
          <Text style={styles.metaLabel}>Kayıt</Text>
          <Text style={styles.metaVal}>
            {formatDateShort(row.created_at)}
            {row.creator?.full_name ? ` · ${row.creator.full_name}` : ''}
          </Text>
        </View>
      </AdminCard>

      {receipts.length > 0 ? (
        <AdminCard>
          <Text style={styles.sectionTitle}>Fiş / belge</Text>
          <View style={styles.thumbs}>
            {receipts.map((url) => (
              <TouchableOpacity key={url} onPress={() => Linking.openURL(url)}>
                <Image source={{ uri: url }} style={styles.thumb} />
              </TouchableOpacity>
            ))}
          </View>
        </AdminCard>
      ) : (
        <AdminCard>
          <Text style={styles.noReceipt}>Fiş eklenmemiş (opsiyonel).</Text>
        </AdminCard>
      )}

      <TouchableOpacity style={styles.delBtn} onPress={deleteRow}>
        <Ionicons name="trash-outline" size={18} color="#dc2626" />
        <Text style={styles.delBtnText}>Kaydı sil</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  empty: { color: adminTheme.colors.textMuted },
  backHub: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backHubText: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
  kindBanner: { borderRadius: 10, padding: 16, marginBottom: 12 },
  kindIncome: { backgroundColor: '#dcfce7' },
  kindExpense: { backgroundColor: '#fee2e2' },
  kindBannerText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  kindAmt: { fontSize: 26, fontWeight: '800', marginTop: 4 },
  summary: { fontSize: 14, color: adminTheme.colors.textMuted, marginBottom: 12 },
  metaGrid: { gap: 4 },
  metaLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 8 },
  metaVal: { fontSize: 15, color: adminTheme.colors.text, fontWeight: '500' },
  sectionTitle: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumb: { width: 100, height: 100, borderRadius: 8 },
  noReceipt: { fontSize: 14, color: adminTheme.colors.textMuted },
  delBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    padding: 14,
  },
  delBtnText: { color: '#dc2626', fontWeight: '600' },
});
