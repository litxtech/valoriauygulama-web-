import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
  TextInput,
  Modal,
  Pressable,
  Platform,
  Keyboard,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { canAccessOccupancyOps } from '@/lib/staffPermissions';
import { theme } from '@/constants/theme';
import { createAdminQuickNote } from '@/lib/adminQuickNotes';
import {
  buildExtraCleaningNote,
  scheduleSelectableRoomsForCleaning,
} from '@/lib/roomHousekeeping';
import {
  addDaysIso,
  CHECKOUT_STATUS_COLORS,
  changeCheckoutJobRoom,
  completeCheckoutJob,
  countCheckoutJobs,
  fetchCheckoutJobsForDate,
  fetchOrgRooms,
  fetchRoomsForCheckoutMove,
  formatCheckoutDateTime,
  removeCheckoutJob,
  scheduleCheckoutRoomByNumber,
  scheduleRoomsForCheckout,
  setCheckoutJobPriority,
  subscribeCheckoutJobs,
  todayIsoInIstanbul,
  updateCheckoutJobNote,
  type CheckoutJobStatus,
  type RoomCheckoutJobView,
  type RoomMeta,
} from '@/lib/checkoutBoard';

const ACCENT = '#c2410c';
const MOVE_ACCENT = '#1d4ed8';
const MANAGER_ACCENT = '#7c3aed';
const CLEAN_ACCENT = '#0f766e';

/** Planlanmış çıkış odaları (temizlik planı gibi) */
type FilterKey = 'needs' | 'done' | 'all' | CheckoutJobStatus;

