import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { getFloatingTabBarTotalHeight } from '@/constants/floatingTabBarMetrics';
import { usePersonelDesign } from '@/hooks/usePersonelDesign';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { PttAvatarStack } from '@/components/staff/PttAvatarStack';
import { PttMembersSheet } from '@/components/staff/PttMembersSheet';
import { PttPersonAvatar } from '@/components/staff/PttPersonAvatar';
import { PttTalkPad } from '@/components/staff/PttTalkPad';
import { pttLiveSession, type PttPeer } from '@/lib/ptt/liveSession';
import {
  addStaffPttRoomMembers,
  createStaffPttRoom,
  ensureDefaultPttMembership,
  joinStaffPttRoom,
  leaveStaffPttRoom,
  listStaffPttRooms,
  removeStaffPttRoomMember,
  type PttStaffPreview,
  type StaffPttRoom,
} from '@/lib/ptt/rooms';
import { playWalkiePttClose, playWalkiePttOpen, preloadWalkieSounds } from '@/lib/ptt/walkieSounds';
import { hapticSelection } from '@/lib/hapticsSafe';

const FAB_SPACE = 88;

function createStyles(p: PersonelDesignPalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: p.pageBg },
    roomsRow: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    roomsScroll: { flexGrow: 0 },
    roomChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingLeft: 8,
      paddingRight: 12,
      paddingVertical: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: p.cardBorder,
      backgroundColor: p.cardBg,
      marginRight: 8,
      minHeight: 52,
    },
    roomChipActive: {
      borderColor: 'transparent',
      backgroundColor: '#0f766e',
    },
    roomChipCopy: { maxWidth: 128 },
    roomChipText: { color: p.text, fontWeight: '800', fontSize: 13 },
    roomChipTextActive: { color: '#fff' },
    roomChipMeta: { color: p.subtext, fontWeight: '600', fontSize: 11, marginTop: 1 },
    roomChipMetaActive: { color: 'rgba(255,255,255,0.78)' },
    createChip: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 8,
      overflow: 'hidden',
    },
    statusLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginHorizontal: 16,
      marginTop: 6,
      marginBottom: 2,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: p.cardBg,
      borderWidth: 1,
      borderColor: p.cardBorder,
    },
    statusLineLive: {
      borderColor: 'rgba(34,197,94,0.4)',
      backgroundColor: 'rgba(34,197,94,0.08)',
    },
    statusText: { flex: 1, color: p.text, fontWeight: '700', fontSize: 13 },
    content: { paddingHorizontal: 16, paddingTop: 8 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    sectionLabel: {
      flex: 1,
      fontSize: 16,
      fontWeight: '800',
      color: p.text,
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.accentSoft,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    emptyBox: {
      paddingVertical: 36,
      paddingHorizontal: 18,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: p.cardBorder,
      backgroundColor: p.cardBg,
      alignItems: 'center',
      gap: 8,
    },
    emptyText: { color: p.subtext, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
    joinCard: {
      marginBottom: 12,
      borderRadius: 16,
      overflow: 'hidden',
    },
    joinCardInner: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    joinHintText: { flex: 1, color: '#fff', fontSize: 13, fontWeight: '700' },
    joinBtn: {
      backgroundColor: '#fff',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
    },
    joinBtnText: { color: '#0f766e', fontWeight: '800', fontSize: 13 },
    fab: {
      position: 'absolute',
      right: 16,
      zIndex: 40,
    },
    webNote: { color: p.subtext, lineHeight: 20, padding: 16 },
    webTitle: { fontSize: 22, fontWeight: '800', color: p.text, paddingHorizontal: 16, paddingTop: 16 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      borderRadius: 22,
      padding: 20,
      backgroundColor: p.cardBg,
      borderWidth: 1,
      borderColor: p.cardBorder,
    },
    modalIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      backgroundColor: p.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    modalTitle: { fontSize: 18, fontWeight: '800', color: p.text, marginBottom: 6 },
    modalHint: { fontSize: 13, fontWeight: '600', color: p.subtext, marginBottom: 14, lineHeight: 18 },
    modalInput: {
      borderWidth: 1,
      borderColor: p.cardBorder,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: p.text,
      fontSize: 16,
      marginBottom: 16,
      backgroundColor: p.pageBg,
    },
    modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
    modalBtn: {
      paddingHorizontal: 16,
      paddingVertical: 11,
      borderRadius: 12,
    },
    modalBtnGhost: { borderWidth: 1, borderColor: p.cardBorder },
    modalBtnText: { fontWeight: '700', fontSize: 14, color: p.text },
    modalBtnTextPrimary: { fontWeight: '800', fontSize: 14, color: '#fff' },
  });
}

