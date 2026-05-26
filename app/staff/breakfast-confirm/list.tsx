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
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { canBreakfastApproveUi, canBreakfastDepartmentViewUi } from '@/lib/breakfastConfirm';
import { BreakfastPhotoLightbox } from '@/components/BreakfastPhotoLightbox';
import { useTranslation } from 'react-i18next';

type Row = {
  id: string;
  record_date: string;
  guest_count: number;
  note: string | null;
  photo_urls: string[];
  staff_id: string;
  approved_at: string | null;
  staff?: { full_name: string | null; department: string | null } | null;
};

type StaffOption = { id: string; name: string; department: string | null; count: number };

export default function BreakfastConfirmListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const canApprove = staff ? canBreakfastApproveUi(staff) : false;
  const isDeptView = staff ? canBreakfastDepartmentViewUi(staff) : false;

  const load = useCallback(async () => {
    if (!staff?.organization_id) return;
    const { data, error } = await supabase
      .from('breakfast_confirmations')
      .select('id, record_date, guest_count, note, photo_urls, staff_id, approved_at, staff!staff_id(full_name, department)')
      .eq('organization_id', staff.organization_id)
      .order('record_date', { ascending: false })
      .limit(120);
    if (error) {
      Alert.alert(t('error'), error.message);
    } else {
      setRows((data as Row[]) ?? []);
    }
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

  const approve = async (id: string) => {
    if (!staff?.id) return;
    try {
      const { error } = await supabase
        .from('breakfast_confirmations')
        .update({
          approved_at: new Date().toISOString(),
          approved_by_staff_id: staff.id,
        })
        .eq('id', id);
      if (error) throw new Error(error.message);
      await load();
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('breakfastApproveFailed'));
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

  const showStaffFilter = isDeptView && staffOptions.length > 1;
  const thumbSize = Math.min(Math.floor((width - 32 - 16 - 10) / 2), 180);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
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
      {showStaffFilter ? (
        <View style={styles.toolbar}>
          <TouchableOpacity
            style={[styles.filterChip, selectedStaffId && styles.filterChipActive]}
            onPress={() => setDrawerOpen(true)}
            activeOpacity={0.82}
          >
            <Ionicons
              name={selectedStaffId ? 'person' : 'people-outline'}
              size={18}
              color={selectedStaffId ? '#fff' : theme.colors.primary}
            />
            <Text style={[styles.filterChipText, selectedStaffId && styles.filterChipTextActive]}>
              {selectedStaffName ?? t('breakfastAllStaff') ?? 'Tüm personel'}
            </Text>
            <Ionicons
              name="chevron-down"
              size={16}
              color={selectedStaffId ? '#fff' : theme.colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.hint}>
          {isDeptView ? t('breakfastListDeptHint') : t('breakfastListMineHint')}
        </Text>
      )}

      {/* Main scrollable content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={true}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {filteredRows.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cafe-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.empty}>{t('emptyNoRecords')}</Text>
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
                    <Text style={styles.badgeOkText}>{t('approved')}</Text>
                  </View>
                ) : (
                  <View style={styles.badgePillWait}>
                    <Ionicons name="time-outline" size={14} color="#b45309" />
                    <Text style={styles.badgeWaitText}>{t('pendingApproval')}</Text>
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={14} color={theme.colors.textSecondary} />
                  <Text style={styles.meta}>{`${t('breakfastGuestCount')}: ${item.guest_count}`}</Text>
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

              {canApprove && !item.approved_at ? (
                <TouchableOpacity style={styles.approveBtn} onPress={() => approve(item.id)} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={styles.approveBtnText}>{t('approve')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
      </ScrollView>

      <TouchableOpacity
        style={[styles.fabBack, { paddingBottom: insets.bottom + 12 }]}
        onPress={() => router.back()}
        activeOpacity={0.85}
      >
        <Text style={styles.fabBackText}>{t('breakfastBackToConfirm')}</Text>
      </TouchableOpacity>

      {/* Staff drawer (bottom sheet modal) */}
      {showStaffFilter ? (
        <Modal visible={drawerOpen} transparent animationType="slide" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.drawerOverlay}>
            <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
            <View style={[styles.drawerSheet, { paddingBottom: insets.bottom + 16 }]}>
              <View style={styles.drawerHandle} />
              <Text style={styles.drawerTitle}>{t('breakfastSelectStaff') ?? 'Personel seçin'}</Text>

              <TouchableOpacity
                style={[styles.drawerItem, !selectedStaffId && styles.drawerItemActive]}
                onPress={() => { setSelectedStaffId(null); setDrawerOpen(false); }}
                activeOpacity={0.82}
              >
                <View style={styles.drawerItemLeft}>
                  <View style={[styles.drawerAvatar, !selectedStaffId && styles.drawerAvatarActive]}>
                    <Ionicons name="people" size={20} color={!selectedStaffId ? '#fff' : theme.colors.primary} />
                  </View>
                  <View>
                    <Text style={[styles.drawerItemName, !selectedStaffId && styles.drawerItemNameActive]}>
                      {t('breakfastAllStaff') ?? 'Tüm personel'}
                    </Text>
                    <Text style={styles.drawerItemMeta}>{rows.length} {t('breakfastRecordUnit') ?? 'kayıt'}</Text>
                  </View>
                </View>
                {!selectedStaffId ? (
                  <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
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
                            {opt.department ? `${opt.department} · ` : ''}{opt.count} {t('breakfastRecordUnit') ?? 'kayıt'}
                          </Text>
                        </View>
                      </View>
                      {active ? (
                        <Ionicons name="checkmark-circle" size={22} color={theme.colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  filterChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.text,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  hint: { padding: 16, fontSize: 14, color: theme.colors.textSecondary, lineHeight: 20 },

  scrollView: { flex: 1 },
  scrollContent: { paddingTop: 4 },

  emptyWrap: { alignItems: 'center', marginTop: 60, gap: 12 },
  empty: { textAlign: 'center', color: theme.colors.textMuted, fontSize: 15 },

  card: {
    marginHorizontal: 16,
    marginBottom: 14,
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
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
  date: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  name: { fontSize: 14, fontWeight: '600', color: theme.colors.primary, marginTop: 2 },
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
  meta: { fontSize: 13, color: theme.colors.textSecondary },
  note: {
    fontSize: 14,
    color: theme.colors.text,
    marginTop: 6,
    backgroundColor: '#f8fafc',
    padding: 10,
    borderRadius: 10,
    lineHeight: 20,
  },

  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  thumb: {
    borderRadius: 14,
    backgroundColor: theme.colors.borderLight,
  },

  approveBtn: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
  },
  approveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  fabBack: { padding: 16, alignItems: 'center', backgroundColor: theme.colors.backgroundSecondary },
  fabBackText: { color: theme.colors.primary, fontWeight: '600', fontSize: 16 },

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
    color: theme.colors.text,
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
    marginHorizontal: 12,
  },
  drawerItemActive: {
    backgroundColor: `${theme.colors.primary}10`,
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
    backgroundColor: theme.colors.primary,
  },
  drawerAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: theme.colors.primary,
  },
  drawerAvatarTextActive: {
    color: '#fff',
  },
  drawerItemName: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  drawerItemNameActive: {
    color: theme.colors.primary,
  },
  drawerItemMeta: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 1,
  },
});
