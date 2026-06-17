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
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { PressableScale } from '@/components/premium/PressableScale';
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
import { getDepartmentLabel, DEPARTMENT_OPTIONS } from '@/lib/departmentLabels';
import {
  fetchKitchenScoreSummary,
  fetchKitchenScoreHistory,
  getKitchenScoreLabel,
  computeKitchenOverallScore,
  type KitchenScoreSummary,
  type KitchenScoreEntry,
} from '@/lib/kitchenScore';
import {
  PointsSegmentTabs,
  PointsLeaderboardRow,
  PointsHistoryCard,
  KitchenScoreHero,
  AdminAwardCta,
  AdminStatsStrip,
  StaggerFadeIn,
  pointsTheme,
} from '@/components/points';

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
  const [awardDepartment, setAwardDepartment] = useState<string>('');
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

  const topPerformer = rankedStaff[0] ?? null;

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
        department: awardDepartment.trim() || null,
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
        <ActivityIndicator size="large" color={pointsTheme.gold} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['rgba(254,243,199,0.35)', 'transparent']}
        style={styles.bgGlow}
        pointerEvents="none"
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={pointsTheme.gold} />}
        showsVerticalScrollIndicator={false}
      >
        <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} />
        <View style={{ height: 10 }} />

        <PointsSegmentTabs
          variant="admin"
          tabs={[
            { key: 'staff', label: 'Personel', icon: 'people' },
            { key: 'kitchen', label: 'Mutfak', icon: 'cafe' },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'staff' && (
          <>
            <AdminStatsStrip
              staffCount={rankedStaff.length}
              movementCount={pointsHistory.length}
              topName={topPerformer ? staffNameMap[topPerformer.staff_id] ?? null : null}
              topPoints={topPerformer?.total_points ?? null}
            />

            <AdminAwardCta onPress={() => setAwardModal(true)} />

            <Text style={styles.sectionTitle}>Personel Sıralaması</Text>
            {rankedStaff.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="trophy-outline" size={32} color={pointsTheme.gold} />
                <Text style={styles.emptyText}>Henüz puan kaydı yok.</Text>
              </View>
            ) : (
              rankedStaff.map((item, idx) => (
                <StaggerFadeIn key={item.staff_id} index={idx}>
                  <PointsLeaderboardRow
                    rank={idx + 1}
                    name={staffNameMap[item.staff_id] ?? '—'}
                    subtitle={`+${item.positive_count} olumlu · ${item.negative_count} olumsuz`}
                    points={item.total_points}
                  />
                </StaggerFadeIn>
              ))
            )}

            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Son Hareketler</Text>
            {pointsHistory.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>Henüz hareket yok.</Text>
              </View>
            ) : (
              pointsHistory.slice(0, 20).map((entry, idx) => {
                const icon = (POINT_CATEGORY_ICONS[entry.category] ?? 'star') as keyof typeof Ionicons.glyphMap;
                const meta = [
                  entry.department ? getDepartmentLabel(entry.department) : null,
                  entry.reason,
                ]
                  .filter(Boolean)
                  .join(' — ');
                return (
                  <StaggerFadeIn key={entry.id} index={idx}>
                    <PointsHistoryCard
                      points={entry.points}
                      dateLabel={new Date(entry.created_at).toLocaleString('tr-TR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      title={staffNameMap[entry.staff_id] ?? '—'}
                      meta={POINT_CATEGORY_LABELS[entry.category] ?? entry.category}
                      reason={meta || null}
                      categoryIcon={icon}
                    />
                  </StaggerFadeIn>
                );
              })
            )}
          </>
        )}

        {tab === 'kitchen' && (
          <>
            <KitchenScoreHero
              score={kitchenOverall}
              label={kitchenLabel.label}
              labelColor={kitchenLabel.color}
              meta={`Toplam: ${kitchenSummary?.total_entries ?? 0} kayıt · Pozitif: ${kitchenSummary?.positive_count ?? 0} · Negatif: ${kitchenSummary?.negative_count ?? 0}`}
            />

            <Text style={styles.sectionTitle}>Mutfak Puan Geçmişi</Text>
            {kitchenHistory.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="cafe-outline" size={32} color={pointsTheme.gold} />
                <Text style={styles.emptyText}>Henüz mutfak puanı kaydı yok.</Text>
              </View>
            ) : (
              kitchenHistory.slice(0, 30).map((entry, idx) => (
                <StaggerFadeIn key={entry.id} index={idx}>
                  <PointsHistoryCard
                    points={entry.score_delta}
                    dateLabel={entry.record_date}
                    title="Mutfak değerlendirmesi"
                    reason={entry.reason}
                    categoryIcon="cafe"
                  />
                </StaggerFadeIn>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={awardModal} transparent animationType="fade" onRequestClose={() => setAwardModal(false)}>
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalSheet}>
              <LinearGradient
                colors={pointsTheme.gradientHero}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.modalHero}
              >
                <Ionicons name="star" size={28} color="#fff" />
                <Text style={styles.modalTitle}>Puan Ver / Çıkar</Text>
                <Text style={styles.modalSubtitle}>Personel performansını anında kaydedin</Text>
              </LinearGradient>

              <View style={styles.modalBody}>
                <Text style={styles.modalLabel}>Personel seçin</Text>
                <ScrollView style={styles.staffPicker} nestedScrollEnabled>
                  {staffList.length === 0 ? (
                    <Text style={styles.staffPickerEmpty}>
                      Aktif personel bulunamadı. Personel listesinden kayıtların aktif olduğundan emin olun.
                    </Text>
                  ) : (
                    staffList.map((s) => (
                      <PressableScale
                        key={s.id}
                        onPress={() => {
                          setAwardStaffId(s.id);
                          setAwardDepartment(s.department ?? '');
                        }}
                      >
                        <View style={[styles.staffPickerItem, awardStaffId === s.id && styles.staffPickerItemActive]}>
                          <Text style={[styles.staffPickerText, awardStaffId === s.id && styles.staffPickerTextActive]}>
                            {s.full_name ?? '—'}
                          </Text>
                          {s.department ? (
                            <Text style={styles.staffPickerDept}>{getDepartmentLabel(s.department)}</Text>
                          ) : null}
                          {awardStaffId === s.id ? (
                            <Ionicons name="checkmark-circle" size={18} color="#047857" />
                          ) : null}
                        </View>
                      </PressableScale>
                    ))
                  )}
                </ScrollView>

                <Text style={styles.modalLabel}>Bölüm (isteğe bağlı)</Text>
                <Text style={styles.modalHint}>
                  Puan hangi bölüm adına veriliyor? Personel «Alınan puanlarım» ekranında bölüme göre görebilir.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                  <View style={styles.chipRow}>
                    <TouchableOpacity
                      style={[styles.catChip, !awardDepartment && styles.catChipActive]}
                      onPress={() => setAwardDepartment('')}
                    >
                      <Text style={[styles.catChipText, !awardDepartment && styles.catChipTextActive]}>Genel</Text>
                    </TouchableOpacity>
                    {DEPARTMENT_OPTIONS.map((d) => (
                      <TouchableOpacity
                        key={d.value}
                        style={[styles.catChip, awardDepartment === d.value && styles.catChipActive]}
                        onPress={() => setAwardDepartment(d.value)}
                      >
                        <Text
                          style={[styles.catChipText, awardDepartment === d.value && styles.catChipTextActive]}
                          numberOfLines={1}
                        >
                          {d.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
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
                      <Text
                        style={[
                          styles.scoreChipText,
                          awardPoints === String(v) && { color: getPointsColor(v) },
                        ]}
                      >
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
                        name={(POINT_CATEGORY_ICONS[cat] ?? 'star') as keyof typeof Ionicons.glyphMap}
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
                  style={[styles.modalInput, { minHeight: 72 }]}
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
                  <PressableScale
                    style={[styles.modalConfirmWrap, !awardStaffId && { opacity: 0.5 }]}
                    onPress={submitAward}
                    disabled={awarding || !awardStaffId}
                  >
                    <LinearGradient colors={pointsTheme.gradientCta} style={styles.modalConfirmBtn}>
                      {awarding ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <>
                          <Ionicons name="checkmark-circle" size={16} color="#fff" />
                          <Text style={styles.modalConfirmText}>Kaydet</Text>
                        </>
                      )}
                    </LinearGradient>
                  </PressableScale>
                </View>
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
  bgGlow: { position: 'absolute', top: 0, left: 0, right: 0, height: 220 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  sectionTitle: { fontSize: 16, fontWeight: '900', color: adminTheme.colors.text, marginBottom: 12 },

  emptyCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: pointsTheme.shell.borderColor,
    ...pointsTheme.cardShadow,
  },
  emptyText: { fontSize: 14, color: adminTheme.colors.textSecondary, textAlign: 'center' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '100%',
    maxWidth: 440,
    overflow: 'hidden',
    ...pointsTheme.cardShadow,
  },
  modalHero: {
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  modalTitle: { fontSize: 22, fontWeight: '900', color: '#fff' },
  modalSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.88)' },
  modalBody: { padding: 20 },
  modalLabel: { fontSize: 13, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 8, marginTop: 10 },
  modalHint: { fontSize: 12, color: adminTheme.colors.textMuted, marginBottom: 8, lineHeight: 17 },
  modalInput: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    color: adminTheme.colors.text,
    backgroundColor: '#F9FAFB',
    marginBottom: 4,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.textSecondary },
  modalConfirmWrap: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  modalConfirmBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalConfirmText: { fontSize: 15, fontWeight: '800', color: '#fff' },

  staffPicker: { maxHeight: 200, borderWidth: 1, borderColor: adminTheme.colors.border, borderRadius: 14, marginBottom: 8 },
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
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  staffPickerItemActive: { backgroundColor: '#FFFBEB' },
  staffPickerText: { flex: 1, fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  staffPickerTextActive: { color: pointsTheme.goldDark },
  staffPickerDept: { fontSize: 12, color: adminTheme.colors.textMuted, marginRight: 8 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  scoreChip: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
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
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  catChipActive: { backgroundColor: pointsTheme.goldDark, borderColor: pointsTheme.goldDark },
  catChipText: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textSecondary },
  catChipTextActive: { color: '#fff' },
});