export default function StaffPttScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const palette = usePersonelDesign();
  const pageStyles = useMemo(() => createStyles(palette), [palette]);
  const staff = useAuthStore((s) => s.staff);
  const params = useLocalSearchParams<{ autoJoin?: string; speakerName?: string; roomId?: string }>();
  const speakerFromPush = typeof params.speakerName === 'string' ? params.speakerName.trim() : '';
  const paramRoomId = typeof params.roomId === 'string' ? params.roomId.trim() : '';
  const wantAutoJoin =
    params.autoJoin === '1' || params.autoJoin === 'true' || params.autoJoin == null;

  const [connecting, setConnecting] = useState(false);
  const [showConnecting, setShowConnecting] = useState(false);
  const [connected, setConnected] = useState(() => pttLiveSession.isConnected());
  const [talking, setTalking] = useState(false);
  const [peers, setPeers] = useState<PttPeer[]>([]);
  const [roster, setRoster] = useState<PttStaffPreview[]>([]);
  const [rooms, setRooms] = useState<StaffPttRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(() => {
    if (paramRoomId) return paramRoomId;
    return pttLiveSession.getActiveRoomId();
  });
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [creating, setCreating] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [membersStartAdd, setMembersStartAdd] = useState(false);
  const [addingMembers, setAddingMembers] = useState(false);
  const connectInFlight = useRef<string | null>(null);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.id === activeRoomId) ?? null,
    [rooms, activeRoomId]
  );
  const isMemberOfActive = activeRoom
    ? Boolean(activeRoom.isMember)
    : Boolean(activeRoomId && (paramRoomId === activeRoomId || connected || connecting));
  const canManageMembers = isMemberOfActive || staff?.role === 'admin';

  const refreshRooms = useCallback(async () => {
    if (!staff?.id) return;
    await ensureDefaultPttMembership();
    const list = await listStaffPttRooms(staff.id);
    setRooms(list);
    return list;
  }, [staff?.id]);

  useEffect(() => {
    preloadWalkieSounds();
    return pttLiveSession.subscribe((s) => {
      setConnected(s.connected);
      setTalking(s.talking);
      setPeers(s.peers);
      if (s.roomId) setActiveRoomId(s.roomId);
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const seed = paramRoomId || pttLiveSession.getActiveRoomId();
    if (!seed) return;
    pttLiveSession.warm(seed);
    setActiveRoomId((prev) => prev || seed);
  }, [paramRoomId]);

  useEffect(() => {
    if (!connecting || connected) {
      setShowConnecting(false);
      return;
    }
    const timer = setTimeout(() => setShowConnecting(true), 400);
    return () => clearTimeout(timer);
  }, [connecting, connected]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setRoomsLoading(true);
      try {
        const list = await refreshRooms();
        if (cancelled || !list) return;
        const preferred =
          (paramRoomId && list.find((r) => r.id === paramRoomId && r.isMember)?.id) ||
          (paramRoomId && list.find((r) => r.id === paramRoomId)?.id) ||
          list.find((r) => r.isMember && r.is_default)?.id ||
          list.find((r) => r.isMember)?.id ||
          list[0]?.id ||
          null;
        setActiveRoomId((prev) => prev || preferred);
        if (preferred) pttLiveSession.warm(preferred);
      } finally {
        if (!cancelled) setRoomsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshRooms, paramRoomId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!staff?.id) return;
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, profile_image')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name', { ascending: true })
        .limit(200);
      if (!cancelled) setRoster((data as PttStaffPreview[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [staff?.id]);

  const connectToRoom = useCallback(
    async (roomId: string) => {
      if (!staff?.id) {
        Alert.alert(t('error'), t('pttSessionMissing'));
        return;
      }
      if (Platform.OS === 'web') {
        Alert.alert(t('error'), t('pttWebUnsupported'));
        return;
      }
      if (pttLiveSession.getActiveRoomId() === roomId && pttLiveSession.isConnected()) {
        setActiveRoomId(roomId);
        return;
      }
      if (connectInFlight.current === roomId) return;
      connectInFlight.current = roomId;
      setConnecting(true);
      try {
        pttLiveSession.warm(roomId);
        await pttLiveSession.ensureConnected(roomId);
        setActiveRoomId(roomId);
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : t('pttJoinFailed'));
      } finally {
        setConnecting(false);
        if (connectInFlight.current === roomId) connectInFlight.current = null;
      }
    },
    [staff?.id, t]
  );

  const activeRoomMembershipKnown = useMemo(() => {
    const room = rooms.find((r) => r.id === activeRoomId);
    return room ? room.isMember === true : null;
  }, [rooms, activeRoomId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    if (!staff?.id || !wantAutoJoin || !activeRoomId) return;
    if (activeRoomMembershipKnown === false) return;
    if (pttLiveSession.getActiveRoomId() === activeRoomId && pttLiveSession.isConnected()) return;
    void connectToRoom(activeRoomId);
  }, [staff?.id, wantAutoJoin, activeRoomId, activeRoomMembershipKnown, connectToRoom]);

  const setMic = useCallback(
    async (enabled: boolean) => {
      if (!activeRoomId) return;
      try {
        if (enabled) void playWalkiePttOpen();
        else void playWalkiePttClose();
        await pttLiveSession.setTalking(enabled, activeRoomId);
      } catch (e) {
        if (enabled) {
          Alert.alert(t('error'), e instanceof Error ? e.message : t('pttJoinFailed'));
        }
      }
    },
    [activeRoomId, t]
  );

  const onSelectRoom = useCallback(
    async (room: StaffPttRoom) => {
      hapticSelection();
      setActiveRoomId(room.id);
      if (!room.isMember) return;
      await connectToRoom(room.id);
    },
    [connectToRoom]
  );

  const onJoinRoom = useCallback(
    async (room: StaffPttRoom) => {
      try {
        await joinStaffPttRoom(room.id);
        await refreshRooms();
        setActiveRoomId(room.id);
        await connectToRoom(room.id);
      } catch (e) {
        Alert.alert(t('error'), e instanceof Error ? e.message : t('pttRoomJoinFailed'));
      }
    },
    [connectToRoom, refreshRooms, t]
  );

  const afterLeaveOrRemove = useCallback(
    async (leftSelf: boolean) => {
      const list = await refreshRooms();
      if (!leftSelf) return;
      const next =
        list?.find((r) => r.isMember && r.is_default)?.id ||
        list?.find((r) => r.isMember)?.id ||
        list?.[0]?.id ||
        null;
      setActiveRoomId(next);
      if (next && list?.find((r) => r.id === next)?.isMember) {
        await connectToRoom(next);
      }
    },
    [connectToRoom, refreshRooms]
  );

  const onLeaveRoom = useCallback(() => {
    if (!activeRoom) return;
    Alert.alert(t('pttLeaveRoomTitle'), t('pttLeaveRoomBody', { name: activeRoom.name }), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('pttLeaveRoomConfirm'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              if (pttLiveSession.getActiveRoomId() === activeRoom.id) {
                await pttLiveSession.disconnect();
              }
              await leaveStaffPttRoom(activeRoom.id);
              setMembersOpen(false);
              await afterLeaveOrRemove(true);
            } catch (e) {
              Alert.alert(t('error'), e instanceof Error ? e.message : t('pttRoomLeaveFailed'));
            }
          })();
        },
      },
    ]);
  }, [activeRoom, afterLeaveOrRemove, t]);

  const onRemoveMember = useCallback(
    (staffId: string, name: string | null) => {
      if (!activeRoom) return;
      const isSelf = staffId === staff?.id;
      Alert.alert(
        isSelf ? t('pttLeaveRoomTitle') : t('pttRemoveMember'),
        isSelf
          ? t('pttLeaveRoomBody', { name: activeRoom.is_default ? t('pttDefaultRoomName') : activeRoom.name })
          : t('pttRemoveMemberBody', { name: name || t('pttPeopleSection') }),
        [
          { text: t('cancel'), style: 'cancel' },
          {
            text: isSelf ? t('pttLeaveRoomConfirm') : t('pttRemoveMemberConfirm'),
            style: 'destructive',
            onPress: () => {
              void (async () => {
                try {
                  if (isSelf && pttLiveSession.getActiveRoomId() === activeRoom.id) {
                    await pttLiveSession.disconnect();
                  }
                  if (isSelf) await leaveStaffPttRoom(activeRoom.id);
                  else await removeStaffPttRoomMember(activeRoom.id, staffId);
                  await afterLeaveOrRemove(isSelf);
                } catch (e) {
                  Alert.alert(t('error'), e instanceof Error ? e.message : t('pttMemberRemoveFailed'));
                }
              })();
            },
          },
        ]
      );
    },
    [activeRoom, afterLeaveOrRemove, staff?.id, t]
  );

  const onAddMembers = useCallback(
    async (staffIds: string[]) => {
      if (!activeRoom) return;
      setAddingMembers(true);
      try {
        await addStaffPttRoomMembers(activeRoom.id, staffIds);
        await refreshRooms();
      } finally {
        setAddingMembers(false);
      }
    },
    [activeRoom, refreshRooms]
  );

  const onCreateRoom = useCallback(async () => {
    const name = createName.trim();
    if (name.length < 2) {
      Alert.alert(t('error'), t('pttRoomNameInvalid'));
      return;
    }
    setCreating(true);
    try {
      const id = await createStaffPttRoom(name);
      setCreateOpen(false);
      setCreateName('');
      await refreshRooms();
      setActiveRoomId(id);
      await connectToRoom(id);
      setMembersStartAdd(true);
      setMembersOpen(true);
    } catch (e) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('pttRoomCreateFailed'));
    } finally {
      setCreating(false);
    }
  }, [connectToRoom, createName, refreshRooms, t]);

  const tabBarH = getFloatingTabBarTotalHeight(insets.bottom);
  const fabBottom = tabBarH + 10;
  const scrollBottomPad = tabBarH + FAB_SPACE + 16;

  const speakingByStaffId = useMemo(() => {
    const map = new Map<string, PttPeer>();
    for (const p of peers) {
      if (p.staffId) map.set(p.staffId, p);
    }
    return map;
  }, [peers]);

  const onlineIds = useMemo(
    () => new Set(peers.map((p) => p.staffId).filter(Boolean) as string[]),
    [peers]
  );
  const speakingIds = useMemo(() => {
    const set = new Set<string>();
    for (const p of peers) {
      if (p.staffId && (p.isSpeaking || p.micOn)) set.add(p.staffId);
    }
    return set;
  }, [peers]);

  const displayRoster = useMemo(() => {
    const list = [...(activeRoom?.members ?? [])];
    list.sort((a, b) => {
      const aSpeak = speakingIds.has(a.id) ? 1 : 0;
      const bSpeak = speakingIds.has(b.id) ? 1 : 0;
      if (aSpeak !== bSpeak) return bSpeak - aSpeak;
      const aOn = onlineIds.has(a.id) ? 1 : 0;
      const bOn = onlineIds.has(b.id) ? 1 : 0;
      if (aOn !== bOn) return bOn - aOn;
      return (a.full_name || '').localeCompare(b.full_name || '', 'tr');
    });
    return list;
  }, [activeRoom?.members, speakingIds, onlineIds]);

  const activeSpeakerName =
    peers.find((p) => p.isSpeaking || p.micOn)?.name || speakerFromPush || null;
  const onlineCount = onlineIds.size || peers.length;
  const micEnabled = isMemberOfActive && (connected || connecting);
  const showRetry = isMemberOfActive && !connected && !connecting;
  const roomTitle = activeRoom
    ? activeRoom.is_default
      ? t('pttDefaultRoomName')
      : activeRoom.name
    : t('pttNoRoomSelected');

  const statusLabel = talking
    ? t('pttYouTalking')
    : activeSpeakerName
      ? t('pttSomeoneTalking', { name: activeSpeakerName })
      : showConnecting && !connected
        ? t('pttConnecting')
        : connected
          ? t('pttListening')
          : showRetry
            ? t('pttJoinFailed')
            : t('pttNotMemberHint');

  const talkMode: 'talk' | 'talking' | 'join' | 'retry' | 'disabled' = !isMemberOfActive
    ? 'join'
    : showRetry
      ? 'retry'
      : talking
        ? 'talking'
        : micEnabled
          ? 'talk'
          : 'disabled';

  if (Platform.OS === 'web') {
    return (
      <View style={pageStyles.container}>
        <Text style={pageStyles.webTitle}>{t('pttTitle')}</Text>
        <Text style={pageStyles.webNote}>{t('pttWebUnsupported')}</Text>
      </View>
    );
  }

  return (
    <View style={pageStyles.container}>
      <View style={pageStyles.roomsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={pageStyles.roomsScroll}
          contentContainerStyle={{ alignItems: 'center', paddingRight: 8 }}
        >
          <Pressable
            style={pageStyles.createChip}
            onPress={() => setCreateOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('pttCreateRoom')}
          >
            <LinearGradient colors={['#0f766e', '#14b8a6']} style={StyleSheet.absoluteFill} />
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
          {roomsLoading ? <ActivityIndicator size="small" color="#0f766e" /> : null}
          {rooms.map((room) => {
            const active = room.id === activeRoomId;
            const label = room.is_default ? t('pttDefaultRoomName') : room.name;
            return (
              <Pressable
                key={room.id}
                style={[pageStyles.roomChip, active && pageStyles.roomChipActive]}
                onPress={() => void onSelectRoom(room)}
                onLongPress={() => {
                  setActiveRoomId(room.id);
                  setMembersStartAdd(false);
                  setMembersOpen(true);
                }}
              >
                {(room.members?.length ?? 0) > 0 ? (
                  <PttAvatarStack
                    people={room.members ?? []}
                    size={28}
                    max={3}
                    borderColor={active ? '#ffffff' : palette.cardBg}
                  />
                ) : (
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: active ? 'rgba(255,255,255,0.18)' : palette.accentSoft,
                    }}
                  >
                    <Ionicons name="people" size={14} color={active ? '#fff' : palette.accent} />
                  </View>
                )}
                <View style={pageStyles.roomChipCopy}>
                  <Text
                    style={[pageStyles.roomChipText, active && pageStyles.roomChipTextActive]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                  <Text style={[pageStyles.roomChipMeta, active && pageStyles.roomChipMetaActive]} numberOfLines={1}>
                    {t('pttMemberCount', { count: room.memberCount ?? 0 })}
                    {room.isMember ? '' : ` · ${t('pttRoomJoinShort')}`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <Pressable
        style={[pageStyles.statusLine, activeSpeakerName || talking ? pageStyles.statusLineLive : null]}
        onPress={
          showRetry
            ? () => activeRoomId && void connectToRoom(activeRoomId)
            : !isMemberOfActive && activeRoom
              ? () => void onJoinRoom(activeRoom)
              : () => {
                  setMembersStartAdd(false);
                  setMembersOpen(true);
                }
        }
      >
        {connecting && !connected && showConnecting ? (
          <ActivityIndicator size="small" color="#0f766e" />
        ) : (
          <Ionicons
            name={talking ? 'mic' : activeSpeakerName ? 'radio' : connected ? 'headset-outline' : 'alert-circle-outline'}
            size={16}
            color={talking || activeSpeakerName ? '#16a34a' : palette.subtext}
          />
        )}
        <Text style={pageStyles.statusText} numberOfLines={1}>
          {statusLabel}
        </Text>
        {onlineCount > 0 ? (
          <Text style={[pageStyles.roomChipMeta, { marginTop: 0 }]}>
            {t('pttOnlineCount', { count: onlineCount })}
          </Text>
        ) : null}
      </Pressable>

      <ScrollView
        contentContainerStyle={[pageStyles.content, { paddingBottom: scrollBottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        {!isMemberOfActive && activeRoom ? (
          <Pressable style={pageStyles.joinCard} onPress={() => void onJoinRoom(activeRoom)}>
            <LinearGradient
              colors={['#0f766e', '#0d9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={pageStyles.joinCardInner}
            >
              <Text style={pageStyles.joinHintText}>{t('pttNotMemberHint')}</Text>
              <View style={pageStyles.joinBtn}>
                <Text style={pageStyles.joinBtnText}>{t('pttRoomJoinCta')}</Text>
              </View>
            </LinearGradient>
          </Pressable>
        ) : null}

        <View style={pageStyles.sectionHead}>
          <Text style={pageStyles.sectionLabel}>
            {t('pttMembersTitle')}
            {displayRoster.length > 0 ? ` · ${displayRoster.length}` : ''}
          </Text>
          {canManageMembers ? (
            <Pressable
              style={pageStyles.iconBtn}
              onPress={() => {
                setMembersStartAdd(true);
                setMembersOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('pttAddMember')}
            >
              <Ionicons name="person-add" size={18} color={palette.accent} />
            </Pressable>
          ) : null}
          <Pressable
            style={pageStyles.iconBtn}
            onPress={() => {
              setMembersStartAdd(false);
              setMembersOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel={t('pttMembersTitle')}
          >
            <Ionicons name="people" size={18} color={palette.accent} />
          </Pressable>
          {isMemberOfActive ? (
            <Pressable
              style={pageStyles.iconBtn}
              onPress={onLeaveRoom}
              accessibilityRole="button"
              accessibilityLabel={t('pttLeaveRoomConfirm')}
            >
              <Ionicons name="exit-outline" size={18} color={palette.accent} />
            </Pressable>
          ) : null}
        </View>

        {displayRoster.length === 0 ? (
          <View style={pageStyles.emptyBox}>
            <Ionicons name="people-outline" size={36} color={palette.muted} />
            <Text style={pageStyles.emptyText}>{t('pttPeopleEmpty')}</Text>
          </View>
        ) : (
          <View style={pageStyles.grid}>
            {displayRoster.map((person) => {
              const peer = speakingByStaffId.get(person.id);
              const speaking = Boolean(peer?.isSpeaking || peer?.micOn);
              const online = onlineIds.has(person.id);
              return (
                <PttPersonAvatar
                  key={person.id}
                  name={person.full_name}
                  imageUrl={person.profile_image}
                  speaking={speaking}
                  online={online}
                  isMe={person.id === staff?.id}
                  pageBg={palette.pageBg}
                  textColor={palette.text}
                  mutedColor={palette.subtext}
                  cardBg={palette.cardBg}
                  borderColor={palette.cardBorder}
                  speakingColor={palette.online}
                  onPress={() => router.push(`/staff/profile/${person.id}`)}
                />
              );
            })}
          </View>
        )}
      </ScrollView>

      <View style={[pageStyles.fab, { bottom: fabBottom }]}>
        <PttTalkPad
          mode={talkMode}
          talkLabel={t('pttHoldToTalk')}
          joinLabel={!isMemberOfActive ? t('pttRoomJoinCta') : t('pttJoinCta')}
          connecting={showConnecting && connecting}
          onPressIn={() => {
            if (!micEnabled) return;
            void setMic(true);
          }}
          onPressOut={() => {
            if (!micEnabled) return;
            void setMic(false);
          }}
          onJoinOrRetry={() => {
            if (!isMemberOfActive && activeRoom) void onJoinRoom(activeRoom);
            else if (showRetry && activeRoomId) void connectToRoom(activeRoomId);
          }}
        />
      </View>

      <PttMembersSheet
        visible={membersOpen}
        onClose={() => setMembersOpen(false)}
        palette={palette}
        roomName={roomTitle}
        members={activeRoom?.members ?? []}
        roster={roster}
        myStaffId={staff?.id ?? null}
        canManage={canManageMembers}
        onlineIds={onlineIds}
        speakingIds={speakingIds}
        adding={addingMembers}
        startInAdd={membersStartAdd}
        onAdd={onAddMembers}
        onRemove={onRemoveMember}
        onOpenProfile={(staffId) => {
          setMembersOpen(false);
          router.push(`/staff/profile/${staffId}`);
        }}
      />

      <Modal visible={createOpen} transparent animationType="fade" onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={pageStyles.modalBackdrop} onPress={() => setCreateOpen(false)}>
          <Pressable style={pageStyles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={pageStyles.modalIcon}>
              <Ionicons name="radio" size={22} color={palette.accent} />
            </View>
            <Text style={pageStyles.modalTitle}>{t('pttCreateRoom')}</Text>
            <Text style={pageStyles.modalHint}>{t('pttCreateRoomHint')}</Text>
            <TextInput
              style={pageStyles.modalInput}
              value={createName}
              onChangeText={setCreateName}
              placeholder={t('pttRoomNamePlaceholder')}
              placeholderTextColor={palette.subtext}
              autoFocus
              maxLength={80}
            />
            <View style={pageStyles.modalActions}>
              <Pressable style={[pageStyles.modalBtn, pageStyles.modalBtnGhost]} onPress={() => setCreateOpen(false)}>
                <Text style={pageStyles.modalBtnText}>{t('cancel')}</Text>
              </Pressable>
              <Pressable onPress={() => void onCreateRoom()} disabled={creating}>
                <LinearGradient colors={['#0f766e', '#14b8a6']} style={pageStyles.modalBtn}>
                  {creating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={pageStyles.modalBtnTextPrimary}>{t('pttCreateRoomConfirm')}</Text>
                  )}
                </LinearGradient>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