function formatDateChip(iso: string, today: string): string {
  if (iso === today) return 'Bugün';
  const tomorrow = addDaysIso(today, 1);
  if (iso === tomorrow) return 'Yarın';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString('tr-TR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

export default function CheckoutBoardScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id ?? null;
  const allowed = canAccessOccupancyOps(staff);
  const canPlan = allowed;

  const today = useMemo(() => todayIsoInIstanbul(), []);
  const dateOptions = useMemo(() => Array.from({ length: 8 }, (_, i) => addDaysIso(today, i)), [today]);

  const [targetDate, setTargetDate] = useState(() => addDaysIso(today, 1));
  const [filter, setFilter] = useState<FilterKey>('needs');
  const [jobs, setJobs] = useState<RoomCheckoutJobView[]>([]);
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [planOpen, setPlanOpen] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [quickRoom, setQuickRoom] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [quickPriority, setQuickPriority] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);

  const [noteJob, setNoteJob] = useState<RoomCheckoutJobView | null>(null);
  const [noteText, setNoteText] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const [moveJob, setMoveJob] = useState<RoomCheckoutJobView | null>(null);
  const [moveRooms, setMoveRooms] = useState<RoomMeta[]>([]);
  const [moveTargetId, setMoveTargetId] = useState<string | null>(null);
  const [moveBusy, setMoveBusy] = useState(false);
  const [moveLoadingRooms, setMoveLoadingRooms] = useState(false);

  const [managerNoteOpen, setManagerNoteOpen] = useState(false);
  const [managerNoteBody, setManagerNoteBody] = useState('');
  const [managerNoteRoom, setManagerNoteRoom] = useState('');
  const [managerNoteUrgent, setManagerNoteUrgent] = useState(false);
  const [managerNoteBusy, setManagerNoteBusy] = useState(false);

  const [extraCleanOpen, setExtraCleanOpen] = useState(false);
  const [extraCleanSelected, setExtraCleanSelected] = useState<Set<string>>(new Set());
  const [extraCleanNote, setExtraCleanNote] = useState('');
  const [extraCleanBusy, setExtraCleanBusy] = useState(false);
  /** Temizlik Planı tarihi — çıkış planı tarihinden bağımsız (varsayılan: bugün). */
  const [extraCleanDate, setExtraCleanDate] = useState(() => todayIsoInIstanbul());

  const cols = width >= 900 ? 3 : width >= 700 ? 2 : 1;
  const gap = 12;
  const tileW = (width - 32 - (cols - 1) * gap) / cols;

  const load = useCallback(
    async (soft = false) => {
      if (!orgId) return;
      if (!soft) setLoading(true);
      else setRefreshing(true);
      try {
        const [list, orgRooms] = await Promise.all([
          fetchCheckoutJobsForDate(orgId, targetDate),
          fetchOrgRooms(orgId).catch(() => [] as RoomMeta[]),
        ]);
        setJobs(list);
        setRooms(orgRooms);
      } catch (e) {
        Alert.alert('Hata', e instanceof Error ? e.message : 'Liste yüklenemedi');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, targetDate]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!orgId) return;
    const ch = subscribeCheckoutJobs(orgId, targetDate, () => {
      void load(true);
    });
    return () => {
      void ch.unsubscribe();
    };
  }, [orgId, targetDate, load]);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      const h = e.endCoordinates?.height;
      setKeyboardOffset(typeof h === 'number' && h > 0 ? h : 0);
    });
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardOffset(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(() => {
    if (!noteJob && !addOpen && !moveJob && !managerNoteOpen && !extraCleanOpen) {
      setKeyboardOffset(0);
      Keyboard.dismiss();
    }
  }, [noteJob, addOpen, moveJob, managerNoteOpen, extraCleanOpen]);

  const toggleExtraCleanRoom = (id: string) => {
    setExtraCleanSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onScheduleExtraClean = async () => {
    if (!staff?.id || !orgId) {
      Alert.alert('Ekstra temizlik', 'Oturum veya otel bilgisi eksik. Yeniden giriş yapın.');
      return;
    }
    const picked = rooms.filter((r) => extraCleanSelected.has(r.id));
    if (picked.length === 0) {
      Alert.alert('Oda seçin', 'Ekstra temizlik için odaları işaretleyin.');
      return;
    }
    setExtraCleanBusy(true);
    try {
      const res = await scheduleSelectableRoomsForCleaning({
        organizationId: orgId,
        rooms: picked,
        targetDate: extraCleanDate,
        staffId: staff.id,
        note: buildExtraCleaningNote(extraCleanNote),
        isPriority: false,
      });
      if (!res.count) {
        throw new Error('Hiçbir oda eklenemedi.');
      }
      const dateLabel = formatDateChip(extraCleanDate, today);
      const roomList = picked.map((r) => r.room_number).join(', ');
      setExtraCleanOpen(false);
      setExtraCleanSelected(new Set());
      setExtraCleanNote('');
      Alert.alert(
        'Temizlik Planı’na eklendi',
        `${res.count} oda → Temizlik Planı · ${dateLabel}\n${roomList}\n\nÇıkış listesinde görünmez. Menü → Temizlik’te bu tarihte görürsünüz.`,
        [
          { text: 'Tamam', style: 'cancel' },
          {
            text: 'Temizlik Planı’nı aç',
            onPress: () =>
              router.push({
                pathname: '/staff/cleaning-plan',
                params: { date: extraCleanDate },
              } as never),
          },
        ]
      );
    } catch (e) {
      Alert.alert('Ekstra temizlik', e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setExtraCleanBusy(false);
    }
  };

  const openManagerNote = (roomNumber?: string) => {
    setManagerNoteRoom(roomNumber?.trim() ?? '');
    setManagerNoteBody('');
    setManagerNoteUrgent(false);
    setManagerNoteOpen(true);
  };

  const saveManagerNote = async () => {
    if (!staff?.id || !orgId) return;
    const body = managerNoteBody.trim();
    if (!body) {
      Alert.alert('Not gerekli', 'Yöneticiye iletilecek metni yazın.');
      return;
    }
    setManagerNoteBusy(true);
    try {
      const room = managerNoteRoom.trim();
      const title = room
        ? `Çıkış odaları · Oda ${room}`
        : `Çıkış odaları · ${formatDateChip(targetDate, today)}`;
      const { error } = await createAdminQuickNote({
        organizationId: orgId,
        staffId: staff.id,
        bodyText: body,
        title,
        tag: managerNoteUrgent ? 'urgent' : 'room',
        roomLabel: room || null,
      });
      if (error) throw new Error(error);
      setManagerNoteOpen(false);
      setManagerNoteBody('');
      setManagerNoteRoom('');
      setManagerNoteUrgent(false);
      Alert.alert('Gönderildi', 'Not yöneticiye iletildi.');
    } catch (e) {
      Alert.alert('Not', e instanceof Error ? e.message : 'Gönderilemedi');
    } finally {
      setManagerNoteBusy(false);
    }
  };

  const openMove = async (job: RoomCheckoutJobView) => {
    if (!orgId) return;
    setMoveJob(job);
    setMoveTargetId(null);
    setMoveLoadingRooms(true);
    try {
      const list = await fetchRoomsForCheckoutMove(orgId, job.room_id);
      setMoveRooms(list);
    } catch (e) {
      Alert.alert('Oda değiştir', e instanceof Error ? e.message : 'Odalar yüklenemedi');
      setMoveJob(null);
    } finally {
      setMoveLoadingRooms(false);
    }
  };

  const onMoveConfirm = async () => {
    if (!staff?.id || !moveJob || !moveTargetId) {
      Alert.alert('Oda seçin', 'Misafirin taşınacağı yeni odayı seçin.');
      return;
    }
    const target = moveRooms.find((r) => r.id === moveTargetId);
    if (!target) return;
    setMoveBusy(true);
    try {
      const res = await changeCheckoutJobRoom({
        job: moveJob,
        newRoom: target,
        staffId: staff.id,
      });
      setMoveJob(null);
      setMoveTargetId(null);
      Alert.alert(
        'Oda değiştirildi',
        `${res.fromRoom} → ${res.toRoom}${res.moved > 0 ? ` · ${res.moved} misafir taşındı` : ''}`
      );
      await load(true);
    } catch (e) {
      Alert.alert('Oda değiştir', e instanceof Error ? e.message : 'Taşınamadı');
    } finally {
      setMoveBusy(false);
    }
  };

  const counts = useMemo(() => countCheckoutJobs(jobs), [jobs]);

  const filtered = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'needs') return jobs.filter((j) => j.status === 'pending');
    if (filter === 'done') return jobs.filter((j) => j.status === 'done');
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  const scheduledKeys = useMemo(() => {
    const ids = new Set<string>();
    const labels = new Set<string>();
    for (const j of jobs) {
      if (j.room_id) ids.add(j.room_id);
      labels.add(j.room_number.trim().toLowerCase());
    }
    return { ids, labels };
  }, [jobs]);

  const progressPct =
    counts.total === 0 ? 0 : Math.round((counts.done / counts.total) * 100);

  const toggleRoom = (id: string) => {
    setSelectedRoomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onSchedule = async () => {
    if (!staff?.id || !orgId) return;
    const picked = rooms.filter((r) => selectedRoomIds.has(r.id));
    if (picked.length === 0) {
      Alert.alert('Oda seçin', 'Çıkış listesine eklenecek odaları işaretleyin.');
      return;
    }
    setScheduling(true);
    try {
      await scheduleRoomsForCheckout({
        organizationId: orgId,
        rooms: picked,
        targetDate,
        staffId: staff.id,
      });
      setPlanOpen(false);
      setSelectedRoomIds(new Set());
      setFilter('needs');
      await load(true);
    } catch (e) {
      Alert.alert('Planla', e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setScheduling(false);
    }
  };

  const onQuickAdd = async () => {
    if (!staff?.id || !orgId) return;
    if (!quickRoom.trim()) {
      Alert.alert('Oda gerekli', 'Oda numarasını yazın (örn. 204).');
      return;
    }
    setQuickBusy(true);
    try {
      await scheduleCheckoutRoomByNumber({
        organizationId: orgId,
        roomNumber: quickRoom,
        targetDate,
        staffId: staff.id,
        note: quickNote,
        isPriority: quickPriority,
      });
      setQuickRoom('');
      setQuickNote('');
      setQuickPriority(false);
      setAddOpen(false);
      setFilter('needs');
      await load(true);
    } catch (e) {
      Alert.alert('Ekle', e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setQuickBusy(false);
    }
  };

  const onCheckout = (job: RoomCheckoutJobView) => {
    if (!staff?.id) return;
    const guestLine =
      job.guest_names.length > 0
        ? `\nMisafir: ${job.guest_names.join(', ')}`
        : '\n(Odada kayıtlı misafir yoksa yalnızca listeden düşer)';
    Alert.alert(
      'Çıkış yap',
      `${job.room_number} odası için çıkış onaylansın mı?${guestLine}`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Çıkış yap',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusyId(job.id);
              try {
                const res = await completeCheckoutJob({
                  job,
                  staffId: staff.id!,
                });
                if (res.checkedOut === 0 && job.room_id) {
                  Alert.alert(
                    'Tamam',
                    'Oda listeden çıktı. Odada checked-in misafir yoktu.'
                  );
                }
                await load(true);
              } catch (e) {
                Alert.alert('Çıkış', e instanceof Error ? e.message : 'Yapılamadı');
              } finally {
                setBusyId(null);
              }
            })();
          },
        },
      ]
    );
  };

  const onRemove = (job: RoomCheckoutJobView) => {
    Alert.alert('Listeden çıkar', `${job.room_number} çıkış listesinden silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(job.id);
            try {
              await removeCheckoutJob(job.id);
              await load(true);
            } catch (e) {
              Alert.alert('Hata', e instanceof Error ? e.message : 'Silinemedi');
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const saveNote = async () => {
    if (!noteJob) return;
    setBusyId(noteJob.id);
    try {
      await updateCheckoutJobNote(noteJob.id, noteText);
      setNoteJob(null);
      setNoteText('');
      await load(true);
    } catch (e) {
      Alert.alert('Not', e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setBusyId(null);
    }
  };

  if (!allowed) return <Redirect href="/staff" />;
  if (!orgId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Organizasyon bulunamadı</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>Canlı</Text>
            <View style={styles.heroKindPill}>
              <Text style={styles.heroKindText}>ÇIKIŞ PLANI</Text>
            </View>
          </View>
          <Text style={styles.heroTitle}>Çıkış Odaları</Text>
          <Text style={styles.heroSub}>
            Akşam yarın çıkacak odaları planlayın. Sabah listeden çıkış yapın. Mavi buton oda değiştirmedir — çıkış değildir.
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {counts.done}/{counts.total} çıktı · {counts.pending} bekliyor
          </Text>
        </View>

        {counts.pending > 0 ? (
          <View style={styles.needsBanner}>
            <Ionicons name="exit-outline" size={18} color="#9a3412" />
            <Text style={styles.needsBannerText}>
              {formatDateChip(targetDate, today)} · {counts.pending} oda çıkış bekliyor
            </Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <View style={styles.chipRow}>
            {dateOptions.map((d) => (
              <TouchableOpacity
                key={d}
                style={[styles.dateChip, targetDate === d && styles.dateChipOn]}
                onPress={() => setTargetDate(d)}
              >
                <Text style={[styles.dateChipText, targetDate === d && styles.dateChipTextOn]}>
                  {formatDateChip(d, today)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {canPlan ? (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.planBtn}
              onPress={() => {
                setSelectedRoomIds(new Set());
                setPlanOpen(true);
              }}
            >
              <Ionicons name="exit-outline" size={18} color="#fff" />
              <Text style={styles.planBtnText}>Çıkış planla</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extraBtn} onPress={() => setAddOpen(true)}>
              <Ionicons name="add" size={20} color={ACCENT} />
              <Text style={styles.extraBtnText}>Oda ekle</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <TouchableOpacity style={styles.managerSection} onPress={() => openManagerNote()} activeOpacity={0.88}>
          <View style={styles.managerSectionIcon}>
            <Ionicons name="briefcase-outline" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.managerSectionTitle}>Yöneticiye not bırak</Text>
            <Text style={styles.managerSectionSub}>
              Çıkış / oda ile ilgili not — yöneticiye anında iletilir
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#c4b5fd" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.extraCleanSection}
          onPress={() => {
            setExtraCleanSelected(new Set());
            setExtraCleanNote('');
            setExtraCleanDate(today);
            setExtraCleanOpen(true);
            if (rooms.length === 0 && orgId) {
              void fetchOrgRooms(orgId)
                .then(setRooms)
                .catch(() => undefined);
            }
          }}
          activeOpacity={0.88}
        >
          <View style={styles.extraCleanSectionIcon}>
            <Ionicons name="sparkles-outline" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.extraCleanSectionTitle}>Ekstra temizlik</Text>
            <Text style={styles.extraCleanSectionSub}>
              Çıkış listesinde görünmez · Temizlik Planı’na gider (bugün)
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#99f6e4" />
        </TouchableOpacity>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          <View style={styles.chipRow}>
            {(
              [
                ['needs', `Bekleyen (${counts.pending})`],
                ['done', `Çıktı (${counts.done})`],
                ['all', `Tümü (${counts.total})`],
              ] as const
            ).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, filter === key && styles.filterChipOn]}
                onPress={() => setFilter(key)}
              >
                <Text style={[styles.filterChipText, filter === key && styles.filterChipTextOn]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {loading && jobs.length === 0 ? (
          <View style={styles.centeredPad}>
            <ActivityIndicator color={ACCENT} size="large" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="calendar-outline" size={40} color="#94a3b8" />
            <Text style={styles.emptyTitle}>Liste boş</Text>
            <Text style={styles.emptySub}>
              {canPlan
                ? 'Planla ile çıkacak odaları seçin (yarın için akşam planlayın).'
                : 'Bu tarihte planlanmış çıkış odası yok.'}
            </Text>
            {canPlan ? (
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => {
                  setSelectedRoomIds(new Set());
                  setPlanOpen(true);
                }}
              >
                <Text style={styles.emptyCtaText}>Çıkış planla</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={[styles.grid, { gap }]}>
            {filtered.map((job) => {
              const colors = CHECKOUT_STATUS_COLORS[job.status];
              const busy = busyId === job.id;
              const isPending = job.status === 'pending';
              return (
                <View
                  key={job.id}
                  style={[
                    styles.tile,
                    {
                      width: tileW,
                      borderColor: isPending ? '#fdba74' : colors.border,
                      backgroundColor: '#fff',
                    },
                  ]}
                >
                  <View style={[styles.tileRibbon, { backgroundColor: isPending ? ACCENT : colors.accent }]}>
                    <Ionicons
                      name={isPending ? 'exit-outline' : 'checkmark-circle'}
                      size={14}
                      color="#fff"
                    />
                    <Text style={styles.tileRibbonText}>
                      {isPending ? 'ÇIKIŞ BEKLİYOR' : 'ÇIKIŞ YAPILDI'}
                    </Text>
                    {job.is_priority ? (
                      <View style={styles.prioInline}>
                        <Ionicons name="flash" size={11} color="#fff" />
                        <Text style={styles.prioInlineText}>Öncelik</Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.tileBody}>
                    <View style={styles.tileRoomRow}>
                      <Text style={[styles.tileRoom, { color: isPending ? '#9a3412' : colors.text }]}>
                        {job.room_number}
                      </Text>
                      {job.floor != null ? (
                        <Text style={styles.tileFloor}>{job.floor}. kat</Text>
                      ) : null}
                    </View>

                    <Text style={styles.guestLabel}>Misafir</Text>
                    {job.guest_names.length > 0 ? (
                      <Text style={styles.guestLine} numberOfLines={2}>
                        {job.guest_names.join(', ')}
                      </Text>
                    ) : (
                      <Text style={styles.guestLineMuted}>Kayıtlı misafir yok</Text>
                    )}

                    {job.note ? (
                      <Text style={styles.noteLine} numberOfLines={2}>
                        Not: {job.note}
                      </Text>
                    ) : null}

                    {job.status === 'done' && job.completed_at ? (
                      <Text style={styles.metaLine}>
                        {job.completed_by_name ?? '—'} · {formatCheckoutDateTime(job.completed_at)}
                      </Text>
                    ) : job.scheduled_by_name ? (
                      <Text style={styles.metaLine}>Planlayan: {job.scheduled_by_name}</Text>
                    ) : null}

                    {isPending ? (
                      <View style={styles.actionStack}>
                        <TouchableOpacity
                          style={[styles.checkoutBtn, busy && styles.btnDisabled]}
                          disabled={busy}
                          onPress={() => onCheckout(job)}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <>
                              <Ionicons name="exit-outline" size={18} color="#fff" />
                              <Text style={styles.checkoutBtnText}>Çıkış yap</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.moveBtn, busy && styles.btnDisabled]}
                          disabled={busy}
                          onPress={() => void openMove(job)}
                        >
                          <Ionicons name="swap-horizontal" size={18} color={MOVE_ACCENT} />
                          <Text style={styles.moveBtnText}>Oda değiştir</Text>
                        </TouchableOpacity>
                        <Text style={styles.moveHint}>Oda değiştir ≠ çıkış · misafir başka odaya taşınır</Text>
                      </View>
                    ) : null}

                    <View style={styles.toolGrid}>
                      <TouchableOpacity
                        style={styles.toolBtn}
                        onPress={() => {
                          setNoteJob(job);
                          setNoteText(job.note ?? '');
                        }}
                      >
                        <Ionicons name="create-outline" size={18} color="#475569" />
                        <Text style={styles.toolBtnLabel} numberOfLines={1}>
                          Liste notu
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.toolBtn}
                        onPress={() => openManagerNote(job.room_number)}
                      >
                        <Ionicons name="briefcase-outline" size={18} color={MANAGER_ACCENT} />
                        <Text style={[styles.toolBtnLabel, { color: MANAGER_ACCENT }]} numberOfLines={1}>
                          Yönetici notu
                        </Text>
                      </TouchableOpacity>
                      {canPlan && isPending ? (
                        <TouchableOpacity
                          style={styles.toolBtn}
                          onPress={() =>
                            void setCheckoutJobPriority(job.id, !job.is_priority).then(() => load(true))
                          }
                        >
                          <Ionicons
                            name={job.is_priority ? 'flash' : 'flash-outline'}
                            size={18}
                            color={job.is_priority ? '#ea580c' : '#64748b'}
                          />
                          <Text
                            style={[
                              styles.toolBtnLabel,
                              job.is_priority ? { color: '#ea580c' } : null,
                            ]}
                            numberOfLines={1}
                          >
                            Öncelik
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      {canPlan ? (
                        <TouchableOpacity style={styles.toolBtn} onPress={() => onRemove(job)}>
                          <Ionicons name="trash-outline" size={18} color="#dc2626" />
                          <Text style={[styles.toolBtnLabel, { color: '#dc2626' }]} numberOfLines={1}>
                            Sil
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Plan modal — temizlik gibi oda seç */}
      <Modal visible={planOpen} animationType="slide" onRequestClose={() => setPlanOpen(false)}>
        <View style={[styles.modalFull, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.modalHead}>
            <View style={{ flex: 1 }}>
              <View style={styles.planModalBadge}>
                <Ionicons name="exit-outline" size={14} color="#fff" />
                <Text style={styles.planModalBadgeText}>ÇIKIŞ PLANLA</Text>
              </View>
              <Text style={styles.modalTitle}>
                {formatDateChip(targetDate, today)} çıkacak odalar
              </Text>
            </View>
            <TouchableOpacity onPress={() => setPlanOpen(false)}>
              <Ionicons name="close" size={26} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <Text style={styles.modalHint}>
            İşaretlediğiniz odalar çıkış listesine eklenir. Bu ekran oda değiştirme değildir.
          </Text>
          <ScrollView contentContainerStyle={styles.planGrid}>
            {rooms.map((room) => {
              const already =
                scheduledKeys.ids.has(room.id) ||
                scheduledKeys.labels.has(room.room_number.trim().toLowerCase());
              const selected = selectedRoomIds.has(room.id);
              return (
                <TouchableOpacity
                  key={room.id}
                  style={[
                    styles.planChip,
                    selected && styles.planChipOn,
                    already && styles.planChipAlready,
                  ]}
                  onPress={() => !already && toggleRoom(room.id)}
                  disabled={already}
                >
                  <Text
                    style={[
                      styles.planChipText,
                      selected && styles.planChipTextOn,
                      already && styles.planChipTextAlready,
                    ]}
                  >
                    {room.room_number}
                  </Text>
                  {already ? <Text style={styles.planChipSub}>listede</Text> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity
            style={[styles.modalPrimary, scheduling && styles.btnDisabled]}
            disabled={scheduling}
            onPress={() => void onSchedule()}
          >
            {scheduling ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalPrimaryText}>
                Listeye ekle ({selectedRoomIds.size})
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Quick add */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setAddOpen(false)} />
          <View
            style={[
              styles.sheet,
              {
                marginBottom: keyboardOffset > 0 ? keyboardOffset : Math.max(insets.bottom, 12),
              },
            ]}
          >
            <Text style={styles.modalTitle}>Oda ekle</Text>
            <Text style={styles.modalHint}>
              {formatDateChip(targetDate, today)} çıkış listesine
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Örn. 204"
              placeholderTextColor="#94a3b8"
              value={quickRoom}
              onChangeText={setQuickRoom}
              autoCapitalize="characters"
              autoFocus
            />
            <TextInput
              style={styles.input}
              placeholder="Not (isteğe bağlı)"
              placeholderTextColor="#94a3b8"
              value={quickNote}
              onChangeText={setQuickNote}
            />
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setQuickPriority((p) => !p)}
            >
              <Ionicons
                name={quickPriority ? 'checkbox' : 'square-outline'}
                size={22}
                color={ACCENT}
              />
              <Text style={styles.checkLabel}>Öncelikli</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalPrimary, quickBusy && styles.btnDisabled]}
              disabled={quickBusy}
              onPress={() => void onQuickAdd()}
            >
              <Text style={styles.modalPrimaryText}>Ekle</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Room change — distinct from checkout */}
      <Modal
        visible={!!moveJob}
        transparent
        animationType="slide"
        onRequestClose={() => setMoveJob(null)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setMoveJob(null)} />
          <View
            style={[
              styles.sheet,
              styles.moveSheet,
              {
                maxHeight: '88%',
                marginBottom: keyboardOffset > 0 ? keyboardOffset : Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.moveHeader}>
              <View style={styles.moveBadge}>
                <Ionicons name="swap-horizontal" size={16} color="#fff" />
                <Text style={styles.moveBadgeText}>ODA DEĞİŞTİR</Text>
              </View>
              <TouchableOpacity onPress={() => setMoveJob(null)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <View style={styles.moveWarn}>
              <Ionicons name="information-circle" size={18} color={MOVE_ACCENT} />
              <Text style={styles.moveWarnText}>
                Bu işlem çıkış değildir. Misafir otelde kalır; yalnızca oda numarası değişir.
              </Text>
            </View>
            <Text style={styles.moveFromLabel}>Şu anki oda</Text>
            <Text style={styles.moveFromRoom}>{moveJob?.room_number ?? '—'}</Text>
            {moveJob?.guest_names?.length ? (
              <Text style={styles.moveGuests} numberOfLines={2}>
                {moveJob.guest_names.join(', ')}
              </Text>
            ) : null}
            <Text style={styles.moveFromLabel}>Yeni oda seçin</Text>
            {moveLoadingRooms ? (
              <ActivityIndicator color={MOVE_ACCENT} style={{ marginVertical: 20 }} />
            ) : (
              <ScrollView
                style={{ maxHeight: 280 }}
                contentContainerStyle={styles.planGrid}
                keyboardShouldPersistTaps="handled"
              >
                {moveRooms.map((room) => {
                  const selected = moveTargetId === room.id;
                  return (
                    <TouchableOpacity
                      key={room.id}
                      style={[styles.moveChip, selected && styles.moveChipOn]}
                      onPress={() => setMoveTargetId(room.id)}
                    >
                      <Text style={[styles.moveChipText, selected && styles.moveChipTextOn]}>
                        {room.room_number}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity
              style={[styles.moveConfirmBtn, (!moveTargetId || moveBusy) && styles.btnDisabled]}
              disabled={!moveTargetId || moveBusy}
              onPress={() => void onMoveConfirm()}
            >
              {moveBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.moveConfirmText}>
                  {moveTargetId
                    ? `${moveJob?.room_number} → ${moveRooms.find((r) => r.id === moveTargetId)?.room_number ?? ''} taşı`
                    : 'Önce yeni oda seçin'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Job list note (not manager) */}
      <Modal visible={!!noteJob} transparent animationType="slide" onRequestClose={() => setNoteJob(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNoteJob(null)} />
          <View
            style={[
              styles.sheet,
              {
                marginBottom: keyboardOffset > 0 ? keyboardOffset : Math.max(insets.bottom, 12),
              },
            ]}
          >
            <Text style={styles.modalTitle}>Liste notu · {noteJob?.room_number}</Text>
            <Text style={styles.modalHint}>Sadece bu çıkış kartında görünür. Yöneticiye gitmez.</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              placeholder="Liste notu…"
              placeholderTextColor="#94a3b8"
              value={noteText}
              onChangeText={setNoteText}
              multiline
              autoFocus
            />
            <TouchableOpacity style={styles.modalPrimary} onPress={() => void saveNote()}>
              <Text style={styles.modalPrimaryText}>Kaydet</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Manager note */}
      <Modal
        visible={managerNoteOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setManagerNoteOpen(false)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setManagerNoteOpen(false)} />
          <View
            style={[
              styles.sheet,
              styles.managerSheet,
              {
                marginBottom: keyboardOffset > 0 ? keyboardOffset : Math.max(insets.bottom, 12),
              },
            ]}
          >
            <View style={styles.managerModalHead}>
              <View style={styles.managerBadge}>
                <Ionicons name="briefcase" size={14} color="#fff" />
                <Text style={styles.managerBadgeText}>YÖNETİCİYE NOT</Text>
              </View>
              <TouchableOpacity onPress={() => setManagerNoteOpen(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color="#64748b" />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalHint}>
              Bu not yöneticiye push olarak gider. Liste notundan farklıdır.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Oda no (isteğe bağlı)"
              placeholderTextColor="#94a3b8"
              value={managerNoteRoom}
              onChangeText={setManagerNoteRoom}
              autoCapitalize="characters"
            />
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: 'top' }]}
              placeholder="Yöneticiye ne yazmak istiyorsunuz?"
              placeholderTextColor="#94a3b8"
              value={managerNoteBody}
              onChangeText={setManagerNoteBody}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setManagerNoteUrgent((u) => !u)}
            >
              <Ionicons
                name={managerNoteUrgent ? 'checkbox' : 'square-outline'}
                size={22}
                color={managerNoteUrgent ? '#dc2626' : MANAGER_ACCENT}
              />
              <Text style={[styles.checkLabel, managerNoteUrgent && { color: '#dc2626' }]}>
                Acil olarak işaretle
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.managerSendBtn, managerNoteBusy && styles.btnDisabled]}
              disabled={managerNoteBusy}
              onPress={() => void saveManagerNote()}
            >
              {managerNoteBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.managerSendText}>Yöneticiye gönder</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Extra cleaning — NOT checkout */}
      <Modal
        visible={extraCleanOpen}
        animationType="slide"
        onRequestClose={() => setExtraCleanOpen(false)}
      >
        <View style={[styles.modalFull, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}>
          <View style={styles.modalHead}>
            <View style={{ flex: 1 }}>
              <View style={styles.extraCleanModalBadge}>
                <Ionicons name="sparkles" size={14} color="#fff" />
                <Text style={styles.extraCleanModalBadgeText}>EKSTRA TEMİZLİK</Text>
              </View>
              <Text style={styles.modalTitle}>Temizlik isteyen odalar</Text>
              <Text style={styles.extraCleanDestHint}>
                Kayıt → Temizlik Planı (çıkış listesine yazılmaz)
              </Text>
            </View>
            <TouchableOpacity onPress={() => setExtraCleanOpen(false)}>
              <Ionicons name="close" size={26} color="#0f172a" />
            </TouchableOpacity>
          </View>
          <View style={styles.extraCleanWarn}>
            <Ionicons name="information-circle" size={18} color={CLEAN_ACCENT} />
            <Text style={styles.extraCleanWarnText}>
              Seçilen odalar Temizlik Planı’nda “EKSTRA TEMİZLİK” olarak görünür. Çıkış panosunda görünmez.
            </Text>
          </View>
          <Text style={styles.extraCleanDateLabel}>Temizlik tarihi</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.chipScroll}
            contentContainerStyle={styles.chipRow}
          >
            {dateOptions.slice(0, 5).map((d) => (
              <TouchableOpacity
                key={`ec-${d}`}
                style={[styles.dateChip, extraCleanDate === d && styles.extraCleanDateChipOn]}
                onPress={() => setExtraCleanDate(d)}
              >
                <Text
                  style={[
                    styles.dateChipText,
                    extraCleanDate === d && styles.extraCleanDateChipTextOn,
                  ]}
                >
                  {formatDateChip(d, today)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TextInput
            style={styles.input}
            placeholder="Not (isteğe bağlı) — örn. mini bar, leke"
            placeholderTextColor="#94a3b8"
            value={extraCleanNote}
            onChangeText={setExtraCleanNote}
          />
          <ScrollView contentContainerStyle={styles.planGrid} keyboardShouldPersistTaps="handled">
            {rooms.length === 0 ? (
              <View style={styles.centeredPad}>
                <ActivityIndicator color={CLEAN_ACCENT} />
                <Text style={[styles.muted, { marginTop: 8 }]}>Odalar yükleniyor…</Text>
              </View>
            ) : (
              rooms.map((room) => {
                const selected = extraCleanSelected.has(room.id);
                return (
                  <TouchableOpacity
                    key={room.id}
                    style={[styles.extraCleanChip, selected && styles.extraCleanChipOn]}
                    onPress={() => toggleExtraCleanRoom(room.id)}
                  >
                    <Text style={[styles.extraCleanChipText, selected && styles.extraCleanChipTextOn]}>
                      {room.room_number}
                    </Text>
                    {selected ? (
                      <Text style={styles.extraCleanChipSub}>temizlik</Text>
                    ) : null}
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
          <TouchableOpacity
            style={[
              styles.extraCleanConfirmBtn,
              (extraCleanBusy || extraCleanSelected.size === 0) && styles.btnDisabled,
            ]}
            disabled={extraCleanBusy || extraCleanSelected.size === 0}
            onPress={() => void onScheduleExtraClean()}
          >
            {extraCleanBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.extraCleanConfirmText}>
                Temizlik Planı’na ekle · {formatDateChip(extraCleanDate, today)} (
                {extraCleanSelected.size})
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centeredPad: { paddingVertical: 48, alignItems: 'center' },
  muted: { color: theme.colors.textSecondary },
  hero: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#4ade80' },
  liveText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  heroKindPill: {
    marginLeft: 'auto',
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  heroKindText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  heroSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 6, lineHeight: 18 },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 14,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#fb923c', borderRadius: 4 },
  progressLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 8, fontWeight: '600' },
  needsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  needsBannerText: { flex: 1, color: '#9a3412', fontWeight: '700', fontSize: 13 },
  chipScroll: { marginBottom: 10, flexGrow: 0 },
  chipRow: { flexDirection: 'row', gap: 8, paddingRight: 8 },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateChipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  dateChipText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  dateChipTextOn: { color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  planBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 12,
  },
  planBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  extraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#fed7aa',
  },
  extraBtnText: { color: ACCENT, fontWeight: '800', fontSize: 13 },
  managerSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#4c1d95',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#6d28d9',
  },
  managerSectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: MANAGER_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  managerSectionTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  managerSectionSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  extraCleanSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#134e4a',
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#0f766e',
  },
  extraCleanSectionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: CLEAN_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  extraCleanSectionTitle: { color: '#fff', fontWeight: '800', fontSize: 15 },
  extraCleanSectionSub: { color: 'rgba(255,255,255,0.72)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  extraCleanDestHint: {
    fontSize: 12,
    fontWeight: '600',
    color: CLEAN_ACCENT,
    marginTop: 4,
  },
  extraCleanDateLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  extraCleanDateChipOn: { backgroundColor: CLEAN_ACCENT, borderColor: CLEAN_ACCENT },
  extraCleanDateChipTextOn: { color: '#fff' },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  filterChipTextOn: { color: '#fff' },
  emptyBox: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  emptySub: {
    fontSize: 13,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  emptyCta: {
    marginTop: 12,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.07,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  tileRibbon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tileRibbonText: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.3, flex: 1 },
  prioInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  prioInlineText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tileBody: { padding: 14 },
  tileRoomRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 8 },
  tileRoom: { fontSize: 28, fontWeight: '900', letterSpacing: 0.4, lineHeight: 32 },
  tileFloor: { fontSize: 13, fontWeight: '700', color: '#64748b' },
  guestLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  guestLine: { fontSize: 14, fontWeight: '600', color: '#334155', marginTop: 2 },
  guestLineMuted: { fontSize: 13, color: '#94a3b8', marginTop: 2, fontStyle: 'italic' },
  noteLine: { fontSize: 12, color: '#475569', marginTop: 8, fontStyle: 'italic' },
  metaLine: { fontSize: 11, color: '#64748b', marginTop: 6, fontWeight: '600' },
  actionStack: { marginTop: 14, gap: 8 },
  checkoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 13,
  },
  checkoutBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  moveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
  },
  moveBtnText: { color: MOVE_ACCENT, fontWeight: '800', fontSize: 12 },
  moveHint: {
    fontSize: 10,
    color: '#64748b',
    textAlign: 'center',
    fontWeight: '600',
  },
  btnDisabled: { opacity: 0.6 },
  toolGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  toolBtn: {
    width: '47%',
    flexGrow: 1,
    minWidth: 120,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  toolBtnLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  iconRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  iconBtn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 6,
  },
  iconBtnLabel: { fontSize: 11, fontWeight: '700', color: '#64748b' },
  modalFull: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 16 },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 12,
  },
  planModalBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: ACCENT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  planModalBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  modalHint: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingBottom: 16 },
  planChip: {
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  planChipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  planChipAlready: { backgroundColor: '#ecfdf5', borderColor: '#a7f3d0', opacity: 0.7 },
  planChipText: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  planChipTextOn: { color: '#fff' },
  planChipTextAlready: { color: '#059669' },
  planChipSub: { fontSize: 9, fontWeight: '700', color: '#059669', marginTop: 2 },
  modalPrimary: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  modalPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
  },
  sheet: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
  },
  moveSheet: { borderTopWidth: 4, borderTopColor: MOVE_ACCENT },
  moveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  moveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: MOVE_ACCENT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moveBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  moveWarn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 12,
    marginBottom: 14,
  },
  moveWarnText: { flex: 1, color: '#1e3a8a', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  moveFromLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  moveFromRoom: { fontSize: 32, fontWeight: '900', color: '#0f172a', marginBottom: 4 },
  moveGuests: { fontSize: 13, color: '#475569', fontWeight: '600', marginBottom: 14 },
  moveChip: {
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
  },
  moveChipOn: { backgroundColor: MOVE_ACCENT, borderColor: MOVE_ACCENT },
  moveChipText: { fontSize: 16, fontWeight: '800', color: '#1e3a8a' },
  moveChipTextOn: { color: '#fff' },
  moveConfirmBtn: {
    backgroundColor: MOVE_ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  moveConfirmText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  managerSheet: { borderTopWidth: 4, borderTopColor: MANAGER_ACCENT },
  managerModalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  managerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: MANAGER_ACCENT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  managerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  managerSendBtn: {
    backgroundColor: MANAGER_ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  managerSendText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  extraCleanModalBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CLEAN_ACCENT,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 8,
  },
  extraCleanModalBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  extraCleanWarn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#f0fdfa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#99f6e4',
    padding: 12,
    marginBottom: 12,
  },
  extraCleanWarnText: { flex: 1, color: '#115e59', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  extraCleanChip: {
    minWidth: 72,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#99f6e4',
    backgroundColor: '#f0fdfa',
    alignItems: 'center',
  },
  extraCleanChipOn: { backgroundColor: CLEAN_ACCENT, borderColor: CLEAN_ACCENT },
  extraCleanChipText: { fontSize: 16, fontWeight: '800', color: '#115e59' },
  extraCleanChipTextOn: { color: '#fff' },
  extraCleanChipSub: { fontSize: 9, fontWeight: '800', color: '#ccfbf1', marginTop: 2 },
  extraCleanConfirmBtn: {
    backgroundColor: CLEAN_ACCENT,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  extraCleanConfirmText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#0f172a',
    marginBottom: 10,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  checkLabel: { fontWeight: '700', color: '#334155' },
});
