import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  TextInput,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { formatDateTime, formatTime } from '@/lib/date';
import { useAuthStore } from '@/stores/authStore';
import { useAdminOrgStore } from '@/stores/adminOrgStore';
import { AdminOrganizationPicker } from '@/components/admin';
import { adminTheme } from '@/constants/adminTheme';
import { occupancyDailyReportPath, occupancyPathsFromPathname } from '@/lib/occupancyOpsPaths';
import { canAccessOccupancyOps } from '@/lib/staffPermissions';
import { loadOccupancySnapshot, type OccupancyGuest, type OccupancyRoom, type OccupancySnapshot } from '@/lib/occupancyOpsLoad';
import { checkoutGuest, checkoutGuestsBulk } from '@/lib/occupancyCheckout';
import { getOccupancyCached, invalidateOccupancyCache, occupancyCacheKey } from '@/lib/occupancyCache';
import {
  runBulkGuestContractAction,
  shareGuestContractPdf,
  shareOccupancySnapshotCsv,
  sendGuestContractToPrinter,
} from '@/lib/occupancyExport';
import { StaffAcceptancesPanel } from '@/app/staff/(tabs)/acceptances';
import { useFocusEffect } from 'expo-router';

type TabKey = 'rooms' | 'pending' | 'today' | 'history' | 'acceptances';

const ROOM_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  available: { label: 'Boş', color: '#166534', bg: '#dcfce7' },
  occupied: { label: 'Dolu', color: '#b91c1c', bg: '#fee2e2' },
  cleaning: { label: 'Temizlik', color: '#a16207', bg: '#fef3c7' },
  maintenance: { label: 'Bakım', color: '#1d4ed8', bg: '#dbeafe' },
  out_of_order: { label: 'Kapalı', color: '#64748b', bg: '#f1f5f9' },
};

function parseTab(raw: string | string[] | undefined): TabKey {
  const t = Array.isArray(raw) ? raw[0] : raw;
  if (t === 'pending' || t === 'today' || t === 'history' || t === 'rooms' || t === 'acceptances') return t;
  return 'rooms';
}

function GuestMetaLine({ guest }: { guest: OccupancyGuest }) {
  const parts: string[] = [];
  if (guest.check_in_at) parts.push(`Giriş: ${formatDateTime(guest.check_in_at)}`);
  if (guest.nights_count) parts.push(`${guest.nights_count} gece`);
  if (guest.assigned_staff_name) parts.push(`İşlem: ${guest.assigned_staff_name}`);
  return <Text style={styles.guestMeta}>{parts.join(' · ') || '—'}</Text>;
}

