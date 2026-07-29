import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
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
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CachedImage } from '@/components/CachedImage';
import { useAuthStore } from '@/stores/authStore';
import { sendBulkToStaff } from '@/lib/notificationService';
import { hasStaffAppPermission } from '@/lib/staffPermissions';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { buildHousekeepingListHtml, shareHousekeepingPdf } from '@/lib/housekeepingPdf';
import {
  addDaysIso,
  appendHousekeepingJobPhoto,
  fetchHousekeepingJobsForDate,
  fetchHousekeepingJobsForMonth,
  fetchOrgRooms,
  formatHkDateTime,
  housekeepingStatusLabel,
  HOUSEKEEPING_STATUS_COLORS,
  isExtraCleaningRequest,
  isSafeHkImageUrl,
  markRoomHousekeepingJobDone,
  removeHousekeepingJob,
  scheduleRoomByNumber,
  scheduleSelectableRoomsForCleaning,
  setHousekeepingJobCover,
  setHousekeepingJobPriority,
  setRoomHousekeepingCover,
  setSelectableRoomCover,
  startRoomHousekeepingJob,
  subscribeHousekeepingJobs,
  todayIsoInIstanbul,
  updateHousekeepingJobNote,
  type HousekeepingStatus,
  type RoomHousekeepingJobView,
  type RoomMeta,
} from '@/lib/roomHousekeeping';

const ACCENT = '#0f766e';

type FilterKey = 'needs' | 'done' | 'all' | HousekeepingStatus;

function formatDateChip(iso: string, locale: string, today: string): string {
  if (iso === today) return locale.startsWith('tr') ? 'Bugün' : 'Today';
  const tomorrow = addDaysIso(today, 1);
  if (iso === tomorrow) return locale.startsWith('tr') ? 'Yarın' : 'Tomorrow';
  try {
    return new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  } catch {
    return iso;
  }
}

async function safeNotify(fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch {
    /* ignore */
  }
}

