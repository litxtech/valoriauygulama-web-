import { Platform } from 'react-native';
import {
  Room,
  RoomEvent,
  Track,
  ConnectionState,
  type Participant,
  type AudioCaptureOptions,
} from 'livekit-client';
import { Audio } from 'expo-av';
import { fetchPttToken, prefetchPttToken } from '@/lib/ptt/api';
import { notifyStaffPttTalkStarted } from '@/lib/ptt/notify';
import { useAuthStore } from '@/stores/authStore';

export type PttPeer = {
  identity: string;
  staffId: string | null;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  micOn: boolean;
};

type Snapshot = {
  connected: boolean;
  talking: boolean;
  roomId: string | null;
  peers: PttPeer[];
  error?: string;
};

type Listener = (s: Snapshot) => void;

/** Konuşma için düşük gecikmeli mono yakalama. */
const VOICE_CAPTURE: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  channelCount: 1,
  voiceIsolation: true,
};

function staffIdFromIdentity(identity: string): string | null {
  const m = /^staff_([0-9a-f-]{8,})$/i.exec(identity);
  return m?.[1] ?? null;
}

function peerFromParticipant(p: Participant, isLocal: boolean, speakingIds: Set<string>): PttPeer {
  let name = p.name || p.identity;
  let staffId = staffIdFromIdentity(p.identity);
  try {
    if (p.metadata) {
      const meta = JSON.parse(p.metadata) as { staffId?: string; name?: string };
      if (meta.staffId) staffId = meta.staffId;
    }
  } catch {
    /* ignore */
  }
  const micOn = p.isMicrophoneEnabled;
  return {
    identity: p.identity,
    staffId,
    name,
    isLocal,
    isSpeaking: speakingIds.has(p.identity) || (isLocal && micOn),
    micOn,
  };
}

/**
 * Üyelik tabanlı LiveKit PTT oturumu.
 * Odaya önceden bağlan + mikrofon muted yayınla → basınca unmute (anında TX).
 */
class PttLiveSession {
  private room: Room | null = null;
  private roomId: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private audioReady = false;
  private micPrimed = false;
  private talking = false;
  private speakingIds = new Set<string>();
  private listeners = new Set<Listener>();
  private nativePreloadPromise: Promise<void> | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  getActiveRoomId(): string | null {
    return this.roomId;
  }

  isConnected(): boolean {
    return Boolean(this.room && this.room.state === ConnectionState.Connected);
  }

  /** Zaten odada olan personel — push spam’ini kesmek için. */
  getConnectedStaffIds(): string[] {
    const ids = new Set<string>();
    const room = this.room;
    if (!room) return [];
    const local = staffIdFromIdentity(room.localParticipant.identity);
    if (local) ids.add(local);
    room.remoteParticipants.forEach((p) => {
      const id = staffIdFromIdentity(p.identity);
      if (id) ids.add(id);
      try {
        if (p.metadata) {
          const meta = JSON.parse(p.metadata) as { staffId?: string };
          if (meta.staffId) ids.add(meta.staffId);
        }
      } catch {
        /* ignore */
      }
    });
    return [...ids];
  }

  private buildPeers(): PttPeer[] {
    const room = this.room;
    if (!room) return [];
    const list: PttPeer[] = [];
    list.push(peerFromParticipant(room.localParticipant, true, this.speakingIds));
    room.remoteParticipants.forEach((p) => {
      list.push(peerFromParticipant(p, false, this.speakingIds));
    });
    return list;
  }

  private snapshot(): Snapshot {
    return {
      connected: this.isConnected(),
      talking: this.talking,
      roomId: this.roomId,
      peers: this.buildPeers(),
    };
  }

  private emit(error?: string) {
    const snap = this.snapshot();
    if (error) snap.error = error;
    this.listeners.forEach((fn) => fn(snap));
  }

  private subscribeRemoteAudio(room: Room) {
    for (const p of room.remoteParticipants.values()) {
      p.getTrackPublications().forEach((pub) => {
        if (pub.kind === Track.Kind.Audio && !pub.isSubscribed) {
          pub.setSubscribed(true);
        }
      });
    }
  }

