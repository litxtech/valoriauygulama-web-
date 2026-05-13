import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Vibration,
  Platform,
  TextInput,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { sendNotification } from '@/lib/notificationService';
import { CachedImage } from '@/components/CachedImage';
import {
  sortWarningsByUrgency,
  type StaffPersonnelWarningSeverity,
  SEVERITY_DESC_TR,
  SEVERITY_LABEL_TR,
  STAFF_WARNING_GATE_SEVERITIES,
} from '@/lib/staffPersonnelWarnings';

type WarningRow = {
  id: string;
  severity: StaffPersonnelWarningSeverity;
  subject_line: string | null;
  body: string;
  created_at: string;
  issued_by_staff_id: string;
  image_urls: unknown;
};

const { width: SCREEN_W } = Dimensions.get('window');

const urgentAccent = (s: StaffPersonnelWarningSeverity): [string, string] => {
  switch (s) {
    case 'verbal':
      return ['#9a3412', '#451a03'];
    case 'written':
      return ['#b91c1c', '#450a0a'];
    case 'severe':
      return ['#7f1d1d', '#1c1917'];
    case 'final':
      return ['#0c0a09', '#450a0a'];
    default:
      return ['#991b1b', '#18181b'];
  }
};

function parseImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

export function PersonnelWarningGate({
  staffId,
  subjectDisplayName,
}: {
  staffId: string;
  subjectDisplayName?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<WarningRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [ackNote, setAckNote] = useState('');

  const loadQueue = useCallback(async () => {
    const { data, error } = await supabase
      .from('staff_personnel_warnings')
      .select('id, severity, subject_line, body, created_at, issued_by_staff_id, image_urls')
      .eq('subject_staff_id', staffId)
      .is('acknowledged_at', null)
      .in('severity', STAFF_WARNING_GATE_SEVERITIES);
    if (error) {
      setQueue([]);
      return;
    }
    const rows = (data ?? []) as WarningRow[];
    setQueue(sortWarningsByUrgency(rows));
  }, [staffId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    const channel = supabase
      .channel(`personnel_warnings_gate_${staffId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff_personnel_warnings',
          filter: `subject_staff_id=eq.${staffId}`,
        },
        () => {
          loadQueue();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staffId, loadQueue]);

  const current = queue[0];

  useEffect(() => {
    setAckNote('');
  }, [current?.id]);

  useEffect(() => {
    if (!current) return;
    if (current.severity === 'severe' || current.severity === 'final') {
      if (Platform.OS === 'android') {
        Vibration.vibrate([0, 220, 120, 220]);
      } else {
        Vibration.vibrate();
      }
    }
  }, [current]);

  const acknowledge = async () => {
    if (!current || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('acknowledge_staff_personnel_warning', {
        p_warning_id: current.id,
        p_acknowledgement_note: ackNote.trim() || null,
      });
      if (error) {
        setBusy(false);
        return;
      }
      const ok = data === true;
      if (!ok) {
        await loadQueue();
        setBusy(false);
        return;
      }

      const issuerId = current.issued_by_staff_id;
      if (issuerId && issuerId !== staffId) {
        const subj = subjectDisplayName?.trim() || 'Personel';
        const sev = SEVERITY_LABEL_TR[current.severity];
        let body = `${subj} uyarıyı okudu ve onayladı. (${sev})`;
        const note = ackNote.trim();
        if (note) {
          const rest = 320 - body.length;
          body += rest > 20 ? ` Personel notu: ${note.slice(0, Math.min(note.length, rest - 18))}` : '';
        }
        const titleLine = current.subject_line?.trim();
        await sendNotification({
          staffId: issuerId,
          title: titleLine ? `Uyarı onaylandı: ${titleLine.slice(0, 60)}` : 'Resmi uyarı okundu ve onaylandı',
          body: body.length > 380 ? `${body.slice(0, 377)}…` : body,
          notificationType: 'staff_personnel_warning_ack',
          category: 'admin',
          data: {
            warningId: current.id,
            subjectStaffId: staffId,
          },
          createdByStaffId: staffId,
        });
      }

      await loadQueue();
    } finally {
      setBusy(false);
    }
  };

  if (!current) return null;

  const [g0, g1] = urgentAccent(current.severity);
  const title =
    current.subject_line?.trim() ||
    (current.severity === 'final'
      ? 'Son uyarı — iş ilişiği riski'
      : current.severity === 'severe'
        ? 'Ciddi disiplin uyarısı'
        : current.severity === 'written'
          ? 'Yazılı uyarı kaydı'
          : 'Sözlü uyarı kaydı');

  const images = parseImageUrls(current.image_urls);
  const useSplit = images.length > 0 && SCREEN_W >= 380;

  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={() => {}}>
      <LinearGradient colors={[g0, g1]} style={styles.gradient}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.iconCircle}>
            <Ionicons name="alert-circle" size={44} color="#fecaca" />
          </View>
          <Text style={styles.kicker}>YÖNETİM UYARISI</Text>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{SEVERITY_LABEL_TR[current.severity]}</Text>
            </View>
            <Text style={styles.dateText}>{new Date(current.created_at).toLocaleString('tr-TR')}</Text>
          </View>
          <Text style={styles.severityExpl}>{SEVERITY_DESC_TR[current.severity]}</Text>

          {useSplit ? (
            <View style={styles.splitRow}>
              <View style={styles.splitVisual}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.heroScroll}
                  contentContainerStyle={styles.heroScrollInner}
                >
                  {images.map((uri) => (
                    <View key={uri} style={[styles.heroPage, { width: Math.min(SCREEN_W * 0.44, 200) }]}>
                      <CachedImage uri={uri} style={styles.heroImg} contentFit="cover" />
                    </View>
                  ))}
                </ScrollView>
                {images.length > 1 ? (
                  <Text style={styles.heroHint}>{images.length} görsel — kaydırın</Text>
                ) : null}
              </View>
              <View style={styles.splitTextShell}>
                <View style={styles.bodyCard}>
                  <Text style={styles.bodyLabel}>Uyarı metni</Text>
                  <Text style={styles.bodyText}>{current.body.trim()}</Text>
                </View>
              </View>
            </View>
          ) : (
            <>
              {images.length > 0 ? (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.topHeroScroll}
                  contentContainerStyle={styles.topHeroInner}
                >
                  {images.map((uri) => (
                    <View key={uri} style={[styles.topHeroPage, { width: SCREEN_W - 44 }]}>
                      <CachedImage uri={uri} style={styles.topHeroImg} contentFit="cover" />
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              <View style={styles.bodyCard}>
                <Text style={styles.bodyLabel}>Uyarı metni</Text>
                <Text style={styles.bodyText}>{current.body.trim()}</Text>
              </View>
            </>
          )}

          <Text style={styles.footerWarn}>
            Bu metin disiplin ve İK süreçlerinde delil olarak kayıt altındadır. Okuduğunuzu ve ciddiyetini anladığınızı
            beyan edersiniz.
          </Text>

          <View style={styles.noteBlock}>
            <Text style={styles.noteLabel}>İsteğe bağlı kısa not (yöneticiye gider)</Text>
            <TextInput
              style={styles.noteInput}
              value={ackNote}
              onChangeText={setAckNote}
              placeholder="Örn. Anladım, tekrarlanmayacak."
              placeholderTextColor="rgba(255,255,255,0.45)"
              maxLength={500}
              multiline
            />
          </View>

          {queue.length > 1 ? (
            <Text style={styles.queueHint}>Bekleyen başka uyarı: {queue.length - 1}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.cta, busy && styles.ctaDisabled]}
            onPress={acknowledge}
            disabled={busy}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaText}>Okudum — sorumluluğu anlıyorum</Text>
          </TouchableOpacity>
        </ScrollView>
      </LinearGradient>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { paddingHorizontal: 22, flexGrow: 1 },
  iconCircle: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'rgba(254,202,202,0.45)',
  },
  kicker: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 3,
    color: '#fecaca',
    textAlign: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 23,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(254,202,202,0.5)',
  },
  badgeText: { color: '#fecaca', fontWeight: '700', fontSize: 13 },
  dateText: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  severityExpl: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    marginBottom: 14,
  },
  splitVisual: {
    width: '44%',
    maxWidth: 200,
  },
  heroScroll: { maxHeight: 220 },
  heroScrollInner: { paddingRight: 8 },
  heroPage: {
    height: 200,
    marginRight: 10,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroImg: { width: '100%', height: '100%' },
  heroHint: {
    marginTop: 6,
    fontSize: 11,
    color: 'rgba(254,226,226,0.85)',
    textAlign: 'center',
  },
  splitTextShell: { flex: 1, minWidth: 0 },
  topHeroScroll: { marginBottom: 14, marginHorizontal: -4 },
  topHeroInner: { paddingHorizontal: 4 },
  topHeroPage: {
    height: 200,
    marginRight: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  topHeroImg: { width: '100%', height: '100%' },
  bodyCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: 14,
  },
  bodyLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: 'rgba(254,226,226,0.75)',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  bodyText: {
    color: '#fff',
    fontSize: 16,
    lineHeight: 25,
    fontWeight: '600',
  },
  footerWarn: {
    color: 'rgba(254,226,226,0.9)',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 12,
  },
  noteBlock: {
    backgroundColor: 'rgba(0,0,0,0.28)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 8,
  },
  noteInput: {
    minHeight: 56,
    maxHeight: 100,
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  queueHint: {
    color: '#fecaca',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 10,
  },
  cta: {
    backgroundColor: '#fff',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { fontSize: 16, fontWeight: '800', color: '#450a0a' },
});
