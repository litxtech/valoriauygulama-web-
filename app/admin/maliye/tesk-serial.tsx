import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMaliyeTeskSerial, setMaliyeTeskSerial } from '@/lib/maliyeAccess';

function fmtTrDate(ymd: string | null): string {
  if (!ymd) return '—';
  const p = ymd.split('-');
  if (p.length !== 3) return ymd;
  return `${p[2]}.${p[1]}.${p[0]}`;
}

export default function AdminMaliyeTeskSerial() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [seri, setSeri] = useState('A');
  const [startSira, setStartSira] = useState('1');
  const [perPage, setPerPage] = useState('14');
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await getMaliyeTeskSerial();
      if (data) {
        setSeri(String(data.seri ?? 'A'));
        setStartSira(String(data.start_sira ?? 1));
        setPerPage(String(data.per_page ?? 14));
        setAnchorDate(data.anchor_date ?? null);
        setUpdatedAt(data.updated_at ?? null);
      }
    } catch (e) {
      // sessiz
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    const siraNum = parseInt(startSira, 10);
    if (Number.isNaN(siraNum) || siraNum < 0) {
      Alert.alert('Geçersiz', 'Başlangıç sıra numarası geçerli bir sayı olmalı.');
      return;
    }
    const perNum = parseInt(perPage, 10) || 14;
    setSaving(true);
    try {
      const { error } = await setMaliyeTeskSerial((seri || 'A').trim(), siraNum, perNum);
      if (error) throw new Error(error.message);
      Alert.alert(
        'Kaydedildi',
        `Seri ${(seri || 'A').trim()} · Sıra No bugünden itibaren ${siraNum} olarak başlayacak, her gün 1 artacak.`
      );
      await load();
    } catch (e: any) {
      Alert.alert('Hata', e?.message || 'Kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  const currentToday = (() => {
    if (anchorDate == null) return startSira;
    const anchor = Date.parse(`${anchorDate}T00:00:00Z`);
    const today = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
    if (Number.isNaN(anchor) || Number.isNaN(today)) return startSira;
    const diff = Math.floor((today - anchor) / (24 * 60 * 60 * 1000));
    return String(Math.max(parseInt(startSira, 10) || 0, (parseInt(startSira, 10) || 0) + diff));
  })();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Günlük Müşteri Listesi — Seri / Sıra No</Text>
      <Text style={styles.sub}>
        TESK "Günlük Müşteri Listesi" formundaki Seri ve Sıra No numaralarını yönetin. Girdiğiniz numara bugünden
        itibaren geçerli olur ve her gün için otomatik 1 artar. İstediğinizde yeni bir başlangıç girerek numarayı
        sıfırlayabilirsiniz.
      </Text>

      <View style={styles.card}>
        <View style={styles.statusRow}>
          <Ionicons name="pricetag-outline" size={18} color="#1a365d" />
          <Text style={styles.statusText}>
            Bugünkü Sıra No: <Text style={styles.statusStrong}>{currentToday}</Text>
          </Text>
        </View>
        <Text style={styles.metaText}>
          Başlangıç günü: {fmtTrDate(anchorDate)} · Son değişiklik:{' '}
          {updatedAt ? new Date(updatedAt).toLocaleString('tr-TR') : '—'}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Seri</Text>
        <TextInput
          style={styles.input}
          value={seri}
          onChangeText={setSeri}
          autoCapitalize="characters"
          maxLength={4}
          placeholder="A"
        />

        <Text style={styles.label}>Başlangıç Sıra No (bugünden itibaren)</Text>
        <TextInput
          style={styles.input}
          value={startSira}
          onChangeText={setStartSira}
          keyboardType="number-pad"
          placeholder="531532"
        />

        <Text style={styles.label}>Sayfa başına satır (iki sütun toplam)</Text>
        <TextInput
          style={styles.input}
          value={perPage}
          onChangeText={setPerPage}
          keyboardType="number-pad"
          placeholder="14"
        />

        <TouchableOpacity style={[styles.btn, saving && styles.btnDisabled]} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.btnText}>Kaydet / Sıfırla</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <Text style={styles.note}>
        Not: Her gün için tek bir Sıra No üretilir (bir günlük liste = bir form). Numaralar sürekli artar; sıfırlamak
        için yeni bir başlangıç sayısı girip kaydedin.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  sub: { color: '#475569', lineHeight: 20 },
  card: { backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', padding: 16, gap: 8 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusText: { fontSize: 15, color: '#1e293b' },
  statusStrong: { fontWeight: '800', color: '#1a365d' },
  metaText: { fontSize: 12, color: '#64748b' },
  label: { fontSize: 12, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1a365d',
    borderRadius: 10,
    padding: 14,
    marginTop: 12,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  note: { fontSize: 12, color: '#94a3b8', lineHeight: 18 },
});
