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
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { canAccessRoomPaymentBoard } from '@/lib/staffPermissions';
import { pds } from '@/constants/personelDesignSystem';
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_META,
  addDaysIso,
  countPaymentJobs,
  fetchOrgRooms,
  fetchPaymentJobsForDate,
  formatPaymentMoney,
  notifyRoomPaymentBoard,
  parseMoneyInput,
  paymentStatusNotifyCopy,
  removePaymentJob,
  schedulePaymentRoomByNumber,
  scheduleRoomsForPayment,
  setPaymentJobPriority,
  subscribePaymentJobs,
  todayIsoInIstanbul,
  updatePaymentJobAmounts,
  updatePaymentJobStatus,
  uploadRoomPaymentVoiceNote,
  type RoomMeta,
  type RoomPaymentJobView,
  type RoomPaymentMethod,
  type RoomPaymentStatus,
} from '@/lib/roomPaymentBoard';
import { RoomPaymentVoiceCapture } from '@/components/admin/RoomPaymentVoiceCapture';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';

const ACCENT = pds.accent;
const PAGE_PAD = 12;

type FilterKey = 'needs' | 'all' | RoomPaymentStatus;

const STATUS_ORDER: RoomPaymentStatus[] = ['unpaid', 'waiting', 'collected'];

function formatDateChip(iso: string, today: string): { title: string; sub: string } {
  const d = new Date(`${iso}T12:00:00`);
  const day = d.toLocaleDateString('tr-TR', { day: 'numeric' });
  const month = d.toLocaleDateString('tr-TR', { month: 'short' });
  if (iso === today) return { title: 'Bugün', sub: `${day} ${month}` };
  const tomorrow = addDaysIso(today, 1);
  if (iso === tomorrow) return { title: 'Yarın', sub: `${day} ${month}` };
  try {
    return {
      title: d.toLocaleDateString('tr-TR', { weekday: 'short' }),
      sub: `${day} ${month}`,
    };
  } catch {
    return { title: iso, sub: '' };
  }
}

