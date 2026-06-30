import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BreakfastPartnerAdminGate } from '@/components/breakfastPartner/BreakfastPartnerAdminGate';
import { PartnerCameraRequestStatusChip } from '@/components/breakfastPartner/PartnerCameraRequestStatusChip';
import { PartnerCameraRequestVideoPlayer } from '@/components/breakfastPartner/PartnerCameraRequestVideoPlayer';
import {
  adminAddCameraRequestNote,
  adminCloseCameraRequest,
  adminGetCameraRequestDetail,
  adminRejectCameraRequest,
  adminRespondCameraRequestAppeal,
  adminUploadCameraRequestVideo,
  formatCameraRequestCreatedMeta,
  formatCameraRequestTimeRange,
  pickCameraRequestVideo,
  type CameraRequestDetail,
} from '@/lib/breakfastPartnerCameraRequests';
import { notifyPartnerCameraRequestVideoReady } from '@/lib/breakfastPartnerCameraNotify';
import { formatPartnerDate } from '@/lib/breakfastPartner';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';
import { TextInput } from 'react-native';

function routeId(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

export default function AdminCameraRequestDetailScreen() {
  return (
    <BreakfastPartnerAdminGate>
      <AdminCameraRequestDetailInner />
    </BreakfastPartnerAdminGate>
  );
}

function AdminCameraRequestDetailInner() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const requestId = routeId(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<CameraRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [appealResponse, setAppealResponse] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) return;
    try {
      const d = await adminGetCameraRequestDetail(requestId);
      setDetail(d);
      setNote(d?.adminNote ?? '');
    } catch {
      setDetail(null);
    }
    setLoading(false);
  }, [requestId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const uploadVideo = async (isReplacement = false) => {
    if (!detail || !requestId) return;
    try {
      const picked = await pickCameraRequestVideo();
      if (!picked) return;
      setUploading(true);
      const { videoId, error } = await adminUploadCameraRequestVideo({
        requestId,
        partnerHotelId: detail.partnerHotelId,
        localUri: picked.uri,
        mimeType: picked.mime,
        fileName: picked.name,
        isReplacement,
      });
      setUploading(false);
      if (!videoId) {
        Alert.alert('Yükleme başarısız', error ?? 'Video kaydedilemedi');
        return;
      }
      await notifyPartnerCameraRequestVideoReady({
        partnerHotelId: detail.partnerHotelId,
        requestId,
        hotelName: detail.hotelName,
      });
      Alert.alert('Video yüklendi', 'Partner bilgilendirildi.');
      void load();
    } catch (e) {
      setUploading(false);
      Alert.alert('Hata', (e as Error).message);
    }
  };

  const saveNote = async () => {
    if (!requestId || !note.trim()) return;
    setBusy(true);
    const err = await adminAddCameraRequestNote(requestId, note.trim());
    setBusy(false);
    if (err) Alert.alert('Hata', err);
    else void load();
  };

  const reject = async () => {
    if (!requestId) return;
    setBusy(true);
    const err = await adminRejectCameraRequest(requestId, rejectReason);
    setBusy(false);
    if (err) Alert.alert('Hata', err);
    else {
      Alert.alert('Reddedildi');
      void load();
    }
  };

  const closeRequest = async () => {
    if (!requestId) return;
    setBusy(true);
    const err = await adminCloseCameraRequest(requestId);
    setBusy(false);
    if (err) Alert.alert('Hata', err);
    else void load();
  };

  const respondAppeal = async () => {
    const appeal = detail?.appeals.find((a) => a.status === 'bekliyor');
    if (!appeal || !appealResponse.trim()) {
      Alert.alert('Hata', 'Cevap metni zorunludur.');
      return;
    }
    setBusy(true);
    const err = await adminRespondCameraRequestAppeal(appeal.id, appealResponse.trim());
    setBusy(false);
    if (err) Alert.alert('Hata', err);
    else {
      setAppealResponse('');
      void load();
    }
  };

  if (!requestId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Talep bulunamadı.</Text>
      </View>
    );
  }

  const latestVideo = detail?.videos[0] ?? null;
  const openAppeal = detail?.appeals.find((a) => a.status === 'bekliyor') ?? null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#e2e8f0" />
        </Pressable>
        <Text style={styles.title}>Talep detayı</Text>
      </View>

      {loading && !detail ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : !detail ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>Kayıt yüklenemedi.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24, gap: 12 }}>
          <View style={styles.card}>
            <Text style={styles.hotel}>{detail.hotelName ?? 'Partner otel'}</Text>
            <PartnerCameraRequestStatusChip status={detail.status} />
            <Text style={styles.line}>Tarih: {formatPartnerDate(detail.requestDate)}</Text>
            <Text style={styles.line}>
              Saat: {formatCameraRequestTimeRange(detail.timeStart, detail.timeEnd)}
            </Text>
            {detail.guestName ? <Text style={styles.line}>Misafir: {detail.guestName}</Text> : null}
            {detail.roomNumber ? <Text style={styles.line}>Oda: {detail.roomNumber}</Text> : null}
            <Text style={styles.line}>Neden: {detail.requestReason}</Text>
            <Text style={styles.body}>{detail.description}</Text>
            <Text style={styles.meta}>Oluşturma: {formatCameraRequestCreatedMeta(detail.createdAt)}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.section}>Admin notu</Text>
            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder="Not ekleyin…"
              placeholderTextColor="#64748b"
              multiline
            />
            <Pressable style={styles.btn} onPress={() => void saveNote()} disabled={busy}>
              <Text style={styles.btnText}>Notu kaydet</Text>
            </Pressable>
          </View>

          {latestVideo ? (
            <View style={styles.card}>
              <Text style={styles.section}>Yüklenen video</Text>
              <PartnerCameraRequestVideoPlayer uri={latestVideo.publicUrl} />
            </View>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.section}>Video yükle</Text>
            <Text style={styles.hint}>Galeriden mp4, mov veya m4v seçin (en fazla ~100 MB).</Text>
            <Pressable
              style={[styles.btn, styles.btnAccent, uploading && { opacity: 0.6 }]}
              onPress={() => void uploadVideo(openAppeal != null)}
              disabled={uploading}
            >
              <Text style={styles.btnTextDark}>
                {uploading ? 'Yükleniyor…' : openAppeal ? 'Galeriden yeni video seç' : 'Galeriden video seç'}
              </Text>
            </Pressable>
          </View>

          {openAppeal ? (
            <View style={styles.card}>
              <Text style={styles.section}>Bekleyen itiraz</Text>
              <Text style={styles.body}>{openAppeal.appealReason}</Text>
              <Text style={styles.body}>{openAppeal.description}</Text>
              <TextInput
                style={styles.input}
                value={appealResponse}
                onChangeText={setAppealResponse}
                placeholder="İtiraz cevabı…"
                placeholderTextColor="#64748b"
                multiline
              />
              <Pressable style={styles.btn} onPress={() => void respondAppeal()} disabled={busy}>
                <Text style={styles.btnText}>İtirazı cevapla</Text>
              </Pressable>
            </View>
          ) : null}

          {detail.status === 'bekliyor' ? (
            <View style={styles.card}>
              <Text style={styles.section}>Talebi reddet</Text>
              <TextInput
                style={styles.input}
                value={rejectReason}
                onChangeText={setRejectReason}
                placeholder="Red nedeni (opsiyonel)"
                placeholderTextColor="#64748b"
              />
              <Pressable style={[styles.btn, styles.btnDanger]} onPress={() => void reject()} disabled={busy}>
                <Text style={styles.btnText}>Reddet</Text>
              </Pressable>
            </View>
          ) : null}

          {['video_yuklendi', 'itiraz_bekliyor', 'itiraz_cevaplandi'].includes(detail.status) ? (
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => void closeRequest()} disabled={busy}>
              <Text style={styles.btnText}>Talebi sonuçlandır / kapat</Text>
            </Pressable>
          ) : null}

          <View style={styles.card}>
            <Text style={styles.section}>Geçmiş</Text>
            {detail.messages.map((m) => (
              <Text key={m.id} style={styles.msg}>
                · {m.body}
              </Text>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0c1222' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  title: { color: '#f8fafc', fontSize: 20, fontWeight: '800' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: '#64748b' },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    gap: 8,
  },
  hotel: { color: '#f8fafc', fontWeight: '800', fontSize: 16 },
  line: { color: '#cbd5e1', fontSize: 14 },
  body: { color: '#e2e8f0', fontSize: 14, lineHeight: 20 },
  meta: { color: '#64748b', fontSize: 12 },
  section: { color: '#94a3b8', fontWeight: '700', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { color: '#64748b', fontSize: 12, lineHeight: 18, marginBottom: 4 },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    color: '#f1f5f9',
    padding: 12,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  btn: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnAccent: { backgroundColor: partnerTheme.accent },
  btnDanger: { backgroundColor: 'rgba(239,68,68,0.25)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)' },
  btnGhost: { borderWidth: 1, borderColor: '#334155', marginTop: 4 },
  btnText: { color: '#e2e8f0', fontWeight: '700' },
  btnTextDark: { color: '#0f172a', fontWeight: '800' },
  msg: { color: '#94a3b8', fontSize: 13, lineHeight: 18 },
});