export function OccupancyOpsHubScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const paths = occupancyPathsFromPathname(pathname);
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();
  const { staff } = useAuthStore();
  const { selectedOrganizationId } = useAdminOrgStore();

  const [tab, setTab] = useState<TabKey>(() => parseTab(tabParam));
  const [snapshot, setSnapshot] = useState<OccupancySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [checkoutBusyId, setCheckoutBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [contractBusyId, setContractBusyId] = useState<string | null>(null);
  const [bulkContractBusy, setBulkContractBusy] = useState(false);

  const canUseAll = staff?.app_permissions?.super_admin === true || staff?.role === 'admin';

  useEffect(() => {
    setTab(parseTab(tabParam));
  }, [tabParam]);

  const orgScoped = useMemo(() => {
    const orgId = canUseAll ? selectedOrganizationId : staff?.organization_id;
    return orgId && orgId !== 'all' ? orgId : null;
  }, [canUseAll, selectedOrganizationId, staff?.organization_id]);

  const load = useCallback(
    async (force = false) => {
      if (!canAccessOccupancyOps(staff)) return;
      const data = await loadOccupancySnapshot(orgScoped, { force });
      setSnapshot(data);
      setLoading(false);
      setRefreshing(false);
    },
    [orgScoped, staff]
  );

  useFocusEffect(
    useCallback(() => {
      if (!canAccessOccupancyOps(staff)) return;
      const key = occupancyCacheKey(['ops', orgScoped]);
      const cached = getOccupancyCached<OccupancySnapshot>(key);
      if (cached) {
        setSnapshot(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      void load(false);
    }, [load, orgScoped, staff])
  );

  const onRefresh = () => {
    setRefreshing(true);
    invalidateOccupancyCache('ops');
    void load(true);
  };

  const allInHouseGuests = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.rooms.flatMap((r) => r.guests);
  }, [snapshot]);

  const filteredRooms = useMemo(() => {
    if (!snapshot) return [];
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return snapshot.rooms;
    return snapshot.rooms.filter((r) => {
      if (r.room_number.toLocaleLowerCase('tr-TR').includes(q)) return true;
      if (r.guests.some((g) => g.full_name.toLocaleLowerCase('tr-TR').includes(q))) return true;
      if (r.pending_contract_name?.toLocaleLowerCase('tr-TR').includes(q)) return true;
      return false;
    });
  }, [search, snapshot]);

  const filterGuests = (list: OccupancyGuest[]) => {
    const q = search.trim().toLocaleLowerCase('tr-TR');
    if (!q) return list;
    return list.filter(
      (g) =>
        g.full_name.toLocaleLowerCase('tr-TR').includes(q) ||
        (g.room_number ?? '').toLocaleLowerCase('tr-TR').includes(q)
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInHouse = () => {
    setSelectedIds(new Set(allInHouseGuests.map((g) => g.id)));
  };

  const runCheckout = async (guest: OccupancyGuest) => {
    Alert.alert('Check-out', `${guest.full_name} çıkış yapsın mı? Oda müsait olur.`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Çıkış yap',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setCheckoutBusyId(guest.id);
            const res = await checkoutGuest(
              supabase,
              { id: guest.id, full_name: guest.full_name, room_id: guest.room_id },
              staff?.id
            );
            setCheckoutBusyId(null);
            if (res.error) Alert.alert('Hata', res.error.message);
            else {
              invalidateOccupancyCache();
              void load(true);
            }
          })();
        },
      },
    ]);
  };

  const runBulkCheckout = () => {
    const selected = allInHouseGuests.filter((g) => selectedIds.has(g.id));
    if (selected.length === 0) {
      Alert.alert('Seçim yok', 'Çıkış yapılacak misafirleri işaretleyin.');
      return;
    }
    Alert.alert(
      'Toplu check-out',
      `${selected.length} misafir çıkış yapacak. Devam edilsin mi?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: `Evet (${selected.length})`,
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBulkBusy(true);
              const { failed, succeeded } = await checkoutGuestsBulk(
                supabase,
                selected.map((g) => ({ id: g.id, full_name: g.full_name, room_id: g.room_id })),
                staff?.id
              );
              setBulkBusy(false);
              setSelectMode(false);
              setSelectedIds(new Set());
              invalidateOccupancyCache();
              await load(true);
              if (failed.length > 0) {
                Alert.alert(
                  'Kısmen tamamlandı',
                  `${succeeded} başarılı, ${failed.length} hata.\n${failed.map((f) => f.name).join(', ')}`
                );
              }
            })();
          },
        },
      ]
    );
  };

  const openGuest = (guestId: string) => router.push(paths.guest(guestId) as never);
  const openRoom = (roomId: string) => router.push(paths.room(roomId) as never);

  const dailyReportPath = occupancyDailyReportPath(paths.scope);
  const breakfastBriefingPath =
    paths.scope === 'staff' ? '/staff/occupancy/breakfast-briefing' : '/admin/report/breakfast-briefing';

  const guestsForBulkActions = useMemo(() => {
    if (!snapshot) return [];
    const ids = selectedIds;
    if (selectMode && ids.size > 0) {
      const pool = [
        ...allInHouseGuests,
        ...snapshot.todayCheckIns,
        ...snapshot.todayCheckOuts,
        ...snapshot.recentHistory,
      ];
      const uniq = new Map<string, OccupancyGuest>();
      for (const g of pool) uniq.set(g.id, g);
      return [...ids].map((id) => uniq.get(id)).filter(Boolean) as OccupancyGuest[];
    }
    return allInHouseGuests;
  }, [allInHouseGuests, selectMode, selectedIds, snapshot]);

  const exportExcel = async () => {
    if (!snapshot) return;
    setExportBusy(true);
    try {
      await shareOccupancySnapshotCsv(snapshot);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Excel dışa aktarılamadı');
    }
    setExportBusy(false);
  };

  const runGuestPdf = async (guest: OccupancyGuest) => {
    setContractBusyId(guest.id);
    const res = await shareGuestContractPdf(supabase, guest.id);
    setContractBusyId(null);
    if (!res.ok) Alert.alert('PDF', res.error ?? 'Oluşturulamadı');
  };

  const runGuestPrinter = async (guest: OccupancyGuest) => {
    setContractBusyId(guest.id);
    const res = await sendGuestContractToPrinter(supabase, guest.id, guest.full_name);
    setContractBusyId(null);
    if (!res.ok) Alert.alert('Yazıcı', res.error ?? 'Gönderilemedi');
    else Alert.alert('Tamam', 'Sözleşme yazıcıya gönderildi.');
  };

  const runBulkContract = (action: 'pdf' | 'printer') => {
    const list = selectMode ? guestsForBulkActions : allInHouseGuests;
    if (list.length === 0) {
      Alert.alert('Liste boş', selectMode ? 'Misafir seçin.' : 'Odada misafir yok.');
      return;
    }
    const label = action === 'pdf' ? 'PDF paylaş' : 'yazıcıya gönder';
    Alert.alert(`Toplu ${label}`, `${list.length} misafir için işlem başlasın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Devam',
        onPress: () => {
          void (async () => {
            setBulkContractBusy(true);
            const { succeeded, failed } = await runBulkGuestContractAction(list, action);
            setBulkContractBusy(false);
            if (failed.length > 0) {
              Alert.alert(
                succeeded > 0 ? 'Kısmen tamamlandı' : 'Hata',
                `${succeeded} başarılı.\n${failed.slice(0, 5).join('\n')}${failed.length > 5 ? `\n+${failed.length - 5}…` : ''}`
              );
            } else if (action === 'printer') {
              Alert.alert('Tamam', `${succeeded} sözleşme yazıcıya gönderildi.`);
            }
          })();
        },
      },
    ]);
  };

  const guestHasContract = (guest: OccupancyGuest) =>
    Boolean(guest.signature_data?.trim() || guest.contract_accepted_at);

  const renderGuestActions = (guest: OccupancyGuest, inSelect: boolean, showCheckout = true) => {
    const busy = checkoutBusyId === guest.id || bulkBusy || contractBusyId === guest.id || bulkContractBusy;
    const checked = selectedIds.has(guest.id);
    const contractBusy = contractBusyId === guest.id;
    return (
      <View style={styles.guestActions}>
        {inSelect ? (
          <TouchableOpacity
            style={[styles.checkCircle, checked && styles.checkCircleOn]}
            onPress={() => toggleSelect(guest.id)}
            disabled={busy}
          >
            {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => runGuestPdf(guest)}
          disabled={busy}
          accessibilityLabel="PDF paylaş"
        >
          {contractBusy ? (
            <ActivityIndicator size="small" color="#334155" />
          ) : (
            <Ionicons name="document-outline" size={16} color="#334155" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => runGuestPrinter(guest)}
          disabled={busy}
          accessibilityLabel="Yazıcıya gönder"
        >
          <Ionicons name="print-outline" size={16} color="#334155" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.manageBtn} onPress={() => openGuest(guest.id)} disabled={busy}>
          <Text style={styles.manageBtnText}>Detay</Text>
        </TouchableOpacity>
        {showCheckout && !inSelect ? (
          <TouchableOpacity
            style={[styles.checkoutBtn, busy && styles.btnDisabled]}
            onPress={() => runCheckout(guest)}
            disabled={busy}
          >
            {checkoutBusyId === guest.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.checkoutBtnText}>Çıkış</Text>
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const renderGuestCard = (guest: OccupancyGuest) => (
    <View key={guest.id} style={styles.guestCard}>
      <View style={styles.guestCardTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.guestName}>{guest.full_name}</Text>
          <GuestMetaLine guest={guest} />
          <View style={styles.tagRow}>
            <View style={[styles.tag, guestHasContract(guest) ? styles.tagOk : styles.tagWarn]}>
              <Text style={[styles.tagText, !guestHasContract(guest) && styles.tagTextWarn]}>
                {guestHasContract(guest) ? 'Sözleşme onaylı' : 'Sözleşme eksik'}
              </Text>
            </View>
            {guest.contract_lang ? (
              <View style={styles.tagMuted}>
                <Text style={styles.tagTextMuted}>{guest.contract_lang.toUpperCase()}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {renderGuestActions(guest, selectMode, guest.status === 'checked_in')}
      </View>
    </View>
  );

  const renderRoomCard = (room: OccupancyRoom) => {
    const st = ROOM_STATUS[room.status] ?? ROOM_STATUS.available;
    const isOccupied = room.guests.length > 0;
    return (
      <View key={room.id} style={styles.roomCard}>
        <TouchableOpacity style={styles.roomCardHead} onPress={() => openRoom(room.id)} activeOpacity={0.85}>
          <View>
            <Text style={styles.roomNumber}>Oda {room.room_number}</Text>
            <Text style={styles.roomSub}>
              {room.floor != null ? `Kat ${room.floor}` : ''}
              {room.bed_type ? ` · ${room.bed_type}` : ''}
            </Text>
          </View>
          <View style={styles.roomHeadRight}>
            <View style={[styles.statusPill, { backgroundColor: st.bg }]}>
              <Text style={[styles.statusPillText, { color: st.color }]}>{isOccupied ? 'Dolu' : st.label}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#94a3b8" />
          </View>
        </TouchableOpacity>

        {room.guests.length > 0 ? (
          room.guests.map((g) => renderGuestCard(g))
        ) : room.pending_contract_name ? (
          <View style={styles.pendingInRoom}>
            <Ionicons name="document-text-outline" size={16} color="#2563eb" />
            <Text style={styles.pendingInRoomText}>
              Sözleşme onaylı, oda bekliyor: <Text style={{ fontWeight: '700' }}>{room.pending_contract_name}</Text>
            </Text>
            <TouchableOpacity style={styles.linkBtn} onPress={() => setTab('pending')}>
              <Text style={styles.linkBtnText}>Oda ata →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.emptyRoom}>Misafir yok — giriş için bekleyenler sekmesine bakın.</Text>
        )}
      </View>
    );
  };

  if (loading && !snapshot) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
        <Text style={styles.loadingText}>Konaklama verileri yükleniyor…</Text>
      </View>
    );
  }

  const stats = snapshot?.stats;

  const tabDefs = [
    { key: 'rooms' as const, label: 'Odalar', badge: stats?.guestsInHouse },
    { key: 'pending' as const, label: 'Giriş bekleyen', badge: stats?.pendingCount },
    { key: 'acceptances' as const, label: 'Onaylar', badge: undefined },
    {
      key: 'today' as const,
      label: 'Bugün',
      badge: (snapshot?.todayCheckIns.length ?? 0) + (snapshot?.todayCheckOuts.length ?? 0),
    },
    { key: 'history' as const, label: 'Geçmiş', badge: undefined },
  ] as const;

  if (tab === 'acceptances') {
    return (
      <View style={styles.flex}>
        <View style={styles.acceptancesHeader}>
          <Text style={styles.title}>Konaklama Operasyon Merkezi</Text>
          <View style={styles.tabRow}>
            {tabDefs.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <StaffAcceptancesPanel />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Konaklama Operasyon Merkezi</Text>
        <Text style={styles.subtitle}>
          Odalar, giriş, onaylar ve sözleşme (PDF / yazıcı). Günlük özet için Excel veya günlük rapor.
        </Text>

        <View style={styles.exportRow}>
          <TouchableOpacity
            style={[styles.exportChip, exportBusy && styles.btnDisabled]}
            onPress={exportExcel}
            disabled={exportBusy || !snapshot}
          >
            {exportBusy ? (
              <ActivityIndicator size="small" color="#166534" />
            ) : (
              <>
                <Ionicons name="grid-outline" size={16} color="#166534" />
                <Text style={styles.exportChipText}>Excel</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportChip} onPress={() => router.push(dailyReportPath as never)}>
            <Ionicons name="stats-chart-outline" size={16} color="#1d4ed8" />
            <Text style={[styles.exportChipText, { color: '#1d4ed8' }]}>Günlük rapor</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.exportChip} onPress={() => router.push(breakfastBriefingPath as never)}>
            <Ionicons name="cafe-outline" size={16} color="#b45309" />
            <Text style={[styles.exportChipText, { color: '#b45309' }]}>Kahvaltı sayısı</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportChip, (bulkContractBusy || allInHouseGuests.length === 0) && styles.btnDisabled]}
            onPress={() => runBulkContract('pdf')}
            disabled={bulkContractBusy || allInHouseGuests.length === 0}
          >
            <Ionicons name="documents-outline" size={16} color="#334155" />
            <Text style={styles.exportChipText}>Toplu PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportChip, (bulkContractBusy || allInHouseGuests.length === 0) && styles.btnDisabled]}
            onPress={() => runBulkContract('printer')}
            disabled={bulkContractBusy || allInHouseGuests.length === 0}
          >
            <Ionicons name="print-outline" size={16} color="#334155" />
            <Text style={styles.exportChipText}>Toplu yazıcı</Text>
          </TouchableOpacity>
        </View>

        {canUseAll ? <AdminOrganizationPicker canUseAll={canUseAll} ownOrganizationId={staff?.organization_id} /> : null}

        {stats ? (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>%{stats.occupancyPct}</Text>
              <Text style={styles.statLbl}>Doluluk</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{stats.guestsInHouse}</Text>
              <Text style={styles.statLbl}>Odada</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{stats.pendingCount}</Text>
              <Text style={styles.statLbl}>Giriş bekliyor</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{stats.vacantRooms}</Text>
              <Text style={styles.statLbl}>Boş oda</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.searchRow}>
          <Ionicons name="search" size={18} color="#94a3b8" />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Oda no veya misafir adı…"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.toolbar}>
          <TouchableOpacity
            style={[styles.toolBtn, selectMode && styles.toolBtnActive]}
            onPress={() => {
              setSelectMode((v) => !v);
              setSelectedIds(new Set());
            }}
          >
            <Ionicons name="checkbox-outline" size={16} color={selectMode ? '#fff' : '#334155'} />
            <Text style={[styles.toolBtnText, selectMode && styles.toolBtnTextActive]}>Seç</Text>
          </TouchableOpacity>
          {selectMode ? (
            <>
              <TouchableOpacity style={styles.toolBtn} onPress={selectAllInHouse}>
                <Text style={styles.toolBtnText}>Tümünü seç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, (bulkContractBusy || selectedIds.size === 0) && styles.btnDisabled]}
                onPress={() => runBulkContract('pdf')}
                disabled={bulkContractBusy || selectedIds.size === 0}
              >
                <Text style={styles.toolBtnText}>PDF ({selectedIds.size})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtn, (bulkContractBusy || selectedIds.size === 0) && styles.btnDisabled]}
                onPress={() => runBulkContract('printer')}
                disabled={bulkContractBusy || selectedIds.size === 0}
              >
                <Text style={styles.toolBtnText}>Yazıcı ({selectedIds.size})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toolBtnDanger, (bulkBusy || selectedIds.size === 0) && styles.btnDisabled]}
                onPress={runBulkCheckout}
                disabled={bulkBusy || selectedIds.size === 0}
              >
                {bulkBusy ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.toolBtnDangerText}>Toplu çıkış ({selectedIds.size})</Text>
                )}
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <View style={styles.tabRow}>
          {tabDefs.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, tab === t.key && styles.tabActive]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
              {t.badge != null && t.badge > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeText}>{t.badge > 99 ? '99+' : t.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'rooms' && (
          <View>
            <Text style={styles.sectionHint}>Her odada kim var, ne zaman girdi, sözleşme durumu. Çıkış veya detay buradan.</Text>
            {filteredRooms.length === 0 ? (
              <Text style={styles.emptyHint}>Oda bulunamadı.</Text>
            ) : (
              filteredRooms.map(renderRoomCard)
            )}
          </View>
        )}

        {tab === 'pending' && snapshot && (
          <View>
            <Text style={styles.sectionHint}>Sözleşmesi onaylanmış, henüz odaya yerleştirilmemiş misafirler. Detay → oda ata.</Text>
            {filterGuests(snapshot.pendingGuests).length === 0 ? (
              <Text style={styles.emptyHint}>Bekleyen misafir yok.</Text>
            ) : (
              filterGuests(snapshot.pendingGuests).map((g) => (
                <View key={g.id} style={styles.pendingCard}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.guestName}>{g.full_name}</Text>
                    <Text style={styles.guestMeta}>
                      {g.contract_accepted_at ? `Sözleşme: ${formatDateTime(g.contract_accepted_at)}` : 'Sözleşme onaylı'}
                      {g.phone ? ` · ${g.phone}` : ''}
                    </Text>
                  </View>
                  {renderGuestActions(g, selectMode, false)}
                  <TouchableOpacity style={styles.assignCta} onPress={() => openGuest(g.id)}>
                    <Text style={styles.assignCtaText}>Oda ata</Text>
                    <Ionicons name="arrow-forward" size={16} color="#fff" />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'today' && snapshot && (
          <View>
            <Text style={styles.sectionTitle}>Bugün giriş yapanlar</Text>
            {filterGuests(snapshot.todayCheckIns).length === 0 ? (
              <Text style={styles.emptyHint}>Bugün giriş yok.</Text>
            ) : (
              filterGuests(snapshot.todayCheckIns).map((g) => (
                <View key={`in-${g.id}`} style={styles.timelineCard}>
                  <Ionicons name="log-in-outline" size={20} color="#16a34a" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.guestName}>{g.full_name}</Text>
                    <Text style={styles.guestMeta}>
                      Oda {g.room_number ?? '—'} · {g.check_in_at ? formatTime(g.check_in_at) : '—'}
                    </Text>
                  </View>
                  {renderGuestActions(g, selectMode, false)}
                </View>
              ))
            )}
            <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Bugün çıkış yapanlar</Text>
            {filterGuests(snapshot.todayCheckOuts).length === 0 ? (
              <Text style={styles.emptyHint}>Bugün çıkış yok.</Text>
            ) : (
              filterGuests(snapshot.todayCheckOuts).map((g) => (
                <View key={`out-${g.id}`} style={styles.timelineCard}>
                  <Ionicons name="log-out-outline" size={20} color="#ea580c" />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.guestName}>{g.full_name}</Text>
                    <Text style={styles.guestMeta}>
                      Oda {g.room_number ?? '—'} · {g.check_out_at ? formatTime(g.check_out_at) : '—'}
                    </Text>
                  </View>
                  {renderGuestActions(g, selectMode, false)}
                </View>
              ))
            )}
          </View>
        )}

        {tab === 'history' && snapshot && (
          <View>
            <Text style={styles.sectionHint}>Son çıkış yapan misafirler — detay, sözleşme PDF ve yazıcı için dokunun.</Text>
            {filterGuests(snapshot.recentHistory).length === 0 ? (
              <Text style={styles.emptyHint}>Geçmiş kayıt yok.</Text>
            ) : (
              filterGuests(snapshot.recentHistory).map((g) => (
                <View key={g.id} style={styles.historyCard}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.guestName}>{g.full_name}</Text>
                    <Text style={styles.guestMeta}>
                      Oda {g.room_number ?? '—'} · Giriş {g.check_in_at ? formatDateTime(g.check_in_at) : '—'}
                    </Text>
                    <Text style={styles.guestMeta}>Çıkış {g.check_out_at ? formatDateTime(g.check_out_at) : '—'}</Text>
                  </View>
                  {renderGuestActions(g, selectMode, false)}
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f1f5f9' },
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, color: '#64748b' },
  title: { fontSize: 22, fontWeight: '800', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 6, marginBottom: 14, lineHeight: 18 },
  statsRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  statVal: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  statLbl: { fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: '600' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    minHeight: 44,
    marginBottom: 10,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#0f172a', paddingVertical: 8 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  toolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  toolBtnActive: { backgroundColor: '#1e293b', borderColor: '#1e293b' },
  toolBtnText: { fontSize: 13, fontWeight: '700', color: '#334155' },
  toolBtnTextActive: { color: '#fff' },
  toolBtnDanger: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#dc2626',
  },
  toolBtnDangerText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  btnDisabled: { opacity: 0.6 },
  tabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  tabActive: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#475569' },
  tabTextActive: { color: '#fff' },
  tabBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  tabBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  sectionHint: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  emptyHint: { fontSize: 14, color: '#94a3b8', textAlign: 'center', paddingVertical: 24 },
  roomCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    overflow: 'hidden',
  },
  roomCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  roomNumber: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
  roomSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  roomHeadRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  guestCard: { padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#f1f5f9' },
  guestCardTop: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  guestName: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  guestMeta: { fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 17 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagOk: { backgroundColor: '#dcfce7' },
  tagWarn: { backgroundColor: '#fef3c7' },
  tagMuted: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: '700', color: '#166534' },
  tagTextWarn: { color: '#a16207' },
  tagTextMuted: { fontSize: 11, fontWeight: '600', color: '#64748b' },
  guestActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  manageBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  manageBtnText: { fontSize: 12, fontWeight: '700', color: '#1d4ed8' },
  checkoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    minWidth: 64,
    alignItems: 'center',
  },
  checkoutBtnText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  emptyRoom: { fontSize: 13, color: '#94a3b8', padding: 14, fontStyle: 'italic' },
  pendingInRoom: { padding: 12, gap: 6 },
  pendingInRoomText: { fontSize: 13, color: '#334155', lineHeight: 18 },
  linkBtn: { alignSelf: 'flex-start' },
  linkBtnText: { fontSize: 13, fontWeight: '700', color: '#2563eb' },
  pendingCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 14,
    marginBottom: 8,
    gap: 10,
  },
  assignCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#16a34a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  assignCtaText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  timelineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  exportChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  exportChipText: { fontSize: 12, fontWeight: '700', color: '#166534' },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptancesHeader: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4, backgroundColor: '#f1f5f9' },
});
