import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Image,
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
import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';
import { notifyBreakfastApproved, notifyBreakfastRejected } from '@/lib/notificationService';

type Row = {
  id: string;
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

function formatTrDateTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function AdminBreakfastConfirmListScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<Row | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);

  const load = useCallback(async () => {
    if (!staff?.organization_id) return;
    const { data, error } = await supabase
      .from('breakfast_confirmations')
      .select('id, record_date, submitted_at, guest_count, note, photo_urls, approved_at, rejected_at, rejection_reason, staff_id, staff!staff_id(full_name, department)')
      .eq('organization_id', staff.organization_id)
      .order('submitted_at', { ascending: false })
      .limit(200);
    if (error) Alert.alert('Hata', error.message);
    else setRows((data as Row[]) ?? []);
  }, [staff?.organization_id]);

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
    if (!staff?.id || !staff.organization_id) return;
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
        organizationId: staff.organization_id,
        approverName: staff.full_name ?? 'Yönetici',
        recordDate: item.record_date,
        kitchenStaffId: item.staff_id,
      }).catch(() => {});
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Onaylanamadı');
    }
  };

  const reject = async () => {
    if (!staff?.id || !staff.organization_id || !rejectTarget) return;
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
        organization_id: staff.organization_id,
        record_date: rejectTarget.record_date,
        breakfast_confirmation_id: rejectTarget.id,
        score_delta: scoreImpact,
        reason: rejectReason.trim(),
        created_by_staff_id: staff.id,
      });

      notifyBreakfastRejected({
        organizationId: staff.organization_id,
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

  const filteredRows = useMemo(
    () => (selectedStaffId ? rows.filter((r) => r.staff_id === selectedStaffId) : rows),
    [rows, selectedStaffId]
  );

  const selectedStaffName = useMemo(
    () => staffOptions.find((s) => s.id === selectedStaffId)?.name ?? null,
    [staffOptions, selectedStaffId]
  );

  const thumbSize = Math.min(Math.floor((width - 32 - 14 - 10) / 2), 180);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
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

      {/* Toolbar */}
      <View style={styles.toolbar}>
        <TouchableOpacity
          style={[styles.filterChip, selectedStaffId && styles.filterChipActive]}
          onPress={() => setDrawerOpen(true)}
          activeOpacity={0.82}
        >
          <Ionicons
            name={selectedStaffId ? 'person' : 'people-outline'}
            size={18}
            color={selectedStaffId ? '#fff' : adminTheme.colors.primary}
          />
          <Text style={[styles.filterChipText, selectedStaffId && styles.filterChipTextActive]}>
            {selectedStaffName ?? 'Tüm personel'}
          </Text>
          <Ionicons
            name="chevron-down"
            size={16}
            color={selectedStaffId ? '#fff' : adminTheme.colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.toolBtn}
          onPress={() => router.push('/admin/breakfast-confirm/settings')}
          activeOpacity={0.85}
        >
          <Ionicons name="settings-outline" size={20} color={adminTheme.colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Main scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredRows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cafe-outline" size={48} color={adminTheme.colors.textMuted} />
            <Text style={styles.empty}>
              {selectedStaffId ? 'Bu personele ait kayıt yok.' : 'Kayıt yok.'}
            </Text>
          </View>
        ) : (
          filteredRows.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.date}>{item.record_date}</Text>
                  {item.staff?.full_name ? (
                    <Text style={styles.name}>{item.staff.full_name}</Text>
                  ) : null}
                </View>
                {item.approved_at ? (
                  <View style={styles.badgePillOk}>
                    <Ionicons name="checkmark-circle" size={14} color="#047857" />
                    <Text style={styles.badgeOkText}>Onaylı</Text>
                  </View>
                ) : item.rejected_at ? (
                  <View style={styles.badgePillReject}>
                    <Ionicons name="close-circle" size={14} color="#dc2626" />
                    <Text style={styles.badgeRejectText}>Uygun Değil</Text>
                  </View>
                ) : (
                  <View style={styles.badgePillWait}>
                    <Ionicons name="time-outline" size={14} color="#b45309" />
                    <Text style={styles.badgeWaitText}>Bekliyor</Text>
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="calendar-outline" size={14} color={adminTheme.colors.textSecondary} />
                  <Text style={styles.meta}>{formatTrDateTime(item.submitted_at)}</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={14} color={adminTheme.colors.textSecondary} />
                  <Text style={styles.meta}>{item.guest_count} kişi</Text>
                </View>
                <View style={styles.metaItem}>
                  <Ionicons name="camera-outline" size={14} color={adminTheme.colors.textSecondary} />
                  <Text style={styles.meta}>{(item.photo_urls ?? []).length} foto</Text>
                </View>
              </View>

              {item.note ? <Text style={styles.note}>{item.note}</Text> : null}

              <View style={styles.thumbRow}>
                {(item.photo_urls ?? []).map((u, idx) => (
                  <TouchableOpacity
                    key={`${item.id}-${idx}`}
                    activeOpacity={0.88}
                    onPress={() => setLightbox({ urls: item.photo_urls ?? [], index: idx })}
                  >
                    <Image
                      source={{ uri: u }}
                      style={[styles.thumb, { width: thumbSize, height: thumbSize }]}
                    />
                  </TouchableOpacity>
                ))}
              </View>

              {item.rejected_at && item.rejection_reason ? (
                <View style={styles.rejectionBox}>
                  <Ionicons name="alert-circle" size={16} color="#dc2626" />
                  <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
                </View>
              ) : null}

              {!item.approved_at && !item.rejected_at ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity style={styles.approveBtn} onPress={() => approve(item)} activeOpacity={0.85}>
                    <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                    <Text style={styles.approveBtnText}>Onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectBtn}
                    onPress={() => { setRejectTarget(item); setRejectReason(''); }}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="close-circle-outline" size={20} color="#fff" />
                    <Text style={styles.rejectBtnText}>Uygun Değil</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      {/* Rejection modal */}
      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View style={styles.rejectOverlay}>
          <View style={styles.rejectSheet}>
            <Text style={styles.rejectSheetTitle}>Kahvaltı Uygun Değil</Text>
            <Text style={styles.rejectSheetSub}>
              {rejectTarget?.staff?.full_name ?? '—'} · {rejectTarget?.record_date}
            </Text>
            <Text style={styles.rejectSheetLabel}>Red nedeni (zorunlu)</Text>
            <TextInput
              style={styles.rejectInput}
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Neden uygun görülmedi?"
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
              autoFocus
            />
            <Text style={styles.rejectScoreNote}>
              Bu işlem mutfak puanını -5 puan etkileyecektir.
            </Text>
            <View style={styles.rejectActions}>
              <TouchableOpacity
                style={styles.rejectCancelBtn}
                onPress={() => setRejectTarget(null)}
                activeOpacity={0.85}
              >
                <Text style={styles.rejectCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.rejectConfirmBtn}
                onPress={reject}
                disabled={rejecting}
                activeOpacity={0.85}
              >
                {rejecting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.rejectConfirmText}>Reddet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Staff drawer (bottom sheet modal) */}
      <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
        <View style={styles.drawerOverlay}>
          <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
          <View style={[styles.drawerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerTitle}>Personel seçin</Text>

            {/* "Tümü" seçeneği */}
            <TouchableOpacity
              style={[styles.drawerItem, !selectedStaffId && styles.drawerItemActive]}
              onPress={() => { setSelectedStaffId(null); setDrawerOpen(false); }}
              activeOpacity={0.82}
            >
              <View style={styles.drawerItemLeft}>
                <View style={[styles.drawerAvatar, !selectedStaffId && styles.drawerAvatarActive]}>
                  <Ionicons name="people" size={20} color={!selectedStaffId ? '#fff' : adminTheme.colors.primary} />
                </View>
                <View>
                  <Text style={[styles.drawerItemName, !selectedStaffId && styles.drawerItemNameActive]}>
                    Tüm personel
                  </Text>
                  <Text style={styles.drawerItemMeta}>{rows.length} kayıt</Text>
                </View>
              </View>
              {!selectedStaffId ? (
                <Ionicons name="checkmark-circle" size={22} color={adminTheme.colors.primary} />
              ) : null}
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
                    {active ? (
                      <Ionicons name="checkmark-circle" size={22} color={adminTheme.colors.primary} />
                    ) : null}
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
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    borderColor: adminTheme.colors.borderLight,
    marginRight: 10,
  },
  filterChipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  filterChipText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  toolBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 4 },

  emptyWrap: { alignItems: 'center', marginTop: 60, gap: 12 },
  empty: { textAlign: 'center', color: adminTheme.colors.textMuted, fontSize: 15 },

  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardHeaderLeft: { flex: 1, marginRight: 10 },
  date: { fontSize: 18, fontWeight: '800', color: adminTheme.colors.text },
  name: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary, marginTop: 2 },
  badgePillOk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeOkText: { fontSize: 12, fontWeight: '700', color: '#047857' },
  badgePillWait: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fffbeb',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeWaitText: { fontSize: 12, fontWeight: '700', color: '#b45309' },

  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 6 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 13, color: adminTheme.colors.textSecondary },
  note: {
    fontSize: 14,
    color: adminTheme.colors.text,
    marginTop: 6,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    lineHeight: 20,
  },

  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  thumb: {
    borderRadius: 14,
    backgroundColor: adminTheme.colors.borderLight,
  },

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
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 12,
  },
  rejectBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  badgePillReject: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  badgeRejectText: { fontSize: 12, fontWeight: '700', color: '#dc2626' },

  rejectionBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  rejectionText: { flex: 1, fontSize: 13, color: '#991b1b', lineHeight: 18 },

  rejectOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 24,
  },
  rejectSheet: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
  },
  rejectSheetTitle: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 4 },
  rejectSheetSub: { fontSize: 14, color: adminTheme.colors.textSecondary, marginBottom: 16 },
  rejectSheetLabel: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.text, marginBottom: 8 },
  rejectInput: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: adminTheme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  rejectScoreNote: {
    fontSize: 13,
    color: '#dc2626',
    marginTop: 10,
    fontWeight: '500',
  },
  rejectActions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  rejectCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  rejectCancelText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  rejectConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#dc2626',
  },
  rejectConfirmText: { color: '#fff', fontSize: 15, fontWeight: '700' },

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
    height: 5,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
    alignSelf: 'center',
    marginBottom: 14,
  },
  drawerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: adminTheme.colors.text,
    paddingHorizontal: 20,
    marginBottom: 14,
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
  },
  drawerItemActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.06)',
  },
  drawerItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  drawerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerAvatarActive: {
    backgroundColor: adminTheme.colors.primary,
  },
  drawerAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: adminTheme.colors.primary,
  },
  drawerAvatarTextActive: {
    color: '#fff',
  },
  drawerItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: adminTheme.colors.text,
  },
  drawerItemNameActive: {
    color: adminTheme.colors.primary,
  },
  drawerItemMeta: {
    fontSize: 12,
    color: adminTheme.colors.textSecondary,
    marginTop: 1,
  },
});
