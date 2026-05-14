import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { apiGet, apiPost } from '@/lib/kbsApi';
import { useKbsMrzBatchStore } from '@/stores/kbsMrzBatchStore';

type RoomRow = { id: string; room_number: string | null; floor: number | null };
type DocRow = {
  id: string;
  guest_id: string;
  scan_status: string;
  document_type: string | null;
  document_number: string | null;
  kbs_person_kind: string | null;
  usage_kind: string | null;
  mrz_batch_key: string | null;
  guest: { full_name: string | null; first_name: string | null; last_name: string | null } | null;
};

export default function KbsBatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ batchKey?: string }>();
  const storeKey = useKbsMrzBatchStore((s) => s.batchKey);
  const resetSession = useKbsMrzBatchStore((s) => s.resetSession);
  const startSession = useKbsMrzBatchStore((s) => s.startSession);

  const batchKey = (typeof params.batchKey === 'string' && params.batchKey) || storeKey;

  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!batchKey) {
      setDocs([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [dRes, rRes] = await Promise.all([
        apiGet<DocRow[]>(`/documents/batch/${batchKey}`),
        apiGet<RoomRow[]>('/rooms'),
      ]);
      if (dRes.ok) setDocs(dRes.data ?? []);
      else Alert.alert('Liste', dRes.error.message);
      if (rRes.ok) {
        const r = rRes.data ?? [];
        setRooms(r);
        setRoomId((prev) => prev ?? (r[0]?.id ?? null));
      }
    } finally {
      setLoading(false);
    }
  }, [batchKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const roomOptions = useMemo(() => rooms.map((r) => ({ id: r.id, label: r.room_number ? `Oda ${r.room_number}` : r.id })), [rooms]);

  const assignAllAndReady = useCallback(async () => {
    if (!batchKey || !roomId) {
      Alert.alert('Eksik', 'Önce oda seçin.');
      return;
    }
    const toAssign = docs.filter((d) => d.scan_status === 'scanned' || d.scan_status === 'ready_to_submit');
    const toMarkIds = docs.filter((d) => d.scan_status === 'scanned').map((d) => d.id);
    if (!toAssign.length) {
      Alert.alert('Boş', 'Bu partide kayıt yok veya hepsi zaten işlendi.');
      return;
    }
    setBusy(true);
    try {
      for (const d of toAssign) {
        const a = await apiPost<{ id: string }>('/stay/assign-room', { guestDocumentId: d.id, roomId });
        if (!a.ok) {
          Alert.alert('Oda atama', a.error.message);
          return;
        }
      }
      if (!toMarkIds.length) {
        Alert.alert('Tamam', 'Oda atamaları güncellendi; zaten bildirime hazır kayıtlar var.');
        await load();
        return;
      }
      const m = await apiPost<{ updated: number }>('/documents/mark-ready', {
        guestDocumentIds: toMarkIds,
      });
      if (!m.ok) {
        Alert.alert('Hazır işareti', m.error.message);
        return;
      }
      Alert.alert('Tamam', `${toAssign.length} kişi için oda atandı; ${toMarkIds.length} kayıt bildirime hazırlandı.`, [
        { text: 'Hazır listesi', onPress: () => router.replace('/staff/kbs/ready' as never) },
        { text: 'Kapat', style: 'cancel', onPress: () => void load() },
      ]);
    } finally {
      setBusy(false);
    }
  }, [batchKey, docs, roomId, router, load]);

  const newParty = useCallback(() => {
    resetSession();
    const k = startSession();
    router.replace({ pathname: '/staff/kbs/batch', params: { batchKey: k } } as never);
  }, [resetSession, startSession, router]);

  if (!batchKey) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.muted}>Parti anahtarı yok. MRZ ekranından tarama yapın veya yeni parti başlatın.</Text>
        <TouchableOpacity style={styles.primaryBtn} onPress={() => { startSession(); router.replace('/staff/kbs/scan' as never); }}>
          <Text style={styles.primaryBtnText}>MRZ taramaya git</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <Text style={styles.title}>Parti özeti</Text>
      <Text style={styles.sub}>Aynı grupta sırayla okunan MRZ kayıtları. Odayı seçip hepsine atayın; ardından bildirime hazır işaretlenir.</Text>
      <Text style={styles.mono}>Parti ID: {batchKey}</Text>

      <View style={styles.row}>
        <Text style={styles.label}>Oda</Text>
        <View style={styles.chips}>
          {roomOptions.map((o) => (
            <TouchableOpacity
              key={o.id}
              style={[styles.chip, roomId === o.id && styles.chipOn]}
              onPress={() => setRoomId(o.id)}
            >
              <Text style={[styles.chipText, roomId === o.id && styles.chipTextOn]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, (!roomId || busy) && { opacity: 0.6 }]}
        disabled={!roomId || busy}
        onPress={() => void assignAllAndReady()}
      >
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Oda ata ve bildirime hazırla</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.ghostBtn} onPress={() => void load()} disabled={loading}>
        <Text style={styles.ghostBtnText}>Listeyi yenile</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.ghostBtn} onPress={newParty}>
        <Text style={styles.ghostBtnText}>Yeni parti başlat</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={theme.colors.primary} />
      ) : (
        <FlatList
          data={docs}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}
          ListEmptyComponent={<Text style={styles.muted}>Bu partide henüz kayıt yok (Beklet ile sıraya ekleyin).</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {item.guest?.first_name || item.guest?.last_name
                  ? [item.guest?.first_name, item.guest?.last_name].filter(Boolean).join(' ')
                  : item.guest?.full_name ?? '—'}
              </Text>
              <Text style={styles.cardLine}>Belge: {item.document_type ?? '—'} · {item.document_number ?? '—'}</Text>
              <Text style={styles.cardLine}>Tür: {item.kbs_person_kind ?? '—'} · Kullanım: {item.usage_kind ?? '—'}</Text>
              <Text style={styles.badge}>{item.scan_status}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', padding: 24 },
  title: { fontSize: 22, fontWeight: '900', color: theme.colors.text },
  sub: { marginTop: 8, color: theme.colors.textSecondary, lineHeight: 20, fontSize: 14 },
  mono: { marginTop: 8, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 11, color: theme.colors.textSecondary },
  row: { marginTop: 16, gap: 8 },
  label: { fontWeight: '800', color: theme.colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontWeight: '700', color: theme.colors.text, fontSize: 13 },
  chipTextOn: { color: '#fff' },
  primaryBtn: {
    marginTop: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  ghostBtn: { marginTop: 10, alignItems: 'center', paddingVertical: 8 },
  ghostBtnText: { color: theme.colors.primary, fontWeight: '800' },
  muted: { color: theme.colors.textSecondary, marginTop: 8 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardTitle: { fontWeight: '900', fontSize: 16, color: theme.colors.text },
  cardLine: { marginTop: 4, color: theme.colors.textSecondary, fontSize: 13 },
  badge: { marginTop: 8, alignSelf: 'flex-start', fontWeight: '800', fontSize: 12, color: theme.colors.primary },
});
