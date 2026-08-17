import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { hapticSelection } from '@/lib/hapticsSafe';
import { pttLiveSession } from '@/lib/ptt/liveSession';
import { resolveActivePttRoomId } from '@/lib/ptt/rooms';
import { playWalkiePttClose, playWalkiePttOpen } from '@/lib/ptt/walkieSounds';
import { useAuthStore } from '@/stores/authStore';

type Props = {
  bottomOffset: number;
  isNight?: boolean;
};

/** Kısa tık → sayfa; bu süreden uzun basılı tut → konuş. */
const HOLD_START_MS = 180;

/**
 * Feed: tab menüden bağımsız sabit bas-konuş.
 * Kısa tık → /staff/ptt | Basılı tut → konuş.
 */
export function StaffFeedPttFab({ bottomOffset, isNight }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const staffId = useAuthStore((s) => s.staff?.id);
  const [talking, setTalking] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const roomIdRef = useRef<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const talkStarted = useRef(false);
  const talkGen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const roomId = await resolveActivePttRoomId(staffId);
      if (cancelled || !roomId) return;
      roomIdRef.current = roomId;
      pttLiveSession.warm(roomId);
    })();
    return pttLiveSession.subscribe((s) => {
      setTalking(s.talking);
      if (s.roomId) roomIdRef.current = s.roomId;
    });
  }, [staffId]);

  const clearHoldTimer = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const beginTalk = useCallback(() => {
    talkStarted.current = true;
    const gen = ++talkGen.current;
    setConnecting(true);
    hapticSelection();
    void (async () => {
      try {
        let roomId = roomIdRef.current || pttLiveSession.getActiveRoomId();
        if (!roomId) {
          roomId = await resolveActivePttRoomId(staffId);
          roomIdRef.current = roomId;
        }
        if (!roomId) throw new Error('no_room');
        pttLiveSession.warm(roomId);
        await pttLiveSession.setTalking(true, roomId);
        void playWalkiePttOpen();
      } catch {
        talkStarted.current = false;
      } finally {
        if (gen === talkGen.current) setConnecting(false);
      }
    })();
  }, [staffId]);

  const endTalk = useCallback(async () => {
    const gen = ++talkGen.current;
    const wasTalking = talkStarted.current;
    talkStarted.current = false;
    try {
      await pttLiveSession.setTalking(false);
      if (wasTalking) await playWalkiePttClose();
      await pttLiveSession.disconnect();
    } catch {
      /* ignore */
    } finally {
      if (gen === talkGen.current) setConnecting(false);
    }
  }, []);

  const onPressIn = useCallback(() => {
    clearHoldTimer();
    talkStarted.current = false;
    holdTimer.current = setTimeout(() => {
      holdTimer.current = null;
      beginTalk();
    }, HOLD_START_MS);
  }, [beginTalk]);

  const onPressOut = useCallback(() => {
    const started = talkStarted.current;
    clearHoldTimer();
    if (started) {
      void endTalk();
      return;
    }
    hapticSelection();
    const roomId = roomIdRef.current || pttLiveSession.getActiveRoomId();
    router.push({
      pathname: '/staff/ptt',
      params: { autoJoin: '1', ...(roomId ? { roomId } : {}) },
    } as Href);
  }, [endTalk, router]);

  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: bottomOffset }]}>
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: talking ? '#22c55e' : isNight ? '#0284c7' : '#0ea5e9' },
          (pressed || talking) && styles.fabActive,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t('pttHoldToTalk')}
        hitSlop={10}
      >
        {connecting && !talking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Ionicons name={talking ? 'mic' : 'mic-outline'} size={24} color="#fff" />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: 16,
    zIndex: 80,
    elevation: 80,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 10,
  },
  fabActive: {
    transform: [{ scale: 1.06 }],
  },
});