export default function PaymentBoardScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id ?? null;
  const allowed = canAccessRoomPaymentBoard(staff);

  const today = useMemo(() => todayIsoInIstanbul(), []);
  const dateOptions = useMemo(() => Array.from({ length: 8 }, (_, i) => addDaysIso(today, i)), [today]);

  const [targetDate, setTargetDate] = useState(today);
  const [filter, setFilter] = useState<FilterKey>('needs');
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<RoomPaymentJobView[]>([]);
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [quickRoom, setQuickRoom] = useState('');
  const [quickAmount, setQuickAmount] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [quickPriority, setQuickPriority] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);

  const [planOpen, setPlanOpen] = useState(false);
  const [planQuery, setPlanQuery] = useState('');
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [planAmount, setPlanAmount] = useState('');
  const [scheduling, setScheduling] = useState(false);

  const [editJob, setEditJob] = useState<RoomPaymentJobView | null>(null);
  const [editDue, setEditDue] = useState('');
  const [editCollected, setEditCollected] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editMethod, setEditMethod] = useState<RoomPaymentMethod | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editVoiceUri, setEditVoiceUri] = useState<string | null>(null);
  const [editVoiceDur, setEditVoiceDur] = useState(0);
  const [editVoiceCleared, setEditVoiceCleared] = useState(false);

  const [collectJob, setCollectJob] = useState<RoomPaymentJobView | null>(null);
  const [collectMethod, setCollectMethod] = useState<RoomPaymentMethod>('cash');
  const [collectAmount, setCollectAmount] = useState('');
  const [collectNote, setCollectNote] = useState('');
  const [collectVoiceUri, setCollectVoiceUri] = useState<string | null>(null);
  const [collectVoiceDur, setCollectVoiceDur] = useState(0);
  const [collectVoiceCleared, setCollectVoiceCleared] = useState(false);
  const [collectBusy, setCollectBusy] = useState(false);

  const [quickVoiceUri, setQuickVoiceUri] = useState<string | null>(null);
  const [quickVoiceDur, setQuickVoiceDur] = useState(0);

  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const cols = width >= 960 ? 3 : width >= 700 ? 2 : 1;
  const gap = 8;
  const tileW = (width - PAGE_PAD * 2 - (cols - 1) * gap) / cols;

  const load = useCallback(
    async (soft = false) => {
      if (!orgId) return;
      if (!soft) setLoading(true);
      else setRefreshing(true);
      try {
        const [list, orgRooms] = await Promise.all([
          fetchPaymentJobsForDate(orgId, targetDate),
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
    const ch = subscribePaymentJobs(orgId, targetDate, () => {
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

  const counts = useMemo(() => countPaymentJobs(jobs), [jobs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return jobs.filter((j) => {
      if (filter === 'needs' && j.status === 'collected') return false;
      if (filter !== 'all' && filter !== 'needs' && j.status !== filter) return false;
      if (!q) return true;
      const hay = [
        j.room_number,
        j.guest_names.join(' '),
        j.note ?? '',
        j.collected_by_name ?? '',
        j.scheduled_by_name ?? '',
      ]
        .join(' ')
        .toLocaleLowerCase('tr');
      return hay.includes(q);
    });
  }, [jobs, filter, query]);

  const planRooms = useMemo(() => {
    const q = planQuery.trim().toLocaleLowerCase('tr');
    return rooms.filter((r) => {
      if (r.labelOnly) return false;
      if (!q) return true;
      return `oda ${r.room_number}`.toLocaleLowerCase('tr').includes(q) || String(r.floor ?? '').includes(q);
    });
  }, [rooms, planQuery]);

  const safeNotify = (fn: () => Promise<void>) => {
    void fn().catch(() => {});
  };

  const notifyChange = (
    job: Pick<RoomPaymentJobView, 'room_number' | 'amount_due' | 'amount_collected'>,
    status: RoomPaymentStatus,
    extras?: { note?: string | null; hasVoice?: boolean }
  ) => {
    if (!staff?.id || !orgId) return;
    const name = staff.full_name?.trim() || 'Personel';
    const amount = status === 'collected' ? job.amount_collected ?? job.amount_due : job.amount_due;
    const copy = paymentStatusNotifyCopy(status, job.room_number, name, amount, extras);
    const notificationType =
      status === 'collected'
        ? 'staff_room_payment_status'
        : status === 'waiting'
          ? 'staff_room_payment_status'
          : 'staff_room_payment_needed';
    safeNotify(async () => {
      await notifyRoomPaymentBoard({
        organizationId: orgId,
        createdByStaffId: staff.id,
        title: copy.title,
        body: copy.body,
        notificationType,
        data: { targetDate, roomNumber: job.room_number, paymentStatus: status },
        excludeStaffIds: [staff.id],
      });
    });
  };

  const onSetStatus = async (
    job: RoomPaymentJobView,
    status: RoomPaymentStatus,
    opts?: {
      amountCollected?: number | null;
      paymentMethod?: RoomPaymentMethod | null;
      note?: string | null;
      voiceNoteUrl?: string | null;
      voiceNoteDurationSec?: number | null;
    }
  ) => {
    if (!staff?.id) return;
    setBusyId(job.id);
    try {
      const amountCollected =
        status === 'collected'
          ? opts?.amountCollected ?? Number(job.amount_collected ?? job.amount_due ?? 0)
          : null;
      const paymentMethod =
        status === 'collected' ? opts?.paymentMethod ?? job.payment_method ?? 'cash' : null;
      await updatePaymentJobStatus({
        jobId: job.id,
        status,
        staffId: staff.id,
        amountCollected,
        paymentMethod,
        note: opts?.note !== undefined ? opts.note : undefined,
        voiceNoteUrl: opts?.voiceNoteUrl !== undefined ? opts.voiceNoteUrl : undefined,
        voiceNoteDurationSec:
          opts?.voiceNoteDurationSec !== undefined ? opts.voiceNoteDurationSec : undefined,
      });
      notifyChange(
        { ...job, amount_collected: amountCollected },
        status,
        {
          note: opts?.note ?? job.note,
          hasVoice:
            opts?.voiceNoteUrl !== undefined
              ? !!opts.voiceNoteUrl
              : !!job.voice_note_url,
        }
      );
      await load(true);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Güncellenemedi');
    } finally {
      setBusyId(null);
    }
  };

  const openCollect = (job: RoomPaymentJobView) => {
    setCollectJob(job);
    setCollectMethod(job.payment_method ?? 'cash');
    setCollectAmount(
      String(job.amount_collected ?? job.amount_due ?? 0).replace('.', ',')
    );
    setCollectNote(job.note ?? '');
    setCollectVoiceUri(null);
    setCollectVoiceDur(0);
    setCollectVoiceCleared(false);
  };

  const confirmCollect = async () => {
    if (!collectJob || !orgId) return;
    const amount = parseMoneyInput(collectAmount);
    if (amount == null) {
      Alert.alert('Tutar', 'Geçerli bir alınan tutar girin');
      return;
    }
    setCollectBusy(true);
    try {
      let voiceUrl: string | null | undefined = undefined;
      let voiceDur: number | null | undefined = undefined;
      if (collectVoiceUri) {
        const up = await uploadRoomPaymentVoiceNote(orgId, collectVoiceUri);
        voiceUrl = up.url;
        voiceDur = collectVoiceDur || null;
      } else if (collectVoiceCleared) {
        voiceUrl = null;
        voiceDur = null;
      }

      await onSetStatus(collectJob, 'collected', {
        amountCollected: amount,
        paymentMethod: collectMethod,
        note: collectNote.trim() || null,
        voiceNoteUrl: voiceUrl,
        voiceNoteDurationSec: voiceDur,
      });
      setCollectJob(null);
      setCollectNote('');
      setCollectVoiceUri(null);
      setCollectVoiceDur(0);
      setCollectVoiceCleared(false);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Ses yüklenemedi');
    } finally {
      setCollectBusy(false);
    }
  };

  const onTogglePriority = async (job: RoomPaymentJobView) => {
    setBusyId(job.id);
    try {
      await setPaymentJobPriority(job.id, !job.is_priority);
      await load(true);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Öncelik güncellenemedi');
    } finally {
      setBusyId(null);
    }
  };

  const onRemove = (job: RoomPaymentJobView) => {
    Alert.alert('Kaldır', `Oda ${job.room_number} tahsilat kaydı silinsin mi?`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(job.id);
            try {
              await removePaymentJob(job.id);
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

  const openEdit = (job: RoomPaymentJobView) => {
    setEditJob(job);
    setEditDue(String(job.amount_due ?? 0).replace('.', ','));
    setEditCollected(
      job.amount_collected != null ? String(job.amount_collected).replace('.', ',') : ''
    );
    setEditNote(job.note ?? '');
    setEditMethod(job.payment_method);
    setEditVoiceUri(null);
    setEditVoiceDur(0);
    setEditVoiceCleared(false);
  };

  const saveEdit = async () => {
    if (!editJob || !staff?.id || !orgId) return;
    const due = parseMoneyInput(editDue);
    if (due == null) {
      Alert.alert('Tutar', 'Geçerli bir alınacak tutar girin');
      return;
    }
    const collectedRaw = editCollected.trim() ? parseMoneyInput(editCollected) : null;
    if (editCollected.trim() && collectedRaw == null) {
      Alert.alert('Tutar', 'Geçerli bir alınan tutar girin');
      return;
    }
    setEditBusy(true);
    try {
      let voiceUrl: string | null | undefined = undefined;
      let voiceDur: number | null | undefined = undefined;
      if (editVoiceUri) {
        const up = await uploadRoomPaymentVoiceNote(orgId, editVoiceUri);
        voiceUrl = up.url;
        voiceDur = editVoiceDur || null;
      } else if (editVoiceCleared) {
        voiceUrl = null;
        voiceDur = null;
      }

      const prevDue = Number(editJob.amount_due ?? 0);
      await updatePaymentJobAmounts({
        jobId: editJob.id,
        amountDue: due,
        amountCollected: collectedRaw,
        paymentMethod: editMethod,
        note: editNote,
        isPriority: editJob.is_priority,
        voiceNoteUrl: voiceUrl,
        voiceNoteDurationSec: voiceDur,
      });
      const hasVoiceAfter =
        voiceUrl !== undefined ? !!voiceUrl : !!editJob.voice_note_url;
      if (Math.abs(prevDue - due) > 0.001 || (collectedRaw != null && collectedRaw !== editJob.amount_collected)) {
        safeNotify(async () => {
          if (!orgId || !staff.id) return;
          await notifyRoomPaymentBoard({
            organizationId: orgId,
            createdByStaffId: staff.id,
            title: `Tutar güncellendi · Oda ${editJob.room_number}`,
            body: `${staff.full_name?.trim() || 'Personel'}: alınacak ${formatPaymentMoney(due)}${
              collectedRaw != null ? ` · alınan ${formatPaymentMoney(collectedRaw)}` : ''
            }${hasVoiceAfter ? ' · Sesli not var' : ''}`,
            notificationType: 'staff_room_payment_amount',
            data: { targetDate, roomNumber: editJob.room_number },
            excludeStaffIds: [staff.id],
          });
        });
      }
      setEditJob(null);
      setEditVoiceUri(null);
      setEditVoiceDur(0);
      setEditVoiceCleared(false);
      await load(true);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kaydedilemedi');
    } finally {
      setEditBusy(false);
    }
  };

  const onQuickAdd = async () => {
    if (!staff?.id || !orgId) return;
    if (!quickRoom.trim()) {
      Alert.alert('Oda', 'Oda numarası girin');
      return;
    }
    const amount = quickAmount.trim() ? parseMoneyInput(quickAmount) : 0;
    if (amount == null) {
      Alert.alert('Tutar', 'Geçerli tutar girin');
      return;
    }
    setQuickBusy(true);
    try {
      const res = await schedulePaymentRoomByNumber({
        organizationId: orgId,
        roomNumber: quickRoom,
        targetDate,
        staffId: staff.id,
        amountDue: amount,
        note: quickNote,
        isPriority: quickPriority,
      });
      if (!res.ok) {
        Alert.alert('Hata', res.error);
        return;
      }

      let hasVoice = false;
      if (quickVoiceUri) {
        const list = await fetchPaymentJobsForDate(orgId, targetDate);
        const job = list.find(
          (j) => j.room_number.trim().toLowerCase() === res.roomNumber.trim().toLowerCase()
        );
        if (job) {
          const up = await uploadRoomPaymentVoiceNote(orgId, quickVoiceUri);
          await updatePaymentJobAmounts({
            jobId: job.id,
            voiceNoteUrl: up.url,
            voiceNoteDurationSec: quickVoiceDur || null,
            note: quickNote.trim() || null,
          });
          hasVoice = true;
        }
      }

      const copy = paymentStatusNotifyCopy(
        'unpaid',
        res.roomNumber,
        staff.full_name?.trim() || 'Personel',
        amount,
        { note: quickNote, hasVoice }
      );
      safeNotify(async () => {
        await notifyRoomPaymentBoard({
          organizationId: orgId,
          createdByStaffId: staff.id,
          title: copy.title,
          body: copy.body,
          notificationType: 'staff_room_payment_needed',
          data: { targetDate, roomNumber: res.roomNumber, paymentStatus: 'unpaid' },
          excludeStaffIds: [staff.id],
        });
      });
      setAddOpen(false);
      setQuickRoom('');
      setQuickAmount('');
      setQuickNote('');
      setQuickPriority(false);
      setQuickVoiceUri(null);
      setQuickVoiceDur(0);
      await load(true);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Eklenemedi');
    } finally {
      setQuickBusy(false);
    }
  };

  const onScheduleSelected = async () => {
    if (!staff?.id || !orgId) return;
    const ids = [...selectedRoomIds];
    if (!ids.length) {
      Alert.alert('Oda seçin', 'Listeden en az bir oda işaretleyin');
      return;
    }
    const amount = planAmount.trim() ? parseMoneyInput(planAmount) : 0;
    if (amount == null) {
      Alert.alert('Tutar', 'Geçerli tutar girin');
      return;
    }
    setScheduling(true);
    try {
      const res = await scheduleRoomsForPayment({
        organizationId: orgId,
        roomIds: ids,
        targetDate,
        staffId: staff.id,
        amountDue: amount,
      });
      const nums = rooms
        .filter((r) => selectedRoomIds.has(r.id))
        .map((r) => r.room_number)
        .slice(0, 8)
        .join(', ');
      safeNotify(async () => {
        await notifyRoomPaymentBoard({
          organizationId: orgId,
          createdByStaffId: staff.id,
          title: `${res.count} oda ödemesi alınacak`,
          body: `${staff.full_name?.trim() || 'Personel'}: ${nums}${res.count > 8 ? '…' : ''} — tahsilat bekleniyor`,
          notificationType: 'staff_room_payment_needed',
          data: { targetDate },
          excludeStaffIds: [staff.id],
        });
      });
      setPlanOpen(false);
      setSelectedRoomIds(new Set());
      setPlanAmount('');
      setPlanQuery('');
      await load(true);
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Planlanamadı');
    } finally {
      setScheduling(false);
    }
  };

  if (!allowed) {
    return <Redirect href={'/staff/(tabs)' as never} />;
  }

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 8) }]}>
      <LinearGradient
        colors={['#E8F5F2', pds.pageBg]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.topWash}
        pointerEvents="none"
      />

      <ScrollView
        style={styles.mainScroll}
        contentContainerStyle={[styles.mainScrollContent, { paddingBottom: insets.bottom + 28 }]}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={ACCENT} />
        }
      >
        <View style={styles.header}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.kicker}>Tahsilat panosu</Text>
            <Text style={styles.title}>Oda Ödemeleri</Text>
            <Text style={styles.sub}>
              {counts.needs > 0
                ? `${counts.needs} oda bekliyor · ${formatPaymentMoney(counts.dueTotal)}`
                : 'Bugün bekleyen tahsilat yok'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => setAddOpen(true)}
            accessibilityLabel="Hızlı ekle"
            activeOpacity={0.85}
          >
            <LinearGradient colors={pds.gradientPrimary} style={styles.headerBtnGrad}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={styles.headerBtnText}>Ekle</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerBtnGhost}
            onPress={() => setPlanOpen(true)}
            accessibilityLabel="Odaları seç"
            activeOpacity={0.85}
          >
            <Ionicons name="grid-outline" size={13} color={ACCENT} />
            <Text style={styles.headerBtnGhostText}>Toplu</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dateRow}
          style={styles.chipScroll}
          nestedScrollEnabled
        >
          {dateOptions.map((d) => {
            const active = d === targetDate;
            const chip = formatDateChip(d, today);
            return (
              <TouchableOpacity
                key={d}
                style={[styles.dateChip, active && styles.dateChipOn]}
                onPress={() => setTargetDate(d)}
                activeOpacity={0.85}
              >
                <Text style={[styles.dateChipTitle, active && styles.dateChipTitleOn]}>
                  {chip.title}
                  {chip.sub ? ` ${chip.sub}` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={15} color={pds.muted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Oda veya misafir ara…"
            placeholderTextColor={pds.muted}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {query.length > 0 && Platform.OS !== 'ios' ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={pds.muted} />
            </TouchableOpacity>
          ) : null}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.chipScroll}
          nestedScrollEnabled
        >
          {(
            [
              ['needs', `Bekleyen`, counts.needs],
              ['unpaid', 'Alınmadı', counts.unpaid],
              ['waiting', 'Bekliyor', counts.waiting],
              ['collected', 'Alındı', counts.collected],
              ['all', 'Tümü', counts.total],
            ] as const
          ).map(([key, label, count]) => {
            const on = filter === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.filterChip, on && styles.filterChipOn]}
                onPress={() => setFilter(key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.filterText, on && styles.filterTextOn]}>
                  {label} {count}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {loading ? (
          <ActivityIndicator style={{ marginTop: 48 }} color={ACCENT} />
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Ionicons name="wallet-outline" size={32} color={ACCENT} />
            </View>
            <Text style={styles.emptyTitle}>
              {query.trim() ? 'Sonuç bulunamadı' : 'Bu tarihte kayıt yok'}
            </Text>
            <Text style={styles.emptySub}>
              {query.trim()
                ? 'Aramayı değiştirin veya filtreyi genişletin'
                : 'Ekle ile tek oda, Toplu ile birden fazla oda ekleyin'}
            </Text>
            {!query.trim() ? (
              <TouchableOpacity style={styles.emptyCta} onPress={() => setAddOpen(true)} activeOpacity={0.9}>
                <Text style={styles.emptyCtaText}>Oda tahsilatı ekle</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={[styles.grid, styles.list, { gap }]}>
            {filtered.map((job) => (
              <PaymentJobCard
                key={job.id}
                job={job}
                width={tileW}
                busy={busyId === job.id}
                onStatus={(status) => {
                  if (status === 'collected') openCollect(job);
                  else void onSetStatus(job, status);
                }}
                onCollect={() => openCollect(job)}
                onEdit={() => openEdit(job)}
                onPriority={() => void onTogglePriority(job)}
                onRemove={() => onRemove(job)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* Hızlı ekle */}
      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAddOpen(false)}>
          <Pressable
            style={[styles.modalCard, { marginBottom: keyboardOffset }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Oda tahsilatı ekle</Text>
            <Text style={styles.modalHint}>Oda no ve alınacak tutarı girin</Text>
            <TextInput
              style={styles.input}
              placeholder="Oda no"
              placeholderTextColor={pds.muted}
              value={quickRoom}
              onChangeText={setQuickRoom}
              autoCapitalize="characters"
            />
            <TextInput
              style={styles.input}
              placeholder="Alınacak tutar (₺)"
              placeholderTextColor={pds.muted}
              value={quickAmount}
              onChangeText={setQuickAmount}
              keyboardType="decimal-pad"
            />
            <TextInput
              style={[styles.input, { minHeight: 64 }]}
              placeholder="Not (opsiyonel)"
              placeholderTextColor={pds.muted}
              value={quickNote}
              onChangeText={setQuickNote}
              multiline
            />
            <RoomPaymentVoiceCapture
              localUri={quickVoiceUri}
              durationSec={quickVoiceDur}
              disabled={quickBusy}
              label="Sesli açıklama (opsiyonel)"
              onLocalUriChange={(uri, dur) => {
                setQuickVoiceUri(uri);
                setQuickVoiceDur(dur);
              }}
            />
            <TouchableOpacity style={styles.checkRow} onPress={() => setQuickPriority((v) => !v)}>
              <Ionicons
                name={quickPriority ? 'checkbox' : 'square-outline'}
                size={22}
                color={ACCENT}
              />
              <Text style={styles.checkLabel}>Öncelikli göster</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, quickBusy && { opacity: 0.6 }]}
              disabled={quickBusy}
              onPress={() => void onQuickAdd()}
              activeOpacity={0.9}
            >
              {quickBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Listeye ekle</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toplu seç */}
      <Modal visible={planOpen} transparent animationType="slide" onRequestClose={() => setPlanOpen(false)}>
        <View style={styles.sheet}>
          <View style={[styles.sheetHeader, { paddingTop: insets.top + 8 }]}>
            <View>
              <Text style={styles.modalTitle}>Odaları seç</Text>
              <Text style={styles.modalHint}>{selectedRoomIds.size} oda seçili</Text>
            </View>
            <TouchableOpacity onPress={() => setPlanOpen(false)} hitSlop={10} style={styles.sheetClose}>
              <Ionicons name="close" size={22} color={pds.text} />
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: PAGE_PAD, gap: 10 }}>
            <TextInput
              style={styles.input}
              placeholder="Varsayılan tutar (₺)"
              placeholderTextColor={pds.muted}
              value={planAmount}
              onChangeText={setPlanAmount}
              keyboardType="decimal-pad"
            />
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={18} color={pds.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Oda ara…"
                placeholderTextColor={pds.muted}
                value={planQuery}
                onChangeText={setPlanQuery}
              />
            </View>
          </View>
          <ScrollView contentContainerStyle={{ padding: PAGE_PAD, paddingBottom: 120, gap: 8 }}>
            {planRooms.map((r) => {
              const on = selectedRoomIds.has(r.id);
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.roomPick, on && styles.roomPickOn]}
                  onPress={() => {
                    setSelectedRoomIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    });
                  }}
                  activeOpacity={0.85}
                >
                  <View>
                    <Text style={[styles.roomPickText, on && { color: '#fff' }]}>Oda {r.room_number}</Text>
                    {r.floor != null ? (
                      <Text style={[styles.roomPickSub, on && { color: 'rgba(255,255,255,0.8)' }]}>
                        Kat {r.floor}
                      </Text>
                    ) : null}
                  </View>
                  <Ionicons
                    name={on ? 'checkmark-circle' : 'ellipse-outline'}
                    size={24}
                    color={on ? '#fff' : '#C5D5D1'}
                  />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={[styles.sheetFooter, { paddingBottom: insets.bottom + 12 }]}>
            <TouchableOpacity
              style={[styles.primaryBtn, scheduling && { opacity: 0.6 }]}
              disabled={scheduling}
              onPress={() => void onScheduleSelected()}
              activeOpacity={0.9}
            >
              {scheduling ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {selectedRoomIds.size ? `${selectedRoomIds.size} oda ekle` : 'Oda seçin'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Tahsilat al */}
      <Modal visible={!!collectJob} transparent animationType="fade" onRequestClose={() => setCollectJob(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCollectJob(null)}>
          <Pressable
            style={[styles.modalCard, { marginBottom: keyboardOffset }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Tahsilat al · Oda {collectJob?.room_number ?? ''}</Text>
            <Text style={styles.modalHint}>
              Alınacak: {formatPaymentMoney(collectJob?.amount_due ?? 0)}
            </Text>
            <Text style={styles.fieldLabel}>Alınan tutar</Text>
            <TextInput
              style={styles.input}
              value={collectAmount}
              onChangeText={setCollectAmount}
              keyboardType="decimal-pad"
              placeholderTextColor={pds.muted}
            />
            <Text style={styles.fieldLabel}>Ödeme yöntemi</Text>
            <View style={styles.methodRow}>
              {(Object.keys(PAYMENT_METHOD_LABELS) as RoomPaymentMethod[]).map((m) => {
                const on = collectMethod === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodChip, on && styles.methodChipOn]}
                    onPress={() => setCollectMethod(m)}
                  >
                    <Text style={[styles.methodText, on && styles.methodTextOn]}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.fieldLabel}>Not (opsiyonel)</Text>
            <TextInput
              style={[styles.input, { minHeight: 72 }]}
              value={collectNote}
              onChangeText={setCollectNote}
              placeholder="Örn. kısmi ödeme, makbuz no, misafir notu…"
              placeholderTextColor={pds.muted}
              multiline
              textAlignVertical="top"
            />
            <RoomPaymentVoiceCapture
              localUri={collectVoiceUri}
              durationSec={collectVoiceDur}
              remoteUrl={collectVoiceCleared ? null : collectJob?.voice_note_url}
              remoteDurationSec={collectVoiceCleared ? null : collectJob?.voice_note_duration_sec}
              disabled={collectBusy}
              onLocalUriChange={(uri, dur) => {
                setCollectVoiceUri(uri);
                setCollectVoiceDur(dur);
                if (uri) setCollectVoiceCleared(false);
                else setCollectVoiceCleared(true);
              }}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, styles.collectConfirmBtn, collectBusy && { opacity: 0.6 }]}
              disabled={collectBusy}
              onPress={() => void confirmCollect()}
              activeOpacity={0.9}
            >
              {collectBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.primaryBtnText}>Tahsilatı onayla</Text>
                </>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Düzenle */}
      <Modal visible={!!editJob} transparent animationType="fade" onRequestClose={() => setEditJob(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setEditJob(null)}>
          <Pressable
            style={[styles.modalCard, { marginBottom: keyboardOffset }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Düzenle · Oda {editJob?.room_number ?? ''}</Text>
            <Text style={styles.fieldLabel}>Alınacak tutar</Text>
            <TextInput
              style={styles.input}
              value={editDue}
              onChangeText={setEditDue}
              keyboardType="decimal-pad"
              placeholderTextColor={pds.muted}
            />
            <Text style={styles.fieldLabel}>Alınan tutar</Text>
            <TextInput
              style={styles.input}
              value={editCollected}
              onChangeText={setEditCollected}
              keyboardType="decimal-pad"
              placeholder="Boş bırakılabilir"
              placeholderTextColor={pds.muted}
            />
            <Text style={styles.fieldLabel}>Ödeme yöntemi</Text>
            <View style={styles.methodRow}>
              {(Object.keys(PAYMENT_METHOD_LABELS) as RoomPaymentMethod[]).map((m) => {
                const on = editMethod === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[styles.methodChip, on && styles.methodChipOn]}
                    onPress={() => setEditMethod(m)}
                  >
                    <Text style={[styles.methodText, on && styles.methodTextOn]}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={[styles.input, { minHeight: 64 }]}
              value={editNote}
              onChangeText={setEditNote}
              placeholder="Not"
              placeholderTextColor={pds.muted}
              multiline
            />
            <RoomPaymentVoiceCapture
              localUri={editVoiceUri}
              durationSec={editVoiceDur}
              remoteUrl={editVoiceCleared ? null : editJob?.voice_note_url}
              remoteDurationSec={editVoiceCleared ? null : editJob?.voice_note_duration_sec}
              disabled={editBusy}
              onLocalUriChange={(uri, dur) => {
                setEditVoiceUri(uri);
                setEditVoiceDur(dur);
                if (uri) setEditVoiceCleared(false);
                else setEditVoiceCleared(true);
              }}
            />
            <TouchableOpacity
              style={[styles.primaryBtn, editBusy && { opacity: 0.6 }]}
              disabled={editBusy}
              onPress={() => void saveEdit()}
              activeOpacity={0.9}
            >
              {editBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Kaydet</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function PaymentJobCard({
  job,
  width,
  busy,
  onStatus,
  onCollect,
  onEdit,
  onPriority,
  onRemove,
}: {
  job: RoomPaymentJobView;
  width: number;
  busy: boolean;
  onStatus: (status: RoomPaymentStatus) => void;
  onCollect: () => void;
  onEdit: () => void;
  onPriority: () => void;
  onRemove: () => void;
}) {
  const meta = PAYMENT_STATUS_META[job.status];
  const guestLine = job.guest_names.filter(Boolean).join(', ');
  const actor =
    job.status === 'collected' && job.collected_by_name
      ? `Alan: ${job.collected_by_name}`
      : job.scheduled_by_name
        ? `Ekleyen: ${job.scheduled_by_name}`
        : null;

  return (
    <View
      style={[
        styles.card,
        {
          width,
          borderColor: job.is_priority ? 'rgba(217, 119, 6, 0.45)' : pds.cardBorder,
        },
      ]}
    >
      <View style={[styles.cardAccent, { backgroundColor: meta.accent }]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.roomRow}>
              <Text style={styles.roomNo}>Oda {job.room_number}</Text>
              {job.is_priority ? (
                <Ionicons name="flash" size={12} color="#B45309" />
              ) : null}
              <View style={[styles.badge, { backgroundColor: meta.soft }]}>
                <Text style={[styles.badgeText, { color: meta.text }]}>{meta.label}</Text>
              </View>
            </View>
            {guestLine ? (
              <Text style={styles.guest} numberOfLines={1}>
                {guestLine}
              </Text>
            ) : null}
          </View>
          <Text style={styles.amountInline}>{formatPaymentMoney(job.amount_due)}</Text>
        </View>

        {job.status === 'collected' && job.amount_collected != null ? (
          <Text style={styles.collectedLine}>
            Alınan {formatPaymentMoney(job.amount_collected)}
            {job.payment_method ? ` · ${PAYMENT_METHOD_LABELS[job.payment_method]}` : ''}
          </Text>
        ) : null}

        {actor || job.note || job.voice_note_url ? (
          <View style={styles.metaBlock}>
            {actor ? <Text style={styles.actor}>{actor}</Text> : null}
            {job.note ? (
              <Text style={styles.note} numberOfLines={1}>
                {job.note}
              </Text>
            ) : null}
            {job.voice_note_url ? (
              <View style={styles.voiceWrap}>
                <VoiceMessagePlayer
                  uri={job.voice_note_url}
                  isOwn={false}
                  durationSec={job.voice_note_duration_sec}
                />
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.statusSeg}>
          {STATUS_ORDER.map((status) => {
            const on = job.status === status;
            const sm = PAYMENT_STATUS_META[status];
            return (
              <TouchableOpacity
                key={status}
                style={[styles.statusSegBtn, on && { backgroundColor: sm.accent }]}
                disabled={busy || on}
                onPress={() => onStatus(status)}
                activeOpacity={0.85}
              >
                <Text style={[styles.statusSegText, on && { color: '#fff' }, !on && { color: sm.text }]}>
                  {sm.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.cardActions}>
          {job.status !== 'collected' ? (
            <TouchableOpacity
              style={[styles.collectBtn, busy && { opacity: 0.55 }]}
              disabled={busy}
              onPress={onCollect}
              activeOpacity={0.9}
            >
              <Ionicons name="cash-outline" size={14} color="#fff" />
              <Text style={styles.collectBtnText}>Tahsilat</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <IconAction icon="create-outline" label="Düzenle" color="#0E7490" disabled={busy} onPress={onEdit} />
          <IconAction
            icon={job.is_priority ? 'flash' : 'flash-outline'}
            label="Öncelik"
            color="#D97706"
            disabled={busy}
            onPress={onPriority}
          />
          <IconAction icon="trash-outline" label="Sil" color="#94A3B8" disabled={busy} onPress={onRemove} />
        </View>
      </View>
    </View>
  );
}

function IconAction({
  icon,
  label,
  color,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.iconAction, disabled && { opacity: 0.45 }]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Ionicons name={icon} size={14} color={color} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: pds.pageBg },
  mainScroll: { flex: 1 },
  mainScrollContent: { flexGrow: 1 },
  chipScroll: { flexGrow: 0, height: 26, maxHeight: 26 },
  topWash: {
    ...StyleSheet.absoluteFillObject,
    height: 160,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 4,
  },
  kicker: {
    fontSize: 9,
    fontWeight: '700',
    color: ACCENT,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  title: { marginTop: 0, fontSize: 17, fontWeight: '800', color: pds.text, letterSpacing: -0.2 },
  sub: { marginTop: 1, fontSize: 11, color: pds.subtext, fontWeight: '500' },
  headerBtn: { borderRadius: 5, overflow: 'hidden', height: 24 },
  headerBtnGrad: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
  },
  headerBtnText: { color: '#fff', fontWeight: '800', fontSize: 11, lineHeight: 12, includeFontPadding: false },
  headerBtnGhost: {
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 8,
    borderRadius: 5,
    backgroundColor: 'rgba(15, 118, 110, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(15, 118, 110, 0.16)',
  },
  headerBtnGhostText: { color: ACCENT, fontWeight: '800', fontSize: 11, lineHeight: 12, includeFontPadding: false },
  dateRow: { paddingHorizontal: PAGE_PAD, gap: 4, alignItems: 'center' },
  dateChip: {
    height: 22,
    paddingHorizontal: 7,
    paddingVertical: 0,
    borderRadius: 4,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: pds.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateChipOn: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  dateChipTitle: { fontSize: 11, fontWeight: '700', color: pds.subtext, lineHeight: 12, includeFontPadding: false },
  dateChipTitleOn: { color: '#fff' },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: PAGE_PAD,
    marginBottom: 4,
    marginTop: 4,
    paddingHorizontal: 8,
    height: 30,
    borderRadius: 5,
    backgroundColor: pds.cardBg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: pds.borderLight,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: pds.text,
    paddingVertical: 0,
    margin: 0,
    height: 28,
    includeFontPadding: false,
  },
  filterRow: { paddingHorizontal: PAGE_PAD, gap: 4, alignItems: 'center' },
  filterChip: {
    height: 22,
    paddingHorizontal: 7,
    paddingVertical: 0,
    borderRadius: 4,
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: pds.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipOn: {
    backgroundColor: '#134E4A',
    borderColor: '#134E4A',
  },
  filterText: { fontSize: 11, fontWeight: '700', color: pds.subtext, lineHeight: 12, includeFontPadding: false },
  filterTextOn: { color: '#fff' },
  list: { paddingHorizontal: PAGE_PAD, paddingTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  card: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: pds.cardBg,
    overflow: 'hidden',
    marginBottom: 2,
    flexDirection: 'row',
  },
  cardAccent: { width: 2 },
  cardBody: { flex: 1, paddingHorizontal: 8, paddingVertical: 5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  roomNo: { fontSize: 13, fontWeight: '800', color: pds.text, lineHeight: 15, includeFontPadding: false },
  guest: { marginTop: 0, fontSize: 10, color: pds.subtext, fontWeight: '500', lineHeight: 12, includeFontPadding: false },
  badge: {
    paddingHorizontal: 4,
    height: 15,
    borderRadius: 3,
    justifyContent: 'center',
  },
  badgeText: { fontSize: 9, fontWeight: '800', lineHeight: 10, includeFontPadding: false },
  amountInline: { fontSize: 13, fontWeight: '800', color: pds.text, lineHeight: 15, includeFontPadding: false },
  collectedLine: { marginTop: 1, fontSize: 10, color: '#047857', fontWeight: '700', lineHeight: 12, includeFontPadding: false },
  metaBlock: { marginTop: 2, gap: 0 },
  actor: { fontSize: 10, color: pds.subtext, fontWeight: '600', lineHeight: 12, includeFontPadding: false },
  note: { fontSize: 10, color: pds.muted, fontStyle: 'italic', lineHeight: 12, includeFontPadding: false },
  voiceWrap: { marginTop: 2 },
  statusSeg: {
    marginTop: 4,
    flexDirection: 'row',
    backgroundColor: '#EEF4F2',
    borderRadius: 4,
    padding: 1,
    gap: 1,
    height: 22,
  },
  statusSegBtn: {
    flex: 1,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
  },
  statusSegText: { fontSize: 9, fontWeight: '800', lineHeight: 10, includeFontPadding: false },
  cardActions: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  collectBtn: {
    flex: 1,
    height: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 4,
    backgroundColor: '#0F766E',
  },
  collectBtnText: { color: '#fff', fontWeight: '800', fontSize: 11, lineHeight: 12, includeFontPadding: false },
  iconAction: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: '#F4F8F7',
  },
  empty: { alignItems: 'center', paddingTop: 36, gap: 6, paddingHorizontal: 24 },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: pds.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: pds.text },
  emptySub: { fontSize: 12, color: pds.muted, textAlign: 'center', lineHeight: 16 },
  emptyCta: {
    marginTop: 6,
    backgroundColor: ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11, 31, 28, 0.48)',
    justifyContent: 'flex-end',
    padding: PAGE_PAD,
  },
  modalCard: {
    backgroundColor: pds.cardBg,
    borderRadius: 22,
    padding: 18,
    gap: 10,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D5E2DE',
    marginBottom: 4,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: pds.text },
  modalHint: { marginTop: -4, fontSize: 13, color: pds.subtext, fontWeight: '500' },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: pds.muted, marginTop: 2 },
  input: {
    borderWidth: 1,
    borderColor: pds.borderLight,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 9,
    fontSize: 15,
    color: pds.text,
    backgroundColor: pds.commentPreviewBg,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 2 },
  checkLabel: { fontSize: 14, color: pds.text, fontWeight: '600' },
  primaryBtn: {
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collectConfirmBtn: { flexDirection: 'row', gap: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: pds.borderLight,
    backgroundColor: pds.commentPreviewBg,
  },
  methodChipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  methodText: { fontSize: 12, fontWeight: '700', color: pds.subtext },
  methodTextOn: { color: '#fff' },
  sheet: { flex: 1, backgroundColor: pds.pageBg },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: PAGE_PAD,
    paddingBottom: 12,
  },
  sheetClose: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: pds.cardBg,
    borderWidth: 1,
    borderColor: pds.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: PAGE_PAD,
    backgroundColor: pds.cardBg,
    borderTopWidth: 1,
    borderTopColor: pds.borderLight,
  },
  roomPick: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: pds.borderLight,
    backgroundColor: pds.cardBg,
  },
  roomPickOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  roomPickText: { fontSize: 16, fontWeight: '800', color: pds.text },
  roomPickSub: { marginTop: 2, fontSize: 12, fontWeight: '600', color: pds.muted },
});
