import { memo, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVoiceRecorder } from '@/lib/useVoiceRecorder';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { pds } from '@/constants/personelDesignSystem';

type Props = {
  /** Kayıt sonrası yerel URI */
  localUri: string | null;
  durationSec: number;
  onLocalUriChange: (uri: string | null, durationSec: number) => void;
  /** Sunucuda kayıtlı ses (oynatma) */
  remoteUrl?: string | null;
  remoteDurationSec?: number | null;
  disabled?: boolean;
  label?: string;
};

/** Oda ödemesi durum açıklaması — kaydet / dinle / sil */
export const RoomPaymentVoiceCapture = memo(function RoomPaymentVoiceCapture({
  localUri,
  durationSec,
  onLocalUriChange,
  remoteUrl,
  remoteDurationSec,
  disabled,
  label = 'Sesli durum notu',
}: Props) {
  const recorder = useVoiceRecorder();
  const playUri = localUri || remoteUrl || null;
  const playDur = localUri ? durationSec : remoteDurationSec ?? undefined;

  useEffect(() => {
    return () => {
      void recorder.release();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onStart = async () => {
    if (disabled) return;
    const err = await recorder.startRecording();
    if (err) {
      // parent Alert kullanabilir; kısa text göster
    }
  };

  const onStop = async () => {
    const uri = await recorder.stopRecording();
    if (uri) onLocalUriChange(uri, recorder.durationSec);
  };

  const onClear = async () => {
    await recorder.reset();
    onLocalUriChange(null, 0);
  };

  const recording = recorder.state === 'recording';

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>Durumu sesle anlatın — resepsiyon ve admin dinleyebilir</Text>

      {playUri && !recording ? (
        <View style={styles.playerRow}>
          <View style={{ flex: 1 }}>
            <VoiceMessagePlayer
              uri={playUri}
              isOwn={false}
              durationSec={playDur ?? null}
            />
          </View>
          <TouchableOpacity
            style={styles.clearBtn}
            onPress={() => void onClear()}
            disabled={disabled}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.actions}>
        {recording ? (
          <>
            <View style={styles.recBadge}>
              <View style={styles.recDot} />
              <Text style={styles.recText}>Kayıt {recorder.durationSec}s</Text>
            </View>
            <TouchableOpacity style={styles.stopBtn} onPress={() => void onStop()} activeOpacity={0.85}>
              <Ionicons name="stop" size={18} color="#fff" />
              <Text style={styles.stopText}>Durdur</Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.recBtn, disabled && { opacity: 0.5 }]}
            onPress={() => void onStart()}
            disabled={disabled}
            activeOpacity={0.85}
          >
            <Ionicons name="mic" size={18} color="#fff" />
            <Text style={styles.recBtnText}>{playUri ? 'Yeniden kaydet' : 'Ses kaydet'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {recorder.error ? <Text style={styles.error}>{recorder.error}</Text> : null}
      {recorder.state === 'error' && !recorder.error ? (
        <ActivityIndicator color={pds.accent} style={{ marginTop: 6 }} />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 4 },
  label: { fontSize: 12, fontWeight: '700', color: pds.subtext },
  hint: { fontSize: 11, color: pds.muted, marginTop: -4 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: pds.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  recBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#dc2626',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  stopText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  recBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#dc2626' },
  recText: { fontSize: 13, fontWeight: '700', color: '#991b1b' },
  error: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
});
