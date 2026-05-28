import { useState, useEffect, useCallback, useMemo, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  TextInput,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminOrganizationPicker } from '@/components/admin';
import { useAdminOrganizationQueryScope } from '@/hooks/useAdminOrganizationQueryScope';
import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';
import { CachedImage } from '@/components/CachedImage';
import { notifyBreakfastApproved, notifyBreakfastRejected } from '@/lib/notificationService';
import { awardStaffPoints } from '@/lib/staffPoints';

type Row = {
  id: string;
  organization_id: string;
  record_date: string;
  submitted_at: string;
  guest_count: number;
  note: string | null;
  photo_urls: string[];
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  staff_id: string;
  staff?: { full_name: string | null; department: string | null } | null;
};

type StaffOption = { id: string; name: string; department: string | null; count: number };
type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

function formatTrDate(value: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function formatTrTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function getRelativeDay(dateStr: string): string | null {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (dateStr === todayStr) return 'Bugün';
  if (dateStr === yesterdayStr) return 'Dün';
  return null;
}

type BreakfastCardProps = {
  item: Row;
  thumbSize: number;
  onLightbox: (v: { urls: string[]; index: number }) => void;
  onApprove: (item: Row) => void;
  onReject: (item: Row) => void;
};

const BreakfastCard = memo(function BreakfastCard({ item, thumbSize, onLightbox, onApprove, onReject }: BreakfastCardProps) {
  const isPending = !item.approved_at && !item.rejected_at;
  const isApproved = !!item.approved_at;
  const relDay = getRelativeDay(item.record_date);
  const urls = item.photo_urls ?? [];

  return (
    <View style={[styles.card, isPending && styles.cardPending]}>
      {isPending && <View style={styles.cardAccentLine} />}

      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.dateRow}>
            {relDay && <Text style={styles.relDay}>{relDay}</Text>}
            <Text style={styles.date}>{formatTrDate(item.record_date)}</Text>
          </View>
          {item.staff?.full_name ? (
            <View style={styles.staffRow}>
              <View style={styles.staffAvatar}>
                <Text style={styles.staffAvatarText}>
                  {(item.staff.full_name[0] ?? '?').toUpperCase()}
                </Text>
              </View>
              <Text style={styles.staffName}>{item.staff.full_name}</Text>
            </View>
          ) : null}
        </View>

        {isApproved ? (
          <View style={styles.badgeApproved}>
            <Ionicons name="checkmark-circle" size={14} color="#047857" />
            <Text style={styles.badgeApprovedText}>Onaylı</Text>
          </View>
        ) : item.rejected_at ? (
          <View style={styles.badgeRejected}>
            <Ionicons name="close-circle" size={14} color="#DC2626" />
            <Text style={styles.badgeRejectedText}>Red</Text>
          </View>
        ) : (
          <View style={styles.badgePending}>
            <Ionicons name="hourglass-outline" size={14} color="#D97706" />
            <Text style={styles.badgePendingText}>Bekliyor</Text>
          </View>
        )}
      </View>

      <View style={styles.metaRow}>
        <View style={styles.metaChip}>
          <Ionicons name="people" size={13} color={adminTheme.colors.accent} />
          <Text style={styles.metaText}>{item.guest_count} misafir</Text>
        </View>
        <View style={styles.metaChip}>
          <Ionicons name="time-outline" size={13} color={adminTheme.colors.textMuted} />
          <Text style={styles.metaText}>{formatTrTime(item.submitted_at)}</Text>
        </View>
        {urls.length > 0 && (
          <View style={styles.metaChip}>
            <Ionicons name="images" size={13} color={adminTheme.colors.textMuted} />
            <Text style={styles.metaText}>{urls.length} fotoğraf</Text>
          </View>
        )}
      </View>

      {item.note ? (
        <View style={styles.noteBox}>
          <Ionicons name="chatbubble-outline" size={14} color={adminTheme.colors.textMuted} style={{ marginTop: 2 }} />
          <Text style={styles.noteText}>{item.note}</Text>
        </View>
      ) : null}

      {urls.length > 0 && (
        <View style={styles.thumbRow}>
          {urls.map((u, idx) => (
            <TouchableOpacity
              key={`${item.id}-${idx}`}
              activeOpacity={0.88}
              onPress={() => onLightbox({ urls, index: idx })}
            >
              <CachedImage
                uri={u}
                style={[styles.thumb, { width: thumbSize, height: thumbSize * 0.75 }]}
                contentFit="cover"
                recyclingKey={`bf-${item.id}-${idx}`}
              />
              {idx === 0 && urls.length > 2 && (
                <View style={styles.photoCount}>
                  <Text style={styles.photoCountText}>+{urls.length - 1}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      )}

      {item.rejected_at && item.rejection_reason ? (
        <View style={styles.rejectionBox}>
          <Ionicons name="warning" size={16} color="#DC2626" />
          <View style={styles.rejectionContent}>
            <Text style={styles.rejectionLabel}>Red sebebi</Text>
            <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
          </View>
        </View>
      ) : null}

      {isPending ? (
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.approveBtn} onPress={() => onApprove(item)} activeOpacity={0.85}>
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={styles.approveBtnText}>Onayla</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.rejectBtn} onPress={() => onReject(item)} activeOpacity={0.85}>
            <Ionicons name="close" size={18} color="#DC2626" />
            <Text style={styles.rejectBtnText}>Reddet</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
});

export default function AdminBreakfastConfirmListScreen() {
  const router = useRouter();
  const { staff, canUseAll, orgScoped, canQuery } = useAdminOrganizationQueryScope();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [scoreTarget, setScoreTarget] = useState<Row | null>(null);
  const [scoreValue, setScoreValue] = useState('5');
  const [scoreNote, setScoreNote] = useState('');
  const [scoring, setScoring] = useState(false);

  const load = useCallback(async () => {
    if (!canQuery) {
      setRows([]);
      return;
    }
    let query = supabase
      .from('breakfast_confirmations')
      .select('id, organization_id, record_date, submitted_at, guest_count, note, photo_urls, approved_at, rejected_at, rejection_reason, staff_id, staff!staff_id(full_name, department)')
      .order('submitted_at', { ascending: false })
      .limit(200);
    if (orgScoped) query = query.eq('organization_id', orgScoped);
    const { data, error } = await query;
    if (error) Alert.alert('Hata', error.message);
    else setRows((data as Row[]) ?? []);
  }, [canQuery, orgScoped]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const approve = async (item: Row) => {
    const orgId = item.organization_id || orgScoped;
    if (!staff?.id || !orgId) return;
    try {
      const { error } = await supabase
        .from('breakfast_confirmations')
        .update({
          approved_at: new Date().toISOString(),
          approved_by_staff_id: staff.id,
        })
        .eq('id', item.id);
      if (error) throw new Error(error.message);
      await load();

      notifyBreakfastApproved({
        organizationId: orgId,
        approverName: staff.full_name ?? 'Yönetici',
        recordDate: item.record_date,
        kitchenStaffId: item.staff_id,
      }).catch(() => {});

      setScoreTarget(item);
      setScoreValue('5');
      setScoreNote('');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Onaylanamadı');
    }
  };

  const submitBreakfastScore = async () => {
    const orgId = scoreTarget?.organization_id || orgScoped;
    if (!staff?.id || !orgId || !scoreTarget) return;
    const pts = parseInt(scoreValue, 10);
    if (isNaN(pts) || pts === 0) {
      setScoreTarget(null);
      return;
    }
    setScoring(true);
    try {
      await supabase.from('kitchen_scores').insert({
        organization_id: orgId,
        record_date: scoreTarget.record_date,
        breakfast_confirmation_id: scoreTarget.id,
        score_delta: pts,
        reason: scoreNote.trim() || (pts > 0 ? 'Kahvaltı onaylandı — bonus puan' : 'Puan düşürme'),
        created_by_staff_id: staff.id,
      });

      await awardStaffPoints({
        organizationId: orgId,
        staffId: scoreTarget.staff_id,
        points: pts,
        category: 'breakfast',
        reason: scoreNote.trim() || (pts > 0 ? 'Kahvaltı onayı — bonus puan' : 'Kahvaltı puan düşürme'),
        referenceType: 'breakfast_confirmation',
        referenceId: scoreTarget.id,
        createdByStaffId: staff.id,
      });

      setScoreTarget(null);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Puanlama başarısız');
    } finally {
      setScoring(false);
    }
  };

  const reject = async () => {
    const orgId = rejectTarget?.organization_id || orgScoped;
    if (!staff?.id || !orgId || !rejectTarget) return;
    if (!rejectReason.trim()) {
      Alert.alert('Eksik', 'Lütfen red nedenini yazın.');
      return;
    }
    setRejecting(true);
    try {
      const scoreImpact = -5;
      const { error } = await supabase
        .from('breakfast_confirmations')
        .update({
          rejected_at: new Date().toISOString(),
          rejected_by_staff_id: staff.id,
          rejection_reason: rejectReason.trim(),
          rejection_score_impact: scoreImpact,
        })
        .eq('id', rejectTarget.id);
      if (error) throw new Error(error.message);

      await supabase.from('kitchen_scores').insert({
        organization_id: orgId,
        record_date: rejectTarget.record_date,
        breakfast_confirmation_id: rejectTarget.id,
        score_delta: scoreImpact,
        reason: rejectReason.trim(),
        created_by_staff_id: staff.id,
      });

      notifyBreakfastRejected({
        organizationId: orgId,
        rejectorName: staff.full_name ?? 'Yönetici',
        recordDate: rejectTarget.record_date,
        kitchenStaffId: rejectTarget.staff_id,
        reason: rejectReason.trim(),
      }).catch(() => {});

      setRejectTarget(null);
      setRejectReason('');
      await load();
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Reddedilemedi');
    } finally {
      setRejecting(false);
    }
  };

  const staffOptions = useMemo<StaffOption[]>(() => {
    const map = new Map<string, StaffOption>();
    for (const r of rows) {
      const sid = r.staff_id ?? 'unknown';
      const existing = map.get(sid);
      if (existing) {
        existing.count++;
      } else {
        map.set(sid, {
          id: sid,
          name: r.staff?.full_name ?? '—',
          department: r.staff?.department ?? null,
          count: 1,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  }, [rows]);

  const stats = useMemo(() => {
    const pending = rows.filter((r) => !r.approved_at && !r.rejected_at).length;
    const approved = rows.filter((r) => !!r.approved_at).length;
    const rejected = rows.filter((r) => !!r.rejected_at).length;
    return { pending, approved, rejected, total: rows.length };
  }, [rows]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (selectedStaffId) result = result.filter((r) => r.staff_id === selectedStaffId);
    if (statusFilter === 'pending') result = result.filter((r) => !r.approved_at && !r.rejected_at);
    else if (statusFilter === 'approved') result = result.filter((r) => !!r.approved_at);
    else if (statusFilter === 'rejected') result = result.filter((r) => !!r.rejected_at);
    return result;
  }, [rows, selectedStaffId, statusFilter]);

  const selectedStaffName = useMemo(
    () => staffOptions.find((s) => s.id === selectedStaffId)?.name ?? null,
    [staffOptions, selectedStaffId]
  );

  const thumbSize = Math.min(Math.floor((width - 32 - 14 - 10) / 2), 160);

  const renderCard = useCallback(
    ({ item }: { item: Row }) => (
      <BreakfastCard
        item={item}
        thumbSize={thumbSize}
        onLightbox={setLightbox}
        onApprove={approve}
        onReject={(r) => { setRejectTarget(r); setRejectReason(''); }}
      />
    ),
    [thumbSize, approve]
  );

  const listHeader = useMemo(
    () => (
      <>
        <View style={styles.orgPickerWrap}>
          <AdminOrganizationPicker
            canUseAll={canUseAll}
            ownOrganizationId={staff?.organization_id}
          />
        </View>
        {/* Summary Stats */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, statusFilter === 'pending' && styles.statCardActive]}
            onPress={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
            activeOpacity={0.8}
          >
            <View style={[styles.statIcon, { backgroundColor: '#FEF3C7' }]}>
              <Ionicons name="time" size={18} color="#D97706" />
            </View>
            <Text style={styles.statNumber}>{stats.pending}</Text>
            <Text style={styles.statLabel}>Bekleyen</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statCard, statusFilter === 'approved' && styles.statCardActive]}
            onPress={() => setStatusFilter(statusFilter === 'approved' ? 'all' : 'approved')}
            activeOpacity={0.8}
          >
            <View style={[styles.statIcon, { backgroundColor: '#D1FAE5' }]}>
              <Ionicons name="checkmark-circle" size={18} color="#047857" />
            </View>
            <Text style={styles.statNumber}>{stats.approved}</Text>
            <Text style={styles.statLabel}>Onaylı</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.statCard, statusFilter === 'rejected' && styles.statCardActive]}
            onPress={() => setStatusFilter(statusFilter === 'rejected' ? 'all' : 'rejected')}
            activeOpacity={0.8}
          >
            <View style={[styles.statIcon, { backgroundColor: '#FEE2E2' }]}>
              <Ionicons name="close-circle" size={18} color="#DC2626" />
            </View>
            <Text style={styles.statNumber}>{stats.rejected}</Text>
            <Text style={styles.statLabel}>Reddedilen</Text>
          </TouchableOpacity>
        </View>

        {/* Filter row */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, selectedStaffId && styles.filterChipActive]}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.82}
          >
            <Ionicons
              name={selectedStaffId ? 'person' : 'people-outline'}
              size={16}
              color={selectedStaffId ? '#fff' : adminTheme.colors.textSecondary}
            />
            <Text style={[styles.filterChipText, selectedStaffId && styles.filterChipTextActive]} numberOfLines={1}>
              {selectedStaffName ?? 'Tüm personel'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={14}
              color={selectedStaffId ? '#fff' : adminTheme.colors.textMuted}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.settingsBtn}
            onPress={() => router.push('/admin/breakfast-confirm/settings')}
            activeOpacity={0.85}
          >
            <Ionicons name="settings-outline" size={18} color={adminTheme.colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Status filter info */}
        {statusFilter !== 'all' && (
          <View style={styles.activeFilterBanner}>
            <Ionicons
              name={statusFilter === 'pending' ? 'time' : statusFilter === 'approved' ? 'checkmark-circle' : 'close-circle'}
              size={16}
              color={statusFilter === 'pending' ? '#D97706' : statusFilter === 'approved' ? '#047857' : '#DC2626'}
            />
            <Text style={styles.activeFilterText}>
              {statusFilter === 'pending' ? 'Bekleyen kayıtlar' : statusFilter === 'approved' ? 'Onaylı kayıtlar' : 'Reddedilen kayıtlar'}
              {' '}({filteredRows.length})
            </Text>
            <TouchableOpacity onPress={() => setStatusFilter('all')} hitSlop={8}>
              <Ionicons name="close" size={18} color={adminTheme.colors.textMuted} />
            </TouchableOpacity>
          </View>
        )}
      </>
    ),
    [statusFilter, stats, selectedStaffId, selectedStaffName, filteredRows.length, router, canUseAll, staff?.organization_id]
  );

  const listEmpty = useMemo(
    () => (
      <View style={styles.emptyWrap}>
        <View style={styles.emptyIconWrap}>
          <Ionicons name="cafe-outline" size={40} color={adminTheme.colors.textMuted} />
        </View>
        <Text style={styles.emptyTitle}>Kayıt bulunamadı</Text>
        <Text style={styles.emptySub}>
          {!canQuery
            ? 'İşletme seçin veya personel kaydına işletme atayın.'
            : selectedStaffId
              ? 'Bu personele ait kayıt yok.'
              : 'Henüz kayıt eklenmemiş.'}
        </Text>
      </View>
    ),
    [selectedStaffId, canQuery]
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <BreakfastPhotoLightbox
        visible={lightbox !== null}
        urls={lightbox?.urls ?? []}
        initialIndex={lightbox?.index ?? 0}
        onClose={() => setLightbox(null)}
      />

      <FlatList
        data={filteredRows}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmpty}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        getItemLayout={undefined}
      />

      {/* Rejection modal */}
      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={styles.modalIconWrap}>
                <Ionicons name="warning" size={24} color="#DC2626" />
              </View>
              <Text style={styles.modalTitle}>Kahvaltı Reddi</Text>
              <Text style={styles.modalSub}>
                {rejectTarget?.staff?.full_name ?? '—'} · {rejectTarget?.record_date ? formatTrDate(rejectTarget.record_date) : ''}
              </Text>
            </View>

            <Text style={styles.modalLabel}>Red nedeni</Text>
            <TextInput
              style={styles.modalInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Neden uygun görülmedi?"
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
              autoFocus
            />

            <View style={styles.modalWarning}>
              <Ionicons name="information-circle" size={16} color="#D97706" />
              <Text style={styles.modalWarningText}>
                Bu işlem mutfak puanını -5 puan etkileyecektir.
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setRejectTarget(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={reject}
                disabled={rejecting}
                activeOpacity={0.85}
              >
                {rejecting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="close-circle" size={16} color="#fff" />
                    <Text style={styles.modalConfirmText}>Reddet</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Score modal — after approve */}
      <Modal visible={scoreTarget !== null} transparent animationType="fade" onRequestClose={() => setScoreTarget(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View style={[styles.modalIconWrap, { backgroundColor: '#ECFDF5' }]}>
                <Ionicons name="star" size={24} color="#047857" />
              </View>
              <Text style={styles.modalTitle}>Kahvaltı Puanla</Text>
              <Text style={styles.modalSub}>
                {scoreTarget?.staff?.full_name ?? '—'} · {scoreTarget?.record_date ? formatTrDate(scoreTarget.record_date) : ''}
              </Text>
            </View>

            <Text style={styles.modalLabel}>Puan (pozitif = ödül, negatif = ceza)</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {[3, 5, 10].map((v) => (
                <TouchableOpacity
                  key={v}
                  onPress={() => setScoreValue(String(v))}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: scoreValue === String(v) ? '#047857' : '#E5E7EB',
                    backgroundColor: scoreValue === String(v) ? '#ECFDF5' : '#fff',
                    alignItems: 'center',
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ fontSize: 16, fontWeight: '800', color: '#047857' }}>+{v}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.modalInput, { height: 44 }]}
              value={scoreValue}
              onChangeText={setScoreValue}
              placeholder="Özel puan giriniz"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="number-pad"
            />

            <Text style={[styles.modalLabel, { marginTop: 8 }]}>Not (opsiyonel)</Text>
            <TextInput
              style={styles.modalInput}
              value={scoreNote}
              onChangeText={setScoreNote}
              placeholder="Neden puan veriliyor?"
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setScoreTarget(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.modalCancelText}>Atla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalConfirmBtn, { backgroundColor: '#047857' }]}
                onPress={submitBreakfastScore}
                disabled={scoring}
                activeOpacity={0.85}
              >
                {scoring ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="star" size={16} color="#fff" />
                    <Text style={styles.modalConfirmText}>Puanla</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Staff drawer */}
      <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          <View style={[styles.drawerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Personel Filtresi</Text>
            <Text style={styles.drawerSubtitle}>Raporları kişiye göre filtreleyin</Text>

            <TouchableOpacity
              style={[styles.drawerItem, !selectedStaffId && styles.drawerItemActive]}
              onPress={() => { setSelectedStaffId(null); setDrawerOpen(false); }}
              activeOpacity={0.82}
            >
              <View style={styles.drawerItemLeft}>
                <View style={[styles.drawerAvatar, !selectedStaffId && styles.drawerAvatarActive]}>
                  <Ionicons name="people" size={18} color={!selectedStaffId ? '#fff' : adminTheme.colors.accent} />
                </View>
                <View>
                  <Text style={[styles.drawerItemName, !selectedStaffId && styles.drawerItemNameActive]}>
                    Tüm personel
                  </Text>
                  <Text style={styles.drawerItemMeta}>{rows.length} kayıt</Text>
                </View>
              </View>
              {!selectedStaffId && <Ionicons name="checkmark-circle" size={20} color={adminTheme.colors.accent} />}
            </TouchableOpacity>

            <ScrollView style={styles.drawerScroll} showsVerticalScrollIndicator={false}>
              {staffOptions.map((opt) => {
                const active = selectedStaffId === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    style={[styles.drawerItem, active && styles.drawerItemActive]}
                    onPress={() => { setSelectedStaffId(opt.id); setDrawerOpen(false); }}
                    activeOpacity={0.82}
                  >
                    <View style={styles.drawerItemLeft}>
                      <View style={[styles.drawerAvatar, active && styles.drawerAvatarActive]}>
                        <Text style={[styles.drawerAvatarText, active && styles.drawerAvatarTextActive]}>
                          {(opt.name[0] ?? '?').toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={[styles.drawerItemName, active && styles.drawerItemNameActive]}>
                          {opt.name}
                        </Text>
                        <Text style={styles.drawerItemMeta}>
                          {opt.department ? `${opt.department} · ` : ''}{opt.count} kayıt
                        </Text>
                      </View>
                    </View>
                    {active && <Ionicons name="checkmark-circle" size={20} color={adminTheme.colors.accent} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8FAFC' },
  flatList: { flex: 1 },
  scrollContent: { paddingTop: 16 },
  orgPickerWrap: { paddingHorizontal: 16, marginBottom: 12 },

  /* Stats */
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  statCardActive: {
    borderColor: adminTheme.colors.accent,
    backgroundColor: '#FFFBF5',
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: adminTheme.colors.text,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* Filter */
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 10,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  filterChipText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  filterChipTextActive: { color: '#fff' },
  settingsBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Active filter banner */
  activeFilterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#FFF7ED',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  activeFilterText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#92400E',
  },

  /* Empty */
  emptyWrap: { alignItems: 'center', marginTop: 80, paddingHorizontal: 40 },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 14,
    color: adminTheme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Cards */
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },
  cardPending: {
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  cardAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#F59E0B',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: { flex: 1, marginRight: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  relDay: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  date: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  staffAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4F46E5',
  },
  staffName: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
  },

  /* Badges */
  badgeApproved: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeApprovedText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  badgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgePendingText: { fontSize: 12, fontWeight: '700', color: '#D97706' },
  badgeRejected: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeRejectedText: { fontSize: 12, fontWeight: '700', color: '#DC2626' },

  /* Meta */
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  metaText: { fontSize: 12, fontWeight: '500', color: adminTheme.colors.textSecondary },

  /* Note */
  noteBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#E2E8F0',
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    color: adminTheme.colors.text,
    lineHeight: 19,
  },

  /* Photos */
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 4 },
  thumb: {
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  photoCount: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  photoCountText: { color: '#fff', fontSize: 11, fontWeight: '700' },

  /* Rejection box */
  rejectionBox: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectionContent: { flex: 1 },
  rejectionLabel: { fontSize: 11, fontWeight: '700', color: '#991B1B', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  rejectionText: { fontSize: 13, color: '#7F1D1D', lineHeight: 18 },

  /* Actions */
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  approveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#047857',
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  rejectBtnText: { color: '#DC2626', fontWeight: '700', fontSize: 14 },

  /* Modal */
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 24,
  },
  modalSheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 4 },
  modalSub: { fontSize: 14, color: adminTheme.colors.textSecondary },
  modalLabel: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  modalWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  modalWarningText: { fontSize: 13, color: '#92400E', fontWeight: '500', flex: 1 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#DC2626',
  },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  /* Drawer */
  drawerOverlay: { flex: 1, justifyContent: 'flex-end' },
  drawerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
  },
  drawerSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    maxHeight: '70%',
  },
  drawerHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 16,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: adminTheme.colors.text,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  drawerSubtitle: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  drawerScroll: { paddingHorizontal: 12 },
  drawerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 4,
    marginHorizontal: 8,
  },
  drawerItemActive: {
    backgroundColor: '#FFF7ED',
  },
  drawerItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  drawerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerAvatarActive: {
    backgroundColor: adminTheme.colors.accent,
  },
  drawerAvatarText: {
    fontSize: 15,
    fontWeight: '800',
    color: adminTheme.colors.accent,
  },
  drawerAvatarTextActive: { color: '#fff' },
  drawerItemName: {
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  drawerItemNameActive: {
    color: adminTheme.colors.accent,
    fontWeight: '700',
  },
  drawerItemMeta: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginTop: 1,
  },
});
