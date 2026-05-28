import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard, AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import {
  awardStaffPoints,
  fetchStaffPointsSummary,
  fetchStaffPointsHistory,
  POINT_CATEGORY_LABELS,
  POINT_CATEGORY_ICONS,
  getPointsColor,
  formatPoints,
  type StaffPointsSummary,
  type StaffPointEntry,
  type PointCategory,
} from '@/lib/staffPoints';
import { getDepartmentLabel } from '@/lib/departmentLabels';
import {
  fetchKitchenScoreSummary,
  fetchKitchenScoreHistory,
  getKitchenScoreLabel,
  computeKitchenOverallScore,
  type KitchenScoreSummary,
  type KitchenScoreEntry,
} from '@/lib/kitchenScore';

type StaffMini = { id: string; full_name: string | null; department: string | null };

export default function AdminPointsDashboard() {
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'staff' | 'kitchen'>('staff');

  const [staffList, setStaffList] = useState<StaffMini[]>([]);
  const [pointsSummary, setPointsSummary] = useState<StaffPointsSummary[]>([]);
  const [pointsHistory, setPointsHistory] = useState<StaffPointEntry[]>([]);
  const [kitchenSummary, setKitchenSummary] = useState<KitchenScoreSummary | null>(null);
  const [kitchenHistory, setKitchenHistory] = useState<KitchenScoreEntry[]>([]);

  const [awardModal, setAwardModal] = useState(false);
  const [awardStaffId, setAwardStaffId] = useState<string | null>(null);
  const [awardPoints, setAwardPoints] = useState('5');
  const [awardCategory, setAwardCategory] = useState<PointCategory>('general');
  const [awardReason, setAwardReason] = useState('');
  const [awarding, setAwarding] = useState(false);

  const load = useCallback(async () => {
    if (!canQuery || !orgScoped) {
      setPointsSummary([]);
      setPointsHistory([]);
      setKitchenSummary(null);
      setKitchenHistory([]);
      setStaffList([]);
      return;
    }
    const orgId = orgScoped;

    const [summaryData, historyData, kitchenSum, kitchenHist, staffData] = await Promise.all([
      fetchStaffPointsSummary(orgId),
      fetchStaffPointsHistory(orgId),
      fetchKitchenScoreSummary(orgId),
      fetchKitchenScoreHistory(orgId),
      supabase
        .from('staff')
        .select('id, full_name, department')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name'),
    ]);

    setPointsSummary(summaryData);
    setPointsHistory(historyData);
    setKitchenSummary(kitchenSum);
    setKitchenHistory(kitchenHist);
    if (staffData.error) {
      setStaffList([]);
      Alert.alert('Personel listesi', staffData.error.message);
    } else {
      setStaffList((staffData.data ?? []) as StaffMini[]);
    }
  }, [canQuery, orgScoped]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        setLoading(true);
        await load();
        setLoading(false);
      })();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const staffNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of staffList) map[s.id] = s.full_name ?? '—';
    return map;
  }, [staffList]);

  const rankedStaff = useMemo(() => {
    return [...pointsSummary].sort((a, b) => b.total_points - a.total_points);
  }, [pointsSummary]);

  const kitchenOverall = kitchenSummary ? computeKitchenOverallScore(kitchenSummary.total_score) : 100;
  const kitchenLabel = getKitchenScoreLabel(kitchenOverall);

  const submitAward = async () => {
    if (!staff?.id || !staff.organization_id || !awardStaffId) return;
    const pts = parseInt(awardPoints, 10);
    if (isNaN(pts) || pts === 0) {
      Alert.alert('Hata', 'Geçerli bir puan giriniz.');
      return;
    }
    if (!awardReason.trim()) {
      Alert.alert('Eksik', 'Lütfen bir neden giriniz.');
      return;
    }
    setAwarding(true);
    try {
      const result = await awardStaffPoints({
        organizationId: staff.organization_id,
        staffId: awardStaffId,
        points: pts,
        category: awardCategory,
        reason: awardReason.trim(),
        createdByStaffId: staff.id,
      });
      if (!result.success) throw new Error(result.error);
      Alert.alert('Başarılı', `${formatPoints(pts)} puan verildi.`);
      setAwardModal(false);
      setAwardStaffId(null);
      setAwardReason('');
      setAwardPoints('5');
      await load();
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Puanlama başarısız');
    } finally {
      setAwarding(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
      >
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
        <View style={{ height: 8 }} />
        {/* Tab bar */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'staff' && styles.tabBtnActive]}
            onPress={() => setTab('staff')}
            activeOpacity={0.8}
          >
            <Ionicons name="people" size={18} color={tab === 'staff' ? '#fff' : adminTheme.colors.textSecondary} />
            <Text style={[styles.tabText, tab === 'staff' && styles.tabTextActive]}>Personel Puanları</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'kitchen' && styles.tabBtnActive]}
            onPress={() => setTab('kitchen')}
            activeOpacity={0.8}
          >
            <Ionicons name="cafe" size={18} color={tab === 'kitchen' ? '#fff' : adminTheme.colors.textSecondary} />
            <Text style={[styles.tabText, tab === 'kitchen' && styles.tabTextActive]}>Mutfak Puanı</Text>
          </TouchableOpacity>
        </View>

        {tab === 'staff' && (
          <>
            {/* Award button */}
            <TouchableOpacity
              style={styles.awardBtn}
              onPress={() => setAwardModal(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="add-circle" size={20} color="#fff" />
              <Text style={styles.awardBtnText}>Puan Ver / Çıkar</Text>
            </TouchableOpacity>

            {/* Staff ranking */}
            <Text style={styles.sectionTitle}>Personel Sıralaması</Text>
            {rankedStaff.length === 0 ? (
              <AdminCard>
                <Text style={styles.emptyText}>Henüz puan kaydı yok.</Text>
              </AdminCard>
            ) : (
              rankedStaff.map((item, idx) => (
                <AdminCard key={item.staff_id} style={styles.rankCard}>
                  <View style={styles.rankRow}>
                    <View style={[styles.rankBadge, idx === 0 && styles.rankFirst]}>
                      <Text style={[styles.rankNum, idx === 0 && styles.rankNumFirst]}>
                        {idx + 1}
                      </Text>
                    </View>
                    <View style={styles.rankInfo}>
                      <Text style={styles.rankName}>{staffNameMap[item.staff_id] ?? '—'}</Text>
                      <Text style={styles.rankMeta}>
                        +{item.positive_count} olumlu · {item.negative_count} olumsuz
                      </Text>
                    </View>
                    <Text style={[styles.rankPoints, { color: getPointsColor(item.total_points) }]}>
                      {formatPoints(item.total_points)}
                    </Text>
                  </View>
                </AdminCard>
              ))
            )}

            {/* Recent history */}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Son Hareketler</Text>
            {pointsHistory.slice(0, 20).map((entry) => (
              <View key={entry.id} style={styles.historyRow}>
                <View style={[styles.historyDot, { backgroundColor: getPointsColor(entry.points) }]} />
                <View style={styles.historyInfo}>
                  <Text style={styles.historyName}>{staffNameMap[entry.staff_id] ?? '—'}</Text>
                  <Text style={styles.historyReason} numberOfLines={1}>
                    {POINT_CATEGORY_LABELS[entry.category] ?? entry.category} — {entry.reason ?? ''}
                  </Text>
                </View>
                <Text style={[styles.historyPts, { color: getPointsColor(entry.points) }]}>
                  {formatPoints(entry.points)}
                </Text>
              </View>
            ))}
          </>
        )}

        {tab === 'kitchen' && (
          <>
            {/* Kitchen score overview */}
            <AdminCard style={styles.kitchenCard} elevated>
              <View style={styles.kitchenHeader}>
                <View style={[styles.kitchenScoreBadge, { borderColor: kitchenLabel.color }]}>
                  <Text style={[styles.kitchenScoreNum, { color: kitchenLabel.color }]}>{kitchenOverall}</Text>
                </View>
                <View style={styles.kitchenInfo}>
                  <Text style={styles.kitchenTitle}>Mutfak Genel Puanı</Text>
                  <Text style={[styles.kitchenLabel, { color: kitchenLabel.color }]}>{kitchenLabel.label}</Text>
                  <Text style={styles.kitchenMeta}>
                    Toplam: {kitchenSummary?.total_entries ?? 0} kayıt · Pozitif: {kitchenSummary?.positive_count ?? 0} · Negatif: {kitchenSummary?.negative_count ?? 0}
                  </Text>
                </View>
              </View>
            </AdminCard>

            <Text style={styles.sectionTitle}>Mutfak Puan Geçmişi</Text>
            {kitchenHistory.length === 0 ? (
              <AdminCard>
                <Text style={styles.emptyText}>Henüz mutfak puanı kaydı yok.</Text>
              </AdminCard>
            ) : (
              kitchenHistory.slice(0, 30).map((entry) => (
                <View key={entry.id} style={styles.historyRow}>
                  <View style={[styles.historyDot, { backgroundColor: entry.score_delta >= 0 ? '#047857' : '#DC2626' }]} />
                  <View style={styles.historyInfo}>
                    <Text style={styles.historyName}>{entry.record_date}</Text>
                    <Text style={styles.historyReason} numberOfLines={1}>{entry.reason ?? '—'}</Text>
                  </View>
                  <Text style={[styles.historyPts, { color: entry.score_delta >= 0 ? '#047857' : '#DC2626' }]}>
                    {entry.score_delta > 0 ? `+${entry.score_delta}` : entry.score_delta}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Award points modal */}
      <Modal visible={awardModal} transparent animationType="fade" onRequestClose={() => setAwardModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalSheet}>
              <View style={styles.modalHeaderRow}>
                <Ionicons name="star" size={28} color={adminTheme.colors.accent} />
                <Text style={styles.modalTitle}>Puan Ver / Çıkar</Text>
              </View>

              <Text style={styles.modalLabel}>Personel seçin</Text>
              <ScrollView style={styles.staffPicker} nestedScrollEnabled>
                {staffList.length === 0 ? (
                  <Text style={styles.staffPickerEmpty}>
                    Aktif personel bulunamadı. Personel listesinden kayıtların aktif olduğundan emin olun.
                  </Text>
                ) : (
                  staffList.map((s) => (
                    <TouchableOpacity
                      key={s.id}
                      style={[styles.staffPickerItem, awardStaffId === s.id && styles.staffPickerItemActive]}
                      onPress={() => setAwardStaffId(s.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.staffPickerText, awardStaffId === s.id && styles.staffPickerTextActive]}>
                        {s.full_name ?? '—'}
                      </Text>
                      {s.department ? (
                        <Text style={styles.staffPickerDept}>{getDepartmentLabel(s.department)}</Text>
                      ) : null}
                      {awardStaffId === s.id ? (
                        <Ionicons name="checkmark-circle" size={18} color="#047857" />
                      ) : null}
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>

              <Text style={styles.modalLabel}>Puan</Text>
              <View style={styles.chipRow}>
                {[-5, -3, 3, 5, 10, 15].map((v) => (
                  <TouchableOpacity
                    key={v}
                    onPress={() => setAwardPoints(String(v))}
                    style={[
                      styles.scoreChip,
                      awardPoints === String(v) && (v > 0 ? styles.scoreChipPositive : styles.scoreChipNegative),
                    ]}
                    activeOpacity={0.8}
                  >
                    <Text style={[
                      styles.scoreChipText,
                      awardPoints === String(v) && { color: v > 0 ? '#047857' : '#DC2626' },
                    ]}>
                      {v > 0 ? `+${v}` : v}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.modalInput}
                value={awardPoints}
                onChangeText={setAwardPoints}
                placeholder="Özel puan"
                placeholderTextColor={adminTheme.colors.textMuted}
                keyboardType="number-pad"
              />

              <Text style={styles.modalLabel}>Kategori</Text>
              <View style={styles.chipRow}>
                {(['general', 'task', 'breakfast', 'reward', 'penalty'] as PointCategory[]).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setAwardCategory(cat)}
                    style={[styles.catChip, awardCategory === cat && styles.catChipActive]}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={(POINT_CATEGORY_ICONS[cat] ?? 'star') as any}
                      size={14}
                      color={awardCategory === cat ? '#fff' : adminTheme.colors.textSecondary}
                    />
                    <Text style={[styles.catChipText, awardCategory === cat && styles.catChipTextActive]}>
                      {POINT_CATEGORY_LABELS[cat]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.modalLabel}>Neden</Text>
              <TextInput
                style={[styles.modalInput, { minHeight: 60 }]}
                value={awardReason}
                onChangeText={setAwardReason}
                placeholder="Puan verilme nedeni"
                placeholderTextColor={adminTheme.colors.textMuted}
                multiline
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setAwardModal(false)} activeOpacity={0.85}>
                  <Text style={styles.modalCancelText}>Vazgeç</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalConfirmBtn, !awardStaffId && { opacity: 0.5 }]}
                  onPress={submitAward}
                  disabled={awarding || !awardStaffId}
                  activeOpacity={0.85}
                >
                  {awarding ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.modalConfirmText}>Kaydet</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  tabBtnActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.textSecondary },
  tabTextActive: { color: '#fff' },

  awardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.accent,
    marginBottom: 16,
  },
  awardBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  sectionTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 12 },

  rankCard: { marginBottom: 8 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankFirst: { backgroundColor: '#FEF3C7' },
  rankNum: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.textSecondary },
  rankNumFirst: { color: '#B45309' },
  rankInfo: { flex: 1 },
  rankName: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  rankMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  rankPoints: { fontSize: 20, fontWeight: '800' },

  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: adminTheme.colors.borderLight },
  historyDot: { width: 8, height: 8, borderRadius: 4 },
  historyInfo: { flex: 1 },
  historyName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  historyReason: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  historyPts: { fontSize: 16, fontWeight: '800' },

  kitchenCard: { marginBottom: 16 },
  kitchenHeader: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  kitchenScoreBadge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  kitchenScoreNum: { fontSize: 24, fontWeight: '900' },
  kitchenInfo: { flex: 1 },
  kitchenTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  kitchenLabel: { fontSize: 14, fontWeight: '700', marginTop: 4 },
  kitchenMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4 },

  emptyText: { fontSize: 14, color: adminTheme.colors.textSecondary, textAlign: 'center' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 420,
  },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  modalLabel: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8, marginTop: 12 },
  modalInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: '#F9FAFB',
    marginBottom: 4,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.textSecondary },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#047857',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  staffPicker: { maxHeight: 200, borderWidth: 1, borderColor: adminTheme.colors.border, borderRadius: 10, marginBottom: 8 },
  staffPickerEmpty: {
    padding: 16,
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
  staffPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  staffPickerItemActive: { backgroundColor: '#ECFDF5' },
  staffPickerText: { flex: 1, fontSize: 14, fontWeight: '600', color: adminTheme.colors.text },
  staffPickerTextActive: { color: '#047857' },
  staffPickerDept: { fontSize: 12, color: adminTheme.colors.textMuted, marginRight: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  scoreChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  scoreChipPositive: { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' },
  scoreChipNegative: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  scoreChipText: { fontSize: 14, fontWeight: '800', color: '#6B7280' },

  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  catChipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  catChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  catChipTextActive: { color: '#fff' },
});