  private wireRoom(room: Room) {
    const refresh = () => this.emit();
    room.on(RoomEvent.ParticipantConnected, () => {
      this.subscribeRemoteAudio(room);
      refresh();
    });
    room.on(RoomEvent.ParticipantDisconnected, refresh);
    room.on(RoomEvent.ParticipantMetadataChanged, refresh);
    room.on(RoomEvent.TrackMuted, refresh);
    room.on(RoomEvent.TrackUnmuted, refresh);
    room.on(RoomEvent.LocalTrackPublished, refresh);
    room.on(RoomEvent.LocalTrackUnpublished, () => {
      this.micPrimed = false;
      refresh();
    });
    room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      this.speakingIds = new Set(speakers.map((s) => s.identity));
      this.emit();
    });
    room.on(RoomEvent.Disconnected, () => {
      this.talking = false;
      this.micPrimed = false;
      this.speakingIds.clear();
      this.emit();
    });
    room.on(RoomEvent.TrackPublished, () => this.subscribeRemoteAudio(room));
    room.on(RoomEvent.TrackSubscribed, refresh);
  }

  private preloadNativeModules(): Promise<void> {
    if (Platform.OS === 'web') return Promise.resolve();
    if (this.nativePreloadPromise) return this.nativePreloadPromise;
    this.nativePreloadPromise = (async () => {
      const { registerGlobals } = await import('@livekit/react-native');
      try {
        registerGlobals();
      } catch {
        /* already registered */
      }
    })();
    return this.nativePreloadPromise;
  }

  private async ensureNativeAudio() {
    if (Platform.OS === 'web') throw new Error('Bas-konuş webde desteklenmez.');
    if (this.audioReady) return;
    await this.preloadNativeModules();
    const { AudioSession } = await import('@livekit/react-native');
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) throw new Error('Mikrofon izni gerekli.');
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ['speaker', 'bluetooth', 'headset', 'earpiece'],
        audioTypeOptions: {
          manageAudioFocus: true,
          audioMode: 'inCommunication',
          audioFocusMode: 'gain',
          audioAttributesUsageType: 'voiceCommunication',
          audioAttributesContentType: 'speech',
        },
      },
      ios: { defaultOutput: 'speaker' },
    });
    await AudioSession.startAudioSession();
    this.audioReady = true;
  }

  private async releaseNativeAudio() {
    if (!this.audioReady) return;
    this.audioReady = false;
    try {
      const { AudioSession } = await import('@livekit/react-native');
      await AudioSession.stopAudioSession();
    } catch {
      /* ignore */
    }
  }

  /** Token + LiveKit modülü — ses oturumu açmaz (müzik kesilmez). */
  warm(roomId: string): void {
    if (Platform.OS === 'web' || !roomId) return;
    prefetchPttToken(roomId);
    void this.preloadNativeModules();
  }

  async ensureConnected(roomId: string): Promise<void> {
    if (Platform.OS === 'web') throw new Error('Bas-konuş webde desteklenmez.');
    if (!roomId) throw new Error('PTT oda kimliği gerekli.');
    if (this.room && this.room.state === ConnectionState.Connected && this.roomId === roomId) {
      if (!this.micPrimed) await this.primeMicMuted();
      return;
    }
    if (this.connectPromise) {
      await this.connectPromise;
      if (this.room && this.roomId === roomId && this.room.state === ConnectionState.Connected) {
        if (!this.micPrimed) await this.primeMicMuted();
        return;
      }
    }

    this.connectPromise = (async () => {
      const [token] = await Promise.all([fetchPttToken(roomId), this.ensureNativeAudio()]);
      if (this.room) {
        try {
          await this.room.disconnect();
        } catch {
          /* ignore */
        }
        this.room = null;
        this.micPrimed = false;
      }
      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        publishDefaults: {
          dtx: true,
          red: true,
          forceStereo: false,
        },
        audioCaptureDefaults: VOICE_CAPTURE,
      });
      this.wireRoom(room);
      await room.connect(token.url, token.token, { autoSubscribe: true });
      this.room = room;
      this.roomId = token.roomId || roomId;
      this.subscribeRemoteAudio(room);
      this.emit();
      void this.primeMicMuted()
        .then(() => this.emit())
        .catch(() => {
          /* mic prime retry on first talk */
        });
    })();

    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  /** Mikrofonu bir kez yayınla + mute — sonraki TX sadece unmute. */
  private async primeMicMuted(): Promise<void> {
    const lp = this.room?.localParticipant;
    if (!lp || this.micPrimed) return;
    try {
      await lp.setMicrophoneEnabled(true, VOICE_CAPTURE, {
        dtx: true,
        red: true,
      });
      await lp.setMicrophoneEnabled(false);
      this.micPrimed = true;
    } catch {
      this.micPrimed = false;
    }
  }

  async setTalking(enabled: boolean, roomId?: string): Promise<void> {
    // Bırakma yolu: yeniden bağlanma bekleme — anında mute.
    if (!enabled) {
      this.talking = false;
      const lp = this.room?.localParticipant;
      if (lp) this.speakingIds.delete(lp.identity);
      this.emit();
      if (lp) {
        try {
          await lp.setMicrophoneEnabled(false);
        } catch {
          /* ignore */
        }
        this.emit();
      }
      return;
    }

    try {
      const target = roomId || this.roomId;
      if (!target) throw new Error('PTT oda kimliği gerekli.');
      await this.ensureConnected(target);
      const lp = this.room?.localParticipant;
      if (!lp) throw new Error('Odaya bağlanılamadı.');

      this.talking = true;
      this.speakingIds.add(lp.identity);
      this.emit();

      const staff = useAuthStore.getState().staff;
      const speakerStaffId = staff?.id ?? staffIdFromIdentity(lp.identity) ?? '';
      const exclude = new Set(this.getConnectedStaffIds());
      if (speakerStaffId) exclude.add(speakerStaffId);

      void notifyStaffPttTalkStarted({
        speakerStaffId,
        speakerName: staff?.full_name || lp.name || 'Personel',
        roomId: this.roomId || target,
        excludeStaffIds: [...exclude],
      });

      await lp.setMicrophoneEnabled(true, VOICE_CAPTURE, {
        dtx: true,
        red: true,
      });
      this.micPrimed = true;
      this.emit();
    } catch (e) {
      this.talking = false;
      this.emit(e instanceof Error ? e.message : 'Konuşma başlatılamadı.');
      throw e;
    }
  }

  async disconnect(): Promise<void> {
    this.talking = false;
    this.micPrimed = false;
    this.speakingIds.clear();
    this.roomId = null;
    const room = this.room;
    this.room = null;
    if (room) {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        /* ignore */
      }
      try {
        await room.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.emit();
    await this.releaseNativeAudio();
  }
}

export const pttLiveSession = new PttLiveSession();
