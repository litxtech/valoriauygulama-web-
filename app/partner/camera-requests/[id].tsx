import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PartnerField,
  PartnerGlassCard,
  PartnerHero,
  PartnerPrimaryButton,
  PartnerReadOnlyField,
  PartnerSectionTitle,
} from '@/components/breakfastPartner/PartnerUi';
import { PartnerCameraRequestStatusChip } from '@/components/breakfastPartner/PartnerCameraRequestStatusChip';
import { PartnerCameraRequestVideoPlayer } from '@/components/breakfastPartner/PartnerCameraRequestVideoPlayer';
import {
  formatCameraRequestCreatedMeta,
  formatCameraRequestTimeRange,
  partnerCanAppealCameraRequest,
  partnerCanViewCameraVideo,
  partnerCreateCameraRequestAppeal,
  partnerGetCameraRequestDetail,
  partnerMarkCameraRequestViewed,
  type CameraRequestDetail,
} from '@/lib/breakfastPartnerCameraRequests';
import { formatPartnerDate } from '@/lib/breakfastPartner';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

function routeId(v: string | string[] | undefined): string | undefined {
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.trim() ? s.trim() : undefined;
}

export default function PartnerCameraRequestDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const requestId = routeId(id);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [detail, setDetail] = useState<CameraRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState('');
  const [appealDescription, setAppealDescription] = useState('');
  const [appealSaving, setAppealSaving] = useState(false);
  const [viewedMarked, setViewedMarked] = useState(false);

  const load = useCallback(async () => {
    if (!requestId) return;
    try {
      setDetail(await partnerGetCameraRequestDetail(requestId));
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

  const latestVideo = detail?.videos[0] ?? null;
  const canWatch = detail ? partnerCanViewCameraVideo(detail) && Boolean(latestVideo) : false;
  const canAppeal = detail ? partnerCanAppealCameraRequest(detail) : false;
  const openAppeal = detail?.appeals.find((a) => a.status === 'bekliyor') ?? null;

  const onVideoPlay = () => {
    if (!requestId || viewedMarked) return;
    setViewedMarked(true);
    void partnerMarkCameraRequestViewed(requestId).then(load);
  };

  const submitAppeal = async () => {
    if (!requestId) return;
    if (!appealReason.trim() || !appealDescription.trim()) {
      Alert.alert('Hata', 'İtiraz nedeni ve açıklama zorunludur.');
      return;
    }
    setAppealSaving(true);
    const { error } = await partnerCreateCameraRequestAppeal({
      requestId,
      appealReason: appealReason.trim(),
      description: appealDescription.trim(),
    });
    setAppealSaving(false);
    if (error) {
      Alert.alert('İtiraz gönderilemedi', error);
      return;
    }
    setAppealOpen(false);
    setAppealReason('');
    setAppealDescription('');
    Alert.alert('İtiraz oluşturuldu', 'Durum: İTİRAZ BEKLİYOR');
    void load();
  };

  if (!requestId) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Talep bulunamadı.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <PartnerHero title="Talep detayı" onBack={() => router.back()} />
      {loading && !detail ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : !detail ? (
        <View style={styles.centered}>
          <Text style={styles.muted}>Kayıt yüklenemedi.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.statusRow}>
            <PartnerCameraRequestStatusChip status={detail.status} />
            <Text style={styles.meta}>Oluşturma: {formatCameraRequestCreatedMeta(detail.createdAt)}</Text>
          </View>

          <PartnerGlassCard>
            <PartnerSectionTitle title="Talep bilgileri" />
            <PartnerReadOnlyField label="Talep tarihi" value={formatPartnerDate(detail.requestDate)} />
            <PartnerReadOnlyField
              label="Talep saati"
              value={formatCameraRequestTimeRange(detail.timeStart, detail.timeEnd)}
            />
            {detail.guestName ? <PartnerReadOnlyField label="Misafir adı" value={detail.guestName} /> : null}
            {detail.roomNumber ? <PartnerReadOnlyField label="Oda numarası" value={detail.roomNumber} /> : null}
            <PartnerReadOnlyField label="Talep nedeni" value={detail.requestReason} />
            <PartnerReadOnlyField label="Açıklama" value={detail.description} />
          </PartnerGlassCard>

          {detail.adminNote ? (
            <PartnerGlassCard>
              <PartnerSectionTitle title="Admin notu" />
              <Text style={styles.bodyText}>{detail.adminNote}</Text>
            </PartnerGlassCard>
          ) : null}

          {detail.rejectionReason ? (
            <PartnerGlassCard>
              <PartnerSectionTitle title="Red nedeni" />
              <Text style={[styles.bodyText, { color: partnerTheme.danger }]}>{detail.rejectionReason}</Text>
            </PartnerGlassCard>
          ) : null}

          {canWatch && latestVideo ? (
            <PartnerGlassCard>
              <PartnerSectionTitle title="Kamera kaydı" />
              <PartnerCameraRequestVideoPlayer uri={latestVideo.publicUrl} onFirstPlay={onVideoPlay} />
            </PartnerGlassCard>
          ) : null}

          {openAppeal ? (
            <PartnerGlassCard>
              <PartnerSectionTitle title="Bekleyen itiraz" />
              <PartnerReadOnlyField label="Neden" value={openAppeal.appealReason} />
              <PartnerReadOnlyField label="Açıklama" value={openAppeal.description} />
            </PartnerGlassCard>
          ) : null}

          {detail.appeals.find((a) => a.adminResponse) ? (
            <PartnerGlassCard>
              <PartnerSectionTitle title="İtiraz cevabı" />
              <Text style={styles.bodyText}>
                {detail.appeals.find((a) => a.adminResponse)?.adminResponse}
              </Text>
            </PartnerGlassCard>
          ) : null}

          {canAppeal ? (
            <PartnerPrimaryButton label="İtiraz et" variant="ghost" onPress={() => setAppealOpen(true)} />
          ) : null}

          <PartnerGlassCard>
            <PartnerSectionTitle title="Geçmiş" />
            {detail.messages.map((m) => (
              <View key={m.id} style={styles.msgRow}>
                <Text style={styles.msgMeta}>{formatCameraRequestCreatedMeta(m.createdAt)}</Text>
                <Text style={styles.bodyText}>{m.body}</Text>
              </View>
            ))}
          </PartnerGlassCard>
        </ScrollView>
      )}

      <Modal visible={appealOpen} animationType="slide" transparent onRequestClose={() => setAppealOpen(false)}>
        <KeyboardAvoidingView style={styles.modalBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>İtiraz oluştur</Text>
            <PartnerField label="İtiraz nedeni" value={appealReason} onChangeText={setAppealReason} />
            <PartnerField label="Açıklama" value={appealDescription} onChangeText={setAppealDescription} multiline />
            <View style={styles.modalActions}>
              <PartnerPrimaryButton label="Vazgeç" variant="ghost" onPress={() => setAppealOpen(false)} />
              <PartnerPrimaryButton label="Gönder" loading={appealSaving} onPress={() => void submitAppeal()} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  scroll: { paddingHorizontal: 18, paddingTop: 8, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: partnerTheme.bg },
  muted: { color: partnerTheme.muted },
  statusRow: { gap: 8, marginBottom: 4 },
  meta: { color: partnerTheme.muted, fontSize: 12 },
  bodyText: { color: partnerTheme.text, fontSize: 14, lineHeight: 21 },
  msgRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: partnerTheme.cardBorder,
    paddingTop: 10,
    marginTop: 10,
    gap: 4,
  },
  msgMeta: { color: partnerTheme.muted, fontSize: 11 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: partnerTheme.card,
    borderTopLeftRadius: partnerRadii.xl,
    borderTopRightRadius: partnerRadii.xl,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  modalTitle: { color: partnerTheme.text, fontWeight: '800', fontSize: 18, marginBottom: 4 },
  modalActions: { gap: 8, marginTop: 8 },
});