export default function StaffHousekeepingHubScreen() {
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation();
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const orgId = staff?.organization_id ?? null;
  const locale = (i18n.language || 'tr').split('-')[0];
  const today = todayIsoInIstanbul();

  const canPlan =
    staff?.role === 'admin' ||
    hasStaffAppPermission(staff, 'housekeeping_yonetim') ||
    hasStaffAppPermission(staff, 'doluluk_operasyon') ||
    hasStaffAppPermission(staff, 'yarin_oda_temizlik_listesi');
  const isAdmin = staff?.role === 'admin';

  const params = useLocalSearchParams<{ date?: string }>();
  const initialDate = useMemo(() => {
    const raw = typeof params.date === 'string' ? params.date.trim() : '';
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : today;
  }, [params.date, today]);
  const [targetDate, setTargetDate] = useState(initialDate);

  useEffect(() => {
    if (initialDate !== targetDate) setTargetDate(initialDate);
    // Only react to inbound deep-link date changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDate]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<RoomHousekeepingJobView[]>([]);
  const [rooms, setRooms] = useState<RoomMeta[]>([]);
  const [filter, setFilter] = useState<FilterKey>('needs');
  const [menuOpen, setMenuOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedRoomIds, setSelectedRoomIds] = useState<Set<string>>(new Set());
  const [scheduling, setScheduling] = useState(false);
  const [planNote, setPlanNote] = useState('');
  const [planPriority, setPlanPriority] = useState(false);
  const [quickRoom, setQuickRoom] = useState('');
  const [quickNote, setQuickNote] = useState('');
  const [quickPriority, setQuickPriority] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
  const [noteJob, setNoteJob] = useState<RoomHousekeepingJobView | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const [photoBusyId, setPhotoBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const dateOptions = useMemo(
    () => Array.from({ length: 8 }, (_, i) => addDaysIso(today, i)),
    [today]
  );
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gap = 10;
  const tileW = Math.floor((width - 32 - gap * (cols - 1)) / cols);
  const planCols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const planGap = 10;
  const planCardW = Math.floor((width - 40 - planGap * (planCols - 1)) / planCols);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setMenuOpen(true)}
          style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          hitSlop={10}
          accessibilityLabel="Menü"
        >
          <Ionicons name="ellipsis-vertical" size={22} color="#0f172a" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const load = useCallback(
    async (silent = false) => {
      if (!orgId) {
        setJobs([]);
        setRooms([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
      if (!silent) setLoading(true);
      try {
        const [jobRows, roomRows] = await Promise.all([
          fetchHousekeepingJobsForDate(orgId, targetDate),
          fetchOrgRooms(orgId),
        ]);
        setJobs(jobRows);
        setRooms(roomRows);
      } catch (e) {
        Alert.alert(t('error'), (e as Error)?.message ?? t('hkLoadFailed'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [orgId, targetDate, t]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    if (!orgId) return;
    return subscribeHousekeepingJobs(orgId, targetDate, () => {
      void load(true);
    });
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
    if (!noteJob && !addOpen) {
      setKeyboardOffset(0);
      Keyboard.dismiss();
    }
  }, [noteJob, addOpen]);

  const counts = useMemo(() => {
    let dirty = 0;
    let cleaning = 0;
    let clean = 0;
    for (const j of jobs) {
      if (j.status === 'dirty') dirty += 1;
      else if (j.status === 'cleaning') cleaning += 1;
      else clean += 1;
    }
    return { dirty, cleaning, clean, needs: dirty + cleaning, total: jobs.length };
  }, [jobs]);

  const filtered = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'needs') return jobs.filter((j) => j.status !== 'clean');
    if (filter === 'done') return jobs.filter((j) => j.status === 'clean');
    return jobs.filter((j) => j.status === filter);
  }, [jobs, filter]);

  const scheduledRoomIds = useMemo(
    () => new Set(jobs.map((j) => j.room_id).filter((id): id is string => Boolean(id))),
    [jobs]
  );
  const scheduledLabels = useMemo(
    () =>
      new Set(
        jobs
          .filter((j) => !j.room_id && j.location_label)
          .map((j) => (j.location_label ?? '').trim().toLowerCase())
          .filter(Boolean)
      ),
    [jobs]
  );
  const isRoomAlreadyScheduled = useCallback(
    (room: RoomMeta) => {
      if (room.labelOnly) {
        return scheduledLabels.has(room.room_number.trim().toLowerCase());
      }
      return scheduledRoomIds.has(room.id) || scheduledLabels.has(room.room_number.trim().toLowerCase());
    },
    [scheduledRoomIds, scheduledLabels]
  );
  const progressPct = counts.total === 0 ? 0 : Math.round((counts.clean / counts.total) * 100);
  const coverByRoom = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rooms) {
      if (r.cover_image_url && isSafeHkImageUrl(r.cover_image_url)) {
        m.set(r.id, r.cover_image_url);
        m.set(r.room_number.trim().toLowerCase(), r.cover_image_url);
      }
    }
    for (const j of jobs) {
      if (!j.cover_image_url || !isSafeHkImageUrl(j.cover_image_url)) continue;
      if (j.room_id) m.set(j.room_id, j.cover_image_url);
      const label = (j.location_label || j.room_number || '').trim().toLowerCase();
      if (label) m.set(label, j.cover_image_url);
    }
    return m;
  }, [rooms, jobs]);

  const resolveRoomCover = useCallback(
    (room: RoomMeta) =>
      coverByRoom.get(room.id) ||
      coverByRoom.get(room.room_number.trim().toLowerCase()) ||
      (room.cover_image_url && isSafeHkImageUrl(room.cover_image_url) ? room.cover_image_url : null),
    [coverByRoom]
  );

  const notifyScheduled = (roomNumbers: string[], priority = false) =>
    safeNotify(async () => {
      if (!staff?.id || !orgId || roomNumbers.length === 0) return;
      const list = roomNumbers.slice(0, 8).join(', ');
      const more = roomNumbers.length > 8 ? ` +${roomNumbers.length - 8}` : '';
      const body = priority
        ? t('hkNotifyScheduledPriorityBody', {
            date: formatDateChip(targetDate, locale, today),
            rooms: `${list}${more}`,
          })
        : t('hkNotifyScheduledBody', {
            date: formatDateChip(targetDate, locale, today),
            rooms: `${list}${more}`,
          });
      const title = priority ? t('hkNotifyScheduledPriorityTitle') : t('hkNotifyScheduledTitle');
      await sendBulkToStaff({
        target: 'housekeeping',
        organizationId: orgId,
        title,
        body,
        createdByStaffId: staff.id,
        notificationType: 'staff_room_cleaning_plan',
        category: 'staff',
        data: { url: '/staff/cleaning-plan', targetDate, roomNumbers, priority },
      });
    });

  const notifyStarted = (room: RoomHousekeepingJobView) =>
    safeNotify(async () => {
      if (!staff?.id || !orgId) return;
      const name = staff.full_name?.trim() || t('hkSomeone');
      await sendBulkToStaff({
        target: 'all_staff',
        organizationId: orgId,
        title: t('hkNotifyStartedTitle', { number: room.room_number }),
        body: t('hkNotifyStartedBody', { number: room.room_number, name }),
        createdByStaffId: staff.id,
        notificationType: 'staff_room_cleaning_status',
        category: 'staff',
        data: {
          url: '/staff/cleaning-plan',
          targetDate: room.target_date,
          roomNumber: room.room_number,
          housekeepingStatus: 'cleaning',
        },
        excludeStaffIds: [staff.id],
      });
    });

  const notifyDone = (room: RoomHousekeepingJobView) =>
    safeNotify(async () => {
      if (!staff?.id || !orgId) return;
      const name = staff.full_name?.trim() || t('hkSomeone');
      await sendBulkToStaff({
        target: 'all_staff',
        organizationId: orgId,
        title: t('hkNotifyDoneTitle', { number: room.room_number }),
        body: t('hkNotifyDoneBody', { number: room.room_number, name }),
        createdByStaffId: staff.id,
        notificationType: 'staff_room_cleaning_status',
        category: 'staff',
        data: {
          url: '/staff/cleaning-plan',
          targetDate: room.target_date,
          roomNumber: room.room_number,
          housekeepingStatus: 'clean',
        },
        excludeStaffIds: [staff.id],
      });
    });

  const onQuickAdd = async () => {
    if (!staff?.id || !orgId) return;
    if (!quickRoom.trim()) {
      Alert.alert(t('hkPickRoomsTitle'), t('hkQuickRoomRequired'));
      return;
    }
    setQuickBusy(true);
    try {
      const res = await scheduleRoomByNumber({
        organizationId: orgId,
        roomNumber: quickRoom,
        targetDate,
        staffId: staff.id,
        note: quickNote,
        isPriority: quickPriority,
      });
      void notifyScheduled([res.roomNumber], quickPriority);
      setQuickRoom('');
      setQuickNote('');
      setQuickPriority(false);
      setAddOpen(false);
      setFilter('needs');
      await load(true);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('hkActionFailed'));
    } finally {
      setQuickBusy(false);
    }
  };

  const onSchedule = async () => {
    if (!staff?.id || !orgId) return;
    const ids = [...selectedRoomIds];
    if (ids.length === 0) {
      Alert.alert(t('hkPickRoomsTitle'), t('hkPickRoomsBody'));
      return;
    }
    const picked = rooms.filter((r) => ids.includes(r.id));
    if (picked.length === 0) {
      Alert.alert(t('hkPickRoomsTitle'), t('hkPickRoomsBody'));
      return;
    }
    setScheduling(true);
    try {
      await scheduleSelectableRoomsForCleaning({
        organizationId: orgId,
        rooms: picked,
        targetDate,
        staffId: staff.id,
        note: planNote,
        isPriority: planPriority,
      });
      const nums = picked.map((r) => r.room_number);
      void notifyScheduled(nums, planPriority);
      setSelectedRoomIds(new Set());
      setPlanNote('');
      setPlanPriority(false);
      setPlanOpen(false);
      setFilter('needs');
      await load(true);
      Alert.alert(t('success'), t('hkScheduledSuccess', { count: picked.length }));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('hkActionFailed'));
    } finally {
      setScheduling(false);
    }
  };

  const exportPdf = async (kind: 'day' | 'month') => {
    if (!orgId) return;
    setPdfBusy(true);
    setMenuOpen(false);
    try {
      const rows =
        kind === 'day'
          ? await fetchHousekeepingJobsForDate(orgId, targetDate)
          : await fetchHousekeepingJobsForMonth(orgId, targetDate.slice(0, 7));
      const html = buildHousekeepingListHtml(
        rows.map((r) => ({
          room_number: r.room_number,
          status: r.status,
          is_priority: r.is_priority,
          note: r.note,
          scheduled_by_name: r.scheduled_by_name,
          started_by_name: r.started_by_name,
          completed_by_name: r.completed_by_name,
          started_at: r.started_at,
          completed_at: r.completed_at,
          target_date: r.target_date,
        })),
        {
          title: kind === 'day' ? t('hkPdfDailyTitle') : t('hkPdfMonthlyTitle'),
          subtitle:
            kind === 'day'
              ? formatDateChip(targetDate, locale, today)
              : targetDate.slice(0, 7),
          generatedAtLabel: `${t('hkPdfGenerated')}: ${formatHkDateTime(new Date().toISOString(), locale)}`,
        }
      );
      await shareHousekeepingPdf(
        html,
        kind === 'day' ? `temizlik-${targetDate}.pdf` : `temizlik-${targetDate.slice(0, 7)}.pdf`
      );
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('hkPdfFailed'));
    } finally {
      setPdfBusy(false);
    }
  };

  const pickAndUploadImage = async (fromCamera: boolean): Promise<string | null> => {
    if (!orgId) return null;
    if (fromCamera) {
      const ok = await ensureCameraPermission({
        title: t('hkPhotoCameraTitle'),
        message: t('hkPhotoCameraBody'),
        settingsMessage: t('hkPhotoCameraSettings'),
      });
      if (!ok) return null;
    } else {
      const ok = await ensureMediaLibraryPermission({
        title: t('hkPhotoGalleryTitle'),
        message: t('hkPhotoGalleryBody'),
        settingsMessage: t('hkPhotoGallerySettings'),
      });
      if (!ok) return null;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
        });
    if (result.canceled || !result.assets[0]?.uri) return null;
    const uploaded = await uploadUriToPublicBucket({
      bucketId: 'feed-media',
      uri: result.assets[0].uri,
      kind: 'image',
      subfolder: `housekeeping/${orgId}`,
    });
    if (!isSafeHkImageUrl(uploaded.publicUrl)) {
      throw new Error(t('hkPhotoFailed'));
    }
    return uploaded.publicUrl;
  };

  const addPhoto = async (job: RoomHousekeepingJobView, fromCamera: boolean) => {
    setPhotoBusyId(job.id);
    try {
      const url = await pickAndUploadImage(fromCamera);
      if (!url) return;
      await appendHousekeepingJobPhoto({ jobId: job.id, photoUrl: url });
      await load(true);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('hkPhotoFailed'));
    } finally {
      setPhotoBusyId(null);
    }
  };

  const setCover = async (job: RoomHousekeepingJobView) => {
    if (!orgId) return;
    Alert.alert(t('hkCoverTitle'), t('hkCoverBody', { number: job.room_number }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('hkPhotoCamera'),
        onPress: () => {
          void (async () => {
            setPhotoBusyId(job.id);
            try {
              const url = await pickAndUploadImage(true);
              if (!url) return;
              if (job.room_id) {
                await setRoomHousekeepingCover({
                  organizationId: orgId,
                  roomId: job.room_id,
                  coverImageUrl: url,
                });
              }
              await setHousekeepingJobCover({ jobId: job.id, coverImageUrl: url });
              await load(true);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('hkPhotoFailed'));
            } finally {
              setPhotoBusyId(null);
            }
          })();
        },
      },
      {
        text: t('hkPhotoGallery'),
        onPress: () => {
          void (async () => {
            setPhotoBusyId(job.id);
            try {
              const url = await pickAndUploadImage(false);
              if (!url) return;
              if (job.room_id) {
                await setRoomHousekeepingCover({
                  organizationId: orgId,
                  roomId: job.room_id,
                  coverImageUrl: url,
                });
              }
              await setHousekeepingJobCover({ jobId: job.id, coverImageUrl: url });
              await load(true);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('hkPhotoFailed'));
            } finally {
              setPhotoBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const setPlanRoomCover = (room: RoomMeta) => {
    if (!orgId || !staff?.id) return;
    Alert.alert(t('hkCoverTitle'), t('hkCoverBody', { number: room.room_number }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('hkPhotoCamera'),
        onPress: () => {
          void (async () => {
            setPhotoBusyId(room.id);
            try {
              const url = await pickAndUploadImage(true);
              if (!url) return;
              await setSelectableRoomCover({
                organizationId: orgId,
                room,
                coverImageUrl: url,
                targetDate,
                staffId: staff.id,
              });
              setRooms((prev) =>
                prev.map((r) => (r.id === room.id ? { ...r, cover_image_url: url } : r))
              );
              await load(true);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('hkPhotoFailed'));
            } finally {
              setPhotoBusyId(null);
            }
          })();
        },
      },
      {
        text: t('hkPhotoGallery'),
        onPress: () => {
          void (async () => {
            setPhotoBusyId(room.id);
            try {
              const url = await pickAndUploadImage(false);
              if (!url) return;
              await setSelectableRoomCover({
                organizationId: orgId,
                room,
                coverImageUrl: url,
                targetDate,
                staffId: staff.id,
              });
              setRooms((prev) =>
                prev.map((r) => (r.id === room.id ? { ...r, cover_image_url: url } : r))
              );
              await load(true);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('hkPhotoFailed'));
            } finally {
              setPhotoBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const onDone = async (job: RoomHousekeepingJobView) => {
    if (!staff?.id) return;
    setBusyId(job.id);
    try {
      await markRoomHousekeepingJobDone({ jobId: job.id, staffId: staff.id });
      void notifyDone(job);
      await load(true);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('hkActionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onStart = async (job: RoomHousekeepingJobView) => {
    if (!staff?.id) return;
    setBusyId(job.id);
    try {
      await startRoomHousekeepingJob({ jobId: job.id, staffId: staff.id });
      void notifyStarted(job);
      await load(true);
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('hkActionFailed'));
    } finally {
      setBusyId(null);
    }
  };

  const onRemoveFromList = (job: RoomHousekeepingJobView) => {
    Alert.alert(t('hkRemoveTitle'), t('hkRemoveBody', { number: job.room_number }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('hkRemoveConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(job.id);
            try {
              await removeHousekeepingJob(job.id);
              await load(true);
            } catch (e) {
              Alert.alert(t('error'), (e as Error)?.message ?? t('hkActionFailed'));
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator color={ACCENT} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={ACCENT}
          />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>{t('cleaningPage_live')}</Text>
          </View>
          <Text style={styles.heroTitle}>{t('hkHubTitle')}</Text>
          <Text style={styles.heroSub}>{t('hkHubSubtitle')}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={styles.progressLabel}>
            {t('hkProgress', { done: counts.clean, total: counts.total })} · {progressPct}%
          </Text>
        </View>

        {counts.needs > 0 ? (
          <View style={styles.warnBanner}>
            <Ionicons name="warning" size={16} color="#991b1b" />
            <Text style={styles.warnText}>{t('hkDirtyWarn', { count: counts.needs })}</Text>
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateRow}>
          {dateOptions.map((iso) => {
            const active = targetDate === iso;
            return (
              <TouchableOpacity
                key={iso}
                style={[styles.dateChip, active && styles.dateChipActive]}
                onPress={() => setTargetDate(iso)}
              >
                <Text style={[styles.dateChipText, active && styles.dateChipTextActive]}>
                  {formatDateChip(iso, locale, today)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {canPlan || isAdmin ? (
          <View style={styles.actionRow}>
            {canPlan ? (
              <TouchableOpacity
                style={styles.actionPrimary}
                onPress={() => {
                  setSelectedRoomIds(new Set());
                  setPlanNote('');
                  setPlanPriority(false);
                  setPlanOpen(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="grid-outline" size={18} color="#fff" />
                <Text style={styles.actionPrimaryText}>{t('hkActionPlan')}</Text>
              </TouchableOpacity>
            ) : null}
            {canPlan ? (
              <TouchableOpacity
                style={styles.actionSecondary}
                onPress={() => {
                  setQuickRoom('');
                  setQuickNote('');
                  setQuickPriority(false);
                  setAddOpen(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="add-outline" size={18} color={ACCENT} />
                <Text style={styles.actionSecondaryText}>{t('hkActionExtra')}</Text>
              </TouchableOpacity>
            ) : null}
            {isAdmin ? (
              <TouchableOpacity
                style={styles.actionDanger}
                onPress={() => setDeleteOpen(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
                <Text style={styles.actionDangerText}>{t('hkDeleteRoomsMenu')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {(
            [
              { key: 'needs' as const, label: t('hkFilterNeeds'), count: counts.needs },
              { key: 'dirty' as const, label: t('hkStatusDirty'), count: counts.dirty },
              { key: 'cleaning' as const, label: t('hkStatusCleaning'), count: counts.cleaning },
              { key: 'done' as const, label: t('hkFilterDone'), count: counts.clean },
              { key: 'all' as const, label: t('hkFilterAll'), count: counts.total },
            ] as const
          ).map((chip) => {
            const active = filter === chip.key;
            return (
              <TouchableOpacity
                key={chip.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setFilter(chip.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {chip.label} ({chip.count})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="sparkles-outline" size={36} color={ACCENT} />
            <Text style={styles.emptyTitle}>{t('hkEmptyList')}</Text>
            <Text style={styles.emptySub}>
              {canPlan ? t('hkEmptyListHintPlan') : t('hkEmptyListHint')}
            </Text>
            {canPlan ? (
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={() => {
                  setSelectedRoomIds(new Set());
                  setPlanOpen(true);
                }}
                activeOpacity={0.85}
              >
                <Ionicons name="grid-outline" size={18} color="#fff" />
                <Text style={styles.emptyCtaText}>{t('hkEmptyPlanCta')}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <View style={[styles.grid, { gap }]}>
            {filtered.map((job) => {
              const colors = HOUSEKEEPING_STATUS_COLORS[job.status];
              const busy = busyId === job.id || photoBusyId === job.id;
              const cover =
                (job.cover_image_url && isSafeHkImageUrl(job.cover_image_url) ? job.cover_image_url : null) ||
                (job.room_id ? coverByRoom.get(job.room_id) : null) ||
                coverByRoom.get(job.room_number.trim().toLowerCase()) ||
                null;
              const actorName =
                job.status === 'clean'
                  ? job.completed_by_name
                  : job.status === 'cleaning'
                    ? job.started_by_name
                    : job.scheduled_by_name;
              const actorAt =
                job.status === 'clean'
                  ? job.completed_at
                  : job.status === 'cleaning'
                    ? job.started_at
                    : null;
              const safePhotos = job.photo_urls.filter(isSafeHkImageUrl);
              const isExtraCleanReq = isExtraCleaningRequest(job.note);

              return (
                <View
                  key={job.id}
                  style={[
                    styles.tile,
                    { width: tileW, borderColor: isExtraCleanReq ? '#14b8a6' : colors.border },
                    !job.room_id && styles.tileExtra,
                    isExtraCleanReq && styles.tileExtraCleanReq,
                  ]}
                >
                  <Pressable
                    onPress={() => {
                      if (!job.room_id) return;
                      router.push({
                        pathname: '/staff/cleaning-room/[roomId]',
                        params: { roomId: job.room_id, roomNumber: job.room_number },
                      });
                    }}
                    style={styles.coverWrap}
                  >
                    {cover && isSafeHkImageUrl(cover) ? (
                      <CachedImage uri={cover} style={styles.coverImg} contentFit="cover" />
                    ) : (
                      <View
                        style={[
                          styles.coverPlaceholder,
                          {
                            backgroundColor: !job.room_id ? '#fff7ed' : colors.bg,
                          },
                        ]}
                      >
                        <Ionicons
                          name={job.room_id ? 'bed-outline' : 'location'}
                          size={28}
                          color={!job.room_id ? '#ea580c' : colors.accent}
                        />
                      </View>
                    )}
                    <View style={[styles.statusPillAbs, { backgroundColor: colors.accent }]}>
                      <Text style={styles.statusPillText}>{housekeepingStatusLabel(job.status, t)}</Text>
                    </View>
                    {!job.room_id ? (
                      <View style={styles.extraBadge}>
                        <Ionicons name="location" size={10} color="#fff" />
                        <Text style={styles.extraBadgeText}>{t('hkActionExtra')}</Text>
                      </View>
                    ) : null}
                    {isExtraCleanReq ? (
                      <View style={[styles.extraCleanReqBadge, !job.room_id && { top: 34 }]}>
                        <Ionicons name="sparkles" size={10} color="#fff" />
                        <Text style={styles.extraCleanReqBadgeText}>TEMİZLİK · ÇIKIŞ DEĞİL</Text>
                      </View>
                    ) : null}
                    {job.is_priority ? (
                      <View style={styles.priorityBadge}>
                        <Ionicons name="flash" size={12} color="#fff" />
                      </View>
                    ) : null}
                  </Pressable>

                  <View style={styles.tileBody}>
                    <Text style={[styles.tileRoom, { color: colors.text }]}>{job.room_number}</Text>
                    <Text style={styles.actorName} numberOfLines={1}>
                      {actorName || t('hkWaitingCleaner')}
                    </Text>
                    <Text style={styles.actorWhen}>{formatHkDateTime(actorAt, locale)}</Text>
                    {job.note ? (
                      <Text style={styles.noteText} numberOfLines={1}>
                        {job.note}
                      </Text>
                    ) : null}

                    {safePhotos.length > 0 ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoRow}>
                        {safePhotos.map((url) => (
                          <Pressable key={url} onPress={() => setPreviewUrl(url)}>
                            <CachedImage uri={url} style={styles.thumb} contentFit="cover" />
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}

                    {job.status !== 'clean' ? (
                      <View style={styles.tileActions}>
                        {job.status === 'dirty' ? (
                          <Pressable style={styles.miniGhost} disabled={busy} onPress={() => void onStart(job)}>
                            <Text style={styles.miniGhostText}>{t('hkStart')}</Text>
                          </Pressable>
                        ) : null}
                        <Pressable
                          style={[styles.miniPrimary, { backgroundColor: colors.accent, flex: 1 }]}
                          disabled={busy}
                          onPress={() => void onDone(job)}
                        >
                          {busy ? (
                            <ActivityIndicator color="#fff" size="small" />
                          ) : (
                            <Text style={styles.miniPrimaryText}>{t('hkICleaned')}</Text>
                          )}
                        </Pressable>
                      </View>
                    ) : null}

                    <View style={styles.iconRow}>
                      <Pressable onPress={() => void setCover(job)} hitSlop={10}>
                        <Ionicons name="image-outline" size={18} color={colors.text} />
                      </Pressable>
                      <Pressable
                        onPress={() =>
                          Alert.alert(t('hkAddPhotoTitle'), t('hkAddPhotoBody', { number: job.room_number }), [
                            { text: t('cancel'), style: 'cancel' },
                            { text: t('hkPhotoCamera'), onPress: () => void addPhoto(job, true) },
                            { text: t('hkPhotoGallery'), onPress: () => void addPhoto(job, false) },
                          ])
                        }
                        hitSlop={10}
                      >
                        <Ionicons name="camera-outline" size={18} color={colors.text} />
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setNoteDraft(job.note || '');
                          setNoteJob(job);
                        }}
                        hitSlop={10}
                      >
                        <Ionicons name="create-outline" size={18} color={colors.text} />
                      </Pressable>
                      {canPlan ? (
                        <Pressable
                          onPress={() => {
                            void (async () => {
                              setBusyId(job.id);
                              try {
                                await setHousekeepingJobPriority({
                                  jobId: job.id,
                                  isPriority: !job.is_priority,
                                });
                                await load(true);
                              } catch (err) {
                                Alert.alert(t('error'), (err as Error)?.message ?? t('hkActionFailed'));
                              } finally {
                                setBusyId(null);
                              }
                            })();
                          }}
                          hitSlop={10}
                        >
                          <Ionicons
                            name={job.is_priority ? 'flash' : 'flash-outline'}
                            size={18}
                            color={job.is_priority ? '#dc2626' : colors.text}
                          />
                        </Pressable>
                      ) : null}
                      {isAdmin ? (
                        <Pressable onPress={() => onRemoveFromList(job)} hitSlop={10} accessibilityLabel={t('hkRemoveConfirm')}>
                          <Ionicons name="trash-outline" size={18} color="#dc2626" />
                        </Pressable>
                      ) : null}
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ⋮ Menü */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={styles.menuCard}>
            <Text style={styles.menuTitle}>{t('hkMenuTitle')}</Text>
            {canPlan ? (
              <MenuItem
                icon="grid-outline"
                label={t('hkActionPlan')}
                onPress={() => {
                  setMenuOpen(false);
                  setSelectedRoomIds(new Set());
                  setPlanOpen(true);
                }}
              />
            ) : null}
            <MenuItem
              icon="add-circle-outline"
              label={t('hkQuickAddTitle')}
              onPress={() => {
                setMenuOpen(false);
                setAddOpen(true);
              }}
            />
            {isAdmin ? (
              <MenuItem
                icon="trash-outline"
                label={t('hkDeleteRoomsMenu')}
                onPress={() => {
                  setMenuOpen(false);
                  setDeleteOpen(true);
                }}
              />
            ) : null}
            <MenuItem
              icon="document-outline"
              label={t('hkPdfDaily')}
              onPress={() => void exportPdf('day')}
              disabled={pdfBusy}
            />
            <MenuItem
              icon="documents-outline"
              label={t('hkPdfMonthly')}
              onPress={() => void exportPdf('month')}
              disabled={pdfBusy}
            />
          </View>
        </Pressable>
      </Modal>

      {/* Ekstra yer */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setAddOpen(false)} />
          <View
            style={[
              styles.sheetModern,
              {
                maxHeight: '88%',
                marginBottom: keyboardOffset > 0 ? keyboardOffset : Math.max(insets.bottom, 0),
              },
            ]}
          >
            <SheetHandle />
            <ModernSheetHeader
              icon="location"
              tone="amber"
              title={t('hkQuickAddTitle')}
              subtitle={t('hkQuickAddHint')}
              onClose={() => setAddOpen(false)}
            />

            {rooms.length > 0 ? (
              <View style={styles.modernSectionCard}>
                <View style={styles.modernSectionHead}>
                  <Ionicons name="bed-outline" size={16} color={ACCENT} />
                  <Text style={styles.modernSectionTitle}>{t('hkQuickPickRoomHint')}</Text>
                </View>
                <ScrollView
                  style={{ maxHeight: 210 }}
                  contentContainerStyle={[styles.grid, { gap: planGap }]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {rooms.map((room) => {
                    const already = isRoomAlreadyScheduled(room);
                    const selected = quickRoom.trim().toLowerCase() === room.room_number.trim().toLowerCase();
                    return (
                      <ModernPlanRoomCard
                        key={room.id}
                        room={room}
                        width={planCardW}
                        selected={selected}
                        already={already}
                        coverUrl={resolveRoomCover(room)}
                        alreadyLabel={t('hkAlreadyOnList')}
                        floorLabel={t('hkFloor')}
                        photoBusy={photoBusyId === room.id}
                        onPress={() => setQuickRoom(room.room_number)}
                        onAddCover={() => setPlanRoomCover(room)}
                      />
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}

            <View style={styles.extraFormCard}>
              <View style={styles.modernSectionHead}>
                <Ionicons name="map-outline" size={16} color="#ea580c" />
                <Text style={styles.modernSectionTitle}>{t('hkExtraPlaceSection')}</Text>
              </View>
              <TextInput
                style={styles.inputModern}
                value={quickRoom}
                onChangeText={setQuickRoom}
                placeholder={t('hkQuickRoomPh')}
                placeholderTextColor="#94a3b8"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TextInput
                style={styles.inputModern}
                value={quickNote}
                onChangeText={setQuickNote}
                placeholder={t('hkNotePh')}
                placeholderTextColor="#94a3b8"
              />
              <Pressable
                style={[styles.priorityCard, quickPriority && styles.priorityCardOn]}
                onPress={() => setQuickPriority((v) => !v)}
              >
                <View style={[styles.priorityIconWrap, quickPriority && { backgroundColor: '#fee2e2' }]}>
                  <Ionicons name="flash" size={16} color={quickPriority ? '#dc2626' : '#94a3b8'} />
                </View>
                <Text style={[styles.priorityToggleText, quickPriority && { color: '#991b1b' }]}>
                  {t('hkPriorityTick')}
                </Text>
                <Ionicons
                  name={quickPriority ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={quickPriority ? '#dc2626' : '#94a3b8'}
                />
              </Pressable>
            </View>

            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddOpen(false)} hitSlop={12}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable style={styles.modalSaveModern} disabled={quickBusy} onPress={() => void onQuickAdd()}>
                {quickBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="add-circle" size={18} color="#fff" />
                    <Text style={styles.modalSaveText}>{t('hkQuickAddCta')}</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Planla — modern oda kartları */}
      <Modal visible={planOpen} transparent animationType="slide" onRequestClose={() => setPlanOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setPlanOpen(false)} />
          <View style={[styles.sheetModern, { maxHeight: '90%', marginBottom: Math.max(insets.bottom, 0) }]}>
            <SheetHandle />
            <ModernSheetHeader
              icon="grid"
              title={t('hkModePlan')}
              subtitle={t('hkPlanHint')}
              onClose={() => setPlanOpen(false)}
            />

            {rooms.length === 0 ? (
              <View style={styles.noRoomsBox}>
                <Ionicons name="home-outline" size={28} color={ACCENT} />
                <Text style={styles.noRoomsTitle}>{t('hkNoRoomsTitle')}</Text>
                <Text style={styles.noRoomsBody}>{t('hkNoRoomsBody')}</Text>
              </View>
            ) : (
              <>
                <View style={styles.planSelectRowModern}>
                  <TouchableOpacity
                    style={styles.planSelectPill}
                    onPress={() => setSelectedRoomIds(new Set(rooms.map((r) => r.id)))}
                    hitSlop={8}
                  >
                    <Ionicons name="checkmark-done" size={16} color={ACCENT} />
                    <Text style={styles.planSelectLink}>{t('hkSelectAllRooms')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.planSelectPillMuted}
                    onPress={() => setSelectedRoomIds(new Set())}
                    hitSlop={8}
                  >
                    <Text style={styles.planSelectLinkMuted}>{t('hkClearRoomSelection')}</Text>
                  </TouchableOpacity>
                  {selectedRoomIds.size > 0 ? (
                    <View style={styles.planCountBadge}>
                      <Text style={styles.planCountBadgeText}>{selectedRoomIds.size}</Text>
                    </View>
                  ) : null}
                </View>
                <ScrollView
                  contentContainerStyle={[styles.grid, { gap: planGap, paddingBottom: 8 }]}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                >
                  {rooms.map((room) => {
                    const selected = selectedRoomIds.has(room.id);
                    const already = isRoomAlreadyScheduled(room);
                    return (
                      <ModernPlanRoomCard
                        key={room.id}
                        room={room}
                        width={planCardW}
                        selected={selected}
                        already={already}
                        coverUrl={resolveRoomCover(room)}
                        alreadyLabel={t('hkAlreadyOnList')}
                        floorLabel={t('hkFloor')}
                        photoBusy={photoBusyId === room.id}
                        onPress={() =>
                          setSelectedRoomIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(room.id)) next.delete(room.id);
                            else next.add(room.id);
                            return next;
                          })
                        }
                        onAddCover={() => setPlanRoomCover(room)}
                      />
                    );
                  })}
                </ScrollView>
              </>
            )}

            <View style={styles.planFooterCard}>
              <TextInput
                style={styles.inputModern}
                value={planNote}
                onChangeText={setPlanNote}
                placeholder={t('hkNotePh')}
                placeholderTextColor="#94a3b8"
              />
              <Pressable
                style={[styles.priorityCard, planPriority && styles.priorityCardOn]}
                onPress={() => setPlanPriority((v) => !v)}
              >
                <View style={[styles.priorityIconWrap, planPriority && { backgroundColor: '#fee2e2' }]}>
                  <Ionicons name="flash" size={16} color={planPriority ? '#dc2626' : '#94a3b8'} />
                </View>
                <Text style={[styles.priorityToggleText, planPriority && { color: '#991b1b' }]}>
                  {t('hkPriorityTick')}
                </Text>
                <Ionicons
                  name={planPriority ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={planPriority ? '#dc2626' : '#94a3b8'}
                />
              </Pressable>
              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setPlanOpen(false)}>
                  <Text style={styles.modalCancelText}>{t('cancel')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalSaveModern, rooms.length === 0 && { opacity: 0.5 }]}
                  disabled={scheduling || rooms.length === 0}
                  onPress={() => void onSchedule()}
                >
                  {scheduling ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="calendar" size={16} color="#fff" />
                      <Text style={styles.modalSaveText}>{t('hkScheduleCta', { count: selectedRoomIds.size })}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Admin: listeden oda sil */}
      <Modal visible={deleteOpen} transparent animationType="slide" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setDeleteOpen(false)} />
          <View style={[styles.sheet, { maxHeight: '85%', marginBottom: Math.max(insets.bottom, 0) }]}>
            <View style={styles.noteModalHeader}>
              <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>{t('hkDeleteRoomsMenu')}</Text>
              <Pressable onPress={() => setDeleteOpen(false)} hitSlop={14} accessibilityLabel={t('cancel')}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <Text style={styles.planHint}>{t('hkDeleteRoomsHint', { date: formatDateChip(targetDate, locale, today) })}</Text>
            {jobs.length === 0 ? (
              <View style={styles.noRoomsBox}>
                <Ionicons name="trash-outline" size={28} color="#94a3b8" />
                <Text style={styles.noRoomsBody}>{t('hkEmptyList')}</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                {jobs.map((job) => {
                  const colors = HOUSEKEEPING_STATUS_COLORS[job.status];
                  const busy = busyId === job.id;
                  return (
                    <View key={job.id} style={styles.deleteRow}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={styles.deleteRoom}>{job.room_number}</Text>
                        <Text style={[styles.deleteStatus, { color: colors.accent }]}>
                          {housekeepingStatusLabel(job.status, t)}
                          {job.is_priority ? ` · ${t('hkAlertPriority')}` : ''}
                        </Text>
                      </View>
                      <Pressable
                        style={styles.deleteBtn}
                        disabled={busy}
                        onPress={() => onRemoveFromList(job)}
                        hitSlop={8}
                      >
                        {busy ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <>
                            <Ionicons name="trash-outline" size={16} color="#fff" />
                            <Text style={styles.deleteBtnText}>{t('hkRemoveConfirm')}</Text>
                          </>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!noteJob}
        transparent
        animationType="fade"
        onRequestClose={() => setNoteJob(null)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setNoteJob(null)} />
          <View
            style={[
              styles.sheet,
              {
                marginBottom: keyboardOffset > 0 ? keyboardOffset : Math.max(insets.bottom, 0),
              },
            ]}
          >
            <View style={styles.noteModalHeader}>
              <Text style={[styles.modalTitle, { flex: 1, marginBottom: 0 }]}>
                {t('hkNoteModalTitle', { number: noteJob?.room_number ?? '' })}
              </Text>
              <Pressable onPress={() => setNoteJob(null)} hitSlop={14} accessibilityLabel={t('cancel')}>
                <Ionicons name="close" size={24} color="#64748b" />
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
              multiline
              value={noteDraft}
              onChangeText={setNoteDraft}
              placeholder={t('hkNotePh')}
              placeholderTextColor="#94a3b8"
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setNoteJob(null)} hitSlop={12}>
                <Text style={styles.modalCancelText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable
                style={styles.modalSave}
                onPress={() => {
                  void (async () => {
                    if (!noteJob) return;
                    try {
                      await updateHousekeepingJobNote({ jobId: noteJob.id, note: noteDraft });
                      setNoteJob(null);
                      await load(true);
                    } catch (e) {
                      Alert.alert(t('error'), (e as Error)?.message ?? t('hkActionFailed'));
                    }
                  })();
                }}
              >
                <Text style={styles.modalSaveText}>{t('hkNoteSave')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!previewUrl && isSafeHkImageUrl(previewUrl)} transparent animationType="fade" onRequestClose={() => setPreviewUrl(null)}>
        <TouchableOpacity style={styles.previewBackdrop} activeOpacity={1} onPress={() => setPreviewUrl(null)}>
          {previewUrl && isSafeHkImageUrl(previewUrl) ? (
            <CachedImage uri={previewUrl} style={styles.previewImage} contentFit="contain" />
          ) : null}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity style={[styles.menuItem, disabled && { opacity: 0.5 }]} disabled={disabled} onPress={onPress}>
      <Ionicons name={icon} size={20} color="#0f172a" />
      <Text style={styles.menuItemText}>{label}</Text>
    </TouchableOpacity>
  );
}

function SheetHandle() {
  return <View style={styles.sheetHandle} />;
}

function ModernSheetHeader({
  icon,
  title,
  subtitle,
  onClose,
  tone = 'teal',
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onClose: () => void;
  tone?: 'teal' | 'amber';
}) {
  const bg = tone === 'amber' ? '#fffbeb' : '#ecfdf5';
  const fg = tone === 'amber' ? '#b45309' : ACCENT;
  return (
    <View style={styles.sheetHeader}>
      <View style={[styles.sheetHeaderIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={22} color={fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.sheetHeaderTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sheetHeaderSub}>{subtitle}</Text> : null}
      </View>
      <Pressable onPress={onClose} hitSlop={12} style={styles.sheetCloseBtn}>
        <Ionicons name="close" size={20} color="#64748b" />
      </Pressable>
    </View>
  );
}

function ModernPlanRoomCard({
  room,
  width: cardW,
  selected,
  already,
  coverUrl,
  alreadyLabel,
  floorLabel,
  photoBusy,
  onPress,
  onAddCover,
}: {
  room: RoomMeta;
  width: number;
  selected: boolean;
  already: boolean;
  coverUrl?: string | null;
  alreadyLabel: string;
  floorLabel: string;
  photoBusy?: boolean;
  onPress: () => void;
  onAddCover?: () => void;
}) {
  const isExtra = Boolean(room.labelOnly);
  const hasCover = Boolean(coverUrl && isSafeHkImageUrl(coverUrl));
  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      style={[
        styles.modernPlanCard,
        { width: cardW },
        selected && styles.modernPlanCardSelected,
        already && !selected && styles.modernPlanCardAlready,
      ]}
    >
      <View style={styles.modernPlanCover}>
        {hasCover ? (
          <CachedImage uri={coverUrl!} style={styles.modernPlanCoverImg} contentFit="cover" />
        ) : (
          <View
            style={[
              styles.modernPlanCoverFallback,
              { backgroundColor: isExtra ? '#fff7ed' : selected ? '#0d9488' : '#f0fdfa' },
            ]}
          >
            <Ionicons
              name={isExtra ? 'location' : 'bed'}
              size={22}
              color={selected ? '#fff' : isExtra ? '#ea580c' : ACCENT}
            />
          </View>
        )}
        {selected ? (
          <View style={styles.modernPlanCheck}>
            <Ionicons name="checkmark" size={14} color="#fff" />
          </View>
        ) : null}
        {already && !selected ? (
          <View style={styles.modernPlanAlreadyChip}>
            <Text style={styles.modernPlanAlreadyChipText}>{alreadyLabel}</Text>
          </View>
        ) : null}
        {isExtra ? (
          <View style={styles.modernPlanExtraChip}>
            <Text style={styles.modernPlanExtraChipText}>EXTRA</Text>
          </View>
        ) : null}
        {onAddCover ? (
          <Pressable
            style={styles.modernPlanPhotoBtn}
            hitSlop={8}
            disabled={photoBusy}
            onPress={(e) => {
              e?.stopPropagation?.();
              onAddCover();
            }}
          >
            {photoBusy ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name={hasCover ? 'camera' : 'camera-outline'} size={14} color="#fff" />
            )}
          </Pressable>
        ) : null}
      </View>
      <View style={styles.modernPlanBody}>
        <Text style={[styles.modernPlanRoom, selected && { color: ACCENT }]} numberOfLines={1}>
          {room.room_number}
        </Text>
        {room.floor != null ? (
          <Text style={styles.modernPlanFloor}>
            {floorLabel} {room.floor}
          </Text>
        ) : isExtra ? (
          <Text style={styles.modernPlanFloor}>—</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  scroll: { padding: 16, paddingBottom: 48, gap: 12 },
  hero: { borderRadius: 18, padding: 16, backgroundColor: '#0f766e', gap: 6 },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  liveBadgeText: { color: '#ecfdf5', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  heroTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  heroSub: { color: 'rgba(236,253,245,0.85)', fontSize: 13 },
  progressTrack: { height: 7, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden', marginTop: 6 },
  progressFill: { height: '100%', backgroundColor: '#4ade80' },
  progressLabel: { color: '#ecfdf5', fontSize: 12, fontWeight: '600', marginTop: 4 },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fee2e2',
    borderColor: '#fca5a5',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  warnText: { flex: 1, color: '#991b1b', fontWeight: '700', fontSize: 12 },
  dateRow: { gap: 8 },
  dateChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  dateChipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  dateChipText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  dateChipTextActive: { color: '#fff' },
  actionRow: { flexDirection: 'row', gap: 10 },
  actionPrimary: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  actionPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  actionSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#99f6e4',
  },
  actionSecondaryText: { color: ACCENT, fontSize: 13, fontWeight: '800' },
  actionDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1.5,
    borderColor: '#fecaca',
  },
  actionDangerText: { color: '#dc2626', fontSize: 13, fontWeight: '800' },
  filterRow: { gap: 8 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  filterChipActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#64748b' },
  filterChipTextActive: { color: '#fff' },
  empty: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  emptySub: { fontSize: 13, color: '#64748b', textAlign: 'center' },
  emptyCta: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  sectionLabel: { fontSize: 12, fontWeight: '800', color: '#64748b', marginTop: 2 },
  planSelectRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planSelectLink: { fontSize: 13, fontWeight: '800', color: ACCENT },
  planSelectLinkMuted: { fontSize: 13, fontWeight: '700', color: '#94a3b8' },
  noRoomsBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
    paddingHorizontal: 12,
    backgroundColor: '#f0fdfa',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  noRoomsTitle: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  noRoomsBody: { fontSize: 13, color: '#64748b', textAlign: 'center', lineHeight: 18 },
  planFloor: { fontSize: 10, fontWeight: '600', color: '#94a3b8', marginTop: 2 },
  planAlready: { fontSize: 9, fontWeight: '700', color: '#dc2626', marginTop: 2 },
  deleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  deleteRoom: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  deleteStatus: { fontSize: 12, fontWeight: '700' },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minWidth: 88,
    justifyContent: 'center',
  },
  deleteBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: {
    borderWidth: 1.5,
    borderRadius: 18,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  tileExtra: {
    borderColor: '#fdba74',
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  coverWrap: { height: 96, backgroundColor: '#e2e8f0', position: 'relative' },
  coverImg: { width: '100%', height: '100%' },
  coverPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  statusPillAbs: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  statusPillText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  tileExtraCleanReq: {
    borderWidth: 2,
    backgroundColor: '#f0fdfa',
  },
  extraBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ea580c',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  extraBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  extraCleanReqBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#0f766e',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    maxWidth: '78%',
  },
  extraCleanReqBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.2 },
  priorityBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#dc2626',
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBody: { padding: 10, gap: 2 },
  tileRoom: { fontSize: 18, fontWeight: '800' },
  actorName: { fontSize: 12, fontWeight: '700', color: '#334155', marginTop: 2 },
  actorWhen: { fontSize: 11, color: '#94a3b8', fontWeight: '600' },
  noteText: { fontSize: 11, color: '#64748b', fontStyle: 'italic', marginTop: 2 },
  photoRow: { marginTop: 6, maxHeight: 40 },
  thumb: { width: 36, height: 36, borderRadius: 8, marginRight: 6, backgroundColor: '#e2e8f0' },
  tileActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  miniGhost: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  miniGhostText: { fontSize: 12, fontWeight: '700', color: '#334155' },
  miniPrimary: {
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPrimaryText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  iconRow: { flexDirection: 'row', gap: 14, marginTop: 8 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.35)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 56, paddingRight: 12 },
  menuCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 8,
    minWidth: 220,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  menuTitle: { fontSize: 12, fontWeight: '800', color: '#94a3b8', paddingHorizontal: 14, paddingVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  menuItemText: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, gap: 10 },
  sheetModern: {
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 12,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 4,
  },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  sheetHeaderIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeaderTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sheetHeaderSub: { fontSize: 12, color: '#64748b', lineHeight: 16, fontWeight: '500' },
  sheetCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernSectionCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modernSectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modernSectionTitle: { fontSize: 12, fontWeight: '800', color: '#475569', letterSpacing: 0.2 },
  extraFormCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 14,
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#fed7aa',
  },
  planFooterCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  modernPlanCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    shadowColor: '#0f172a',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  modernPlanCardSelected: {
    borderColor: ACCENT,
    borderWidth: 2,
    shadowOpacity: 0.12,
    shadowColor: ACCENT,
  },
  modernPlanCardAlready: {
    borderColor: '#fecaca',
    backgroundColor: '#fffafa',
  },
  modernPlanCover: { height: 88, backgroundColor: '#ecfdf5', position: 'relative' },
  modernPlanCoverImg: { width: '100%', height: '100%' },
  modernPlanCoverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  modernPlanCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernPlanPhotoBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(15,23,42,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modernPlanAlreadyChip: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(220,38,38,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  modernPlanAlreadyChipText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  modernPlanExtraChip: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#ea580c',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  modernPlanExtraChipText: { color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.4 },
  modernPlanBody: { paddingHorizontal: 8, paddingVertical: 8, gap: 1 },
  modernPlanRoom: { fontSize: 15, fontWeight: '800', color: '#0f172a' },
  modernPlanFloor: { fontSize: 10, fontWeight: '600', color: '#94a3b8' },
  planSelectRowModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  planSelectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#99f6e4',
  },
  planSelectPillMuted: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  planCountBadge: {
    marginLeft: 'auto',
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  planCountBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  inputModern: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  priorityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  priorityCardOn: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  priorityIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSaveModern: {
    backgroundColor: ACCENT,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    minWidth: 100,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  noteModalHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  input: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 14,
    color: '#0f172a',
    backgroundColor: '#f8fafc',
  },
  priorityToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  priorityToggleText: { fontSize: 13, fontWeight: '700', color: '#64748b', flex: 1 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 4 },
  modalCancelText: { color: '#64748b', fontWeight: '700', padding: 10 },
  modalSave: { backgroundColor: ACCENT, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, minWidth: 88, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontWeight: '800' },
  planHint: { fontSize: 13, color: '#64748b' },
  planTile: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    padding: 12,
    alignItems: 'center',
  },
  planTileSelected: { backgroundColor: ACCENT, borderColor: ACCENT },
  planTileAlready: { borderColor: '#fca5a5', backgroundColor: '#fef2f2' },
  planRoom: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  previewImage: { width: '100%', height: '80%' },
});
