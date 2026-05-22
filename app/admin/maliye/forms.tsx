import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { supabase } from '@/lib/supabase';

type AcceptanceRow = {
  id: string;
  accepted_at: string;
  contract_lang: string | null;
  token: string;
  guests: {
    full_name: string | null;
    phone: string | null;
    rooms: { room_number: string | null } | null;
  } | null;
};

export default function AdminMaliyeForms() {
  const [date, setDate] = useState('');
  const [month, setMonth] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<AcceptanceRow[]>([]);
  const [latest, setLatest] = useState<AcceptanceRow | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from('contract_acceptances')
      .select(
        'id, accepted_at, contract_lang, token, guests(full_name, phone, rooms(room_number))'
      )
      .order('accepted_at', { ascending: false })
      .limit(500);

    if (date.trim()) {
      q = q
        .gte('accepted_at', `${date.trim()}T00:00:00.000Z`)
        .lte('accepted_at', `${date.trim()}T23:59:59.999Z`);
    } else if (month.trim()) {
      const from = `${month.trim()}-01T00:00:00.000Z`;
      const toDate = new Date(from);
      toDate.setUTCMonth(toDate.getUTCMonth() + 1);
      q = q.gte('accepted_at', from).lt('accepted_at', toDate.toISOString());
    }

    const { data, error } = await q;
    setLoading(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    const list = (data as AcceptanceRow[]) ?? [];
    setRows(list);
    setLatest(list[0] ?? null);
  }, [date, month]);

  const loadLatestOnly = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('contract_acceptances')
      .select(
        'id, accepted_at, contract_lang, token, guests(full_name, phone, rooms(room_number))'
      )
      .order('accepted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    setLoading(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    const row = (data as AcceptanceRow | null) ?? null;
    setLatest(row);
    setRows(row ? [row] : []);
  }, []);

  const formatRow = (item: AcceptanceRow) => {
    const name = item.guests?.full_name ?? 'İsimsiz';
    const room = item.guests?.rooms?.room_number ?? '-';
    const when = new Date(item.accepted_at).toLocaleString('tr-TR');
    const lang = (item.contract_lang ?? 'tr').toUpperCase();
    return { name, room, when, lang };
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Günlük müşteri formları (sözleşme onayları)</Text>
      <Text style={styles.sub}>
        Canlı veritabanı: contract_acceptances + misafir + oda. Denetim portalındaki formlar da aynı kaynaktan gelir.
      </Text>
      <View style={styles.filterRow}>
        <TextInput style={styles.input} value={date} onChangeText={setDate} placeholder="Gün (YYYY-MM-DD)" />
        <TextInput style={styles.input} value={month} onChangeText={setMonth} placeholder="Ay (YYYY-MM)" />
        <TouchableOpacity style={styles.btn} onPress={() => void load()}>
          <Text style={styles.btnText}>Kayıtları getir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnAlt]} onPress={() => void loadLatestOnly()}>
          <Text style={styles.btnText}>Son onay</Text>
        </TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator style={{ marginTop: 20 }} color="#1d4ed8" /> : null}
      {latest ? (
        <Text style={styles.latest}>
          Son onay: {formatRow(latest).name} · Oda {formatRow(latest).room} · {formatRow(latest).when}
        </Text>
      ) : null}
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => {
          const f = formatRow(item);
          return (
            <View style={styles.card}>
              <Text style={styles.name}>{f.name}</Text>
              <Text style={styles.meta}>
                {f.when} · Oda {f.room} · Dil {f.lang}
              </Text>
              <Text style={styles.metaSmall}>Token: {item.token}</Text>
            </View>
          );
        }}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Kayıt yok. Tarih filtresi veya sözleşme onayı bekleyin.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 14 },
  title: { fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  sub: { color: '#64748b', lineHeight: 20, marginBottom: 10, fontSize: 13 },
  filterRow: { gap: 8, marginBottom: 10 },
  input: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', padding: 10 },
  btn: { backgroundColor: '#1d4ed8', borderRadius: 8, padding: 11, alignItems: 'center' },
  btnAlt: { backgroundColor: '#0f766e' },
  btnText: { color: '#fff', fontWeight: '700' },
  latest: { color: '#0f766e', marginBottom: 8, fontWeight: '600' },
  card: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', padding: 10, marginBottom: 8 },
  name: { fontWeight: '700', color: '#0f172a' },
  meta: { color: '#64748b', marginTop: 3 },
  metaSmall: { color: '#94a3b8', marginTop: 4, fontSize: 11 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 24 },
});
