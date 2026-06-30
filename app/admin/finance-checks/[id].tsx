import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { pickGalleryImages } from '@/lib/galleryPicker';
import {
  CHECK_STATUS_LABELS,
  fmtMoneyTry,
  CHECK_DIRECTION_LABELS,
  type FinanceCheckStatus,
  type FinanceCheckDirection,
} from '@/lib/finance';
import { formatDateShort } from '@/lib/date';
import { LinearGradient } from 'expo-linear-gradient';
import { CHECK_DIR_META, checkStatusTone, daysUntilDue, dueUrgencyLabel } from '@/lib/financeCheckTheme';
import { FinanceCheckQuickStatusButtons } from '@/components/financeChecks/FinanceCheckQuickStatusButtons';
import { FinanceCheckPreviewCard } from '@/components/financeChecks/FinanceCheckPreviewCard';
import { FinanceCheckExportButtons } from '@/components/financeChecks/FinanceCheckExportButtons';
import { ImageLightboxModal } from '@/components/admin/ImageLightboxModal';
import {
  financeCheckPdfInputFromPreview,
  type FinanceCheckPdfInput,
} from '@/lib/financeCheckPdf';

type Row = {
  id: string;
  direction: FinanceCheckDirection;
  counterparty_name: string;
  amount: number;
  status: FinanceCheckStatus;
  check_number: string | null;
  bank_name: string | null;
  branch_name: string | null;
  issue_date: string | null;
  due_date: string | null;
  purpose: string | null;
  notes: string | null;
  image_urls: string[] | unknown;
  organizationName?: string;
};

type LinkedPayment = {
  id: string;
  amount: number;
  paid_at: string;
  notes: string | null;
  debt_entry_id: string;
  debt_description: string;
};

const STATUSES: FinanceCheckStatus[] = [
  'draft',
  'registered',
  'presented',
  'partial',
  'paid',
  'bounced',
  'cancelled',
];

function statusIcon(s: FinanceCheckStatus) {
  switch (s) {
    case 'paid':
      return 'checkmark-circle';
    case 'partial':
      return 'pie-chart-outline';
    case 'presented':
      return 'swap-horizontal-outline';
    case 'bounced':
      return 'close-circle';
    case 'cancelled':
      return 'ban-outline';
    case 'draft':
      return 'document-text-outline';
    default:
      return 'bookmark-outline';
  }
}

export default function AdminFinanceCheckDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const me = useAuthStore((s) => s.staff);
  const [row, setRow] = useState<Row | null>(null);
  const [linkedPayments, setLinkedPayments] = useState<LinkedPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<FinanceCheckStatus>('registered');
  const [notes, setNotes] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [purpose, setPurpose] = useState('');
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('finance_checks')
      .select('*, organizations(name)')
      .eq('id', id)
      .single();
    if (error || !data) {
      setLoading(false);
      Alert.alert('Hata', error?.message ?? 'Bulunamadı');
      setRow(null);
      return;
    }
    const r = data as Row & { organizations?: { name?: string } | null };
    setRow(r);
    setStatus(r.status);
    setNotes(r.notes ?? '');
    setCounterparty(r.counterparty_name);
    setPurpose(r.purpose ?? '');
    const imgs = Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [];
    setImageUrls(imgs);

    const { data: payLinks } = await supabase
      .from('staff_debt_payments')
      .select('id, amount, paid_at, notes, debt_entry_id')
      .eq('finance_check_id', id)
      .order('paid_at', { ascending: false });

    const rows = payLinks ?? [];
    const entryIds = [...new Set(rows.map((p) => p.debt_entry_id))];
    let descMap: Record<string, string> = {};
    if (entryIds.length > 0) {
      const { data: entries } = await supabase.from('staff_debt_entries').select('id, description').in('id', entryIds);
      for (const e of entries ?? []) {
        descMap[e.id as string] = (e.description as string) ?? '';
      }
    }
    setLinkedPayments(
      rows.map((p) => ({
        id: p.id as string,
        amount: Number(p.amount),
        paid_at: p.paid_at as string,
        notes: (p.notes as string | null) ?? null,
        debt_entry_id: p.debt_entry_id as string,
        debt_description: descMap[p.debt_entry_id as string] ?? '',
      })),
    );

    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const persist = async (patch: Record<string, unknown>) => {
    if (!id || !me?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from('finance_checks')
      .update({ ...patch, updated_by_staff_id: me.id })
      .eq('id', id);
    setSaving(false);
    if (error) Alert.alert('Kayıt', error.message);
    else await load();
  };

  const addImage = async (uri: string) => {
    setUploading(true);
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'finance-checks',
        uri,
        subfolder: 'check',
      });
      const next = [...imageUrls, publicUrl];
      setImageUrls(next);
      await persist({ image_urls: next });
    } catch (e) {
      Alert.alert('Yükleme', (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const removeAdmin = () => {
    Alert.alert('Sil', 'Çek kaydı silinsin mi?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          if (!id) return;
          const { error } = await supabase.from('finance_checks').delete().eq('id', id);
          if (error) Alert.alert('Hata', error.message);
          else router.back();
        },
      },
    ]);
  };

  if (loading || !row) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  const linkedTotal = linkedPayments.reduce((a, p) => a + p.amount, 0);
  const dirMeta = CHECK_DIR_META[row.direction];
  const dueDays = daysUntilDue(row.due_date);
  const urgency = dueUrgencyLabel(dueDays);
  const exportData: FinanceCheckPdfInput = financeCheckPdfInputFromPreview(
    {
      direction: row.direction,
      counterparty_name: row.counterparty_name,
      amount: Number(row.amount),
      status,
      check_number: row.check_number,
      bank_name: row.bank_name,
      branch_name: row.branch_name,
      issue_date: row.issue_date,
      due_date: row.due_date,
      purpose: purpose || row.purpose,
      notes: notes || row.notes,
      image_urls: imageUrls,
    },
    { id: String(id), organizationName: (row as Row & { organizations?: { name?: string } }).organizations?.name },
  );

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <LinearGradient colors={dirMeta.gradient} style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroBadge}>
            <Ionicons name={dirMeta.icon} size={18} color="#fff" />
            <Text style={styles.heroBadgeText}>{CHECK_DIRECTION_LABELS[row.direction]}</Text>
          </View>
          <View style={[styles.statusHeroPill, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={styles.statusHeroText}>{CHECK_STATUS_LABELS[status]}</Text>
          </View>
          {saving ? <ActivityIndicator size="small" color="#fff" /> : null}
        </View>
        <Text style={styles.heroAmount}>{fmtMoneyTry(Number(row.amount))}</Text>
        <Text style={styles.heroCp}>{row.counterparty_name}</Text>
        <View style={styles.heroMetaRow}>
          <Ionicons name="calendar-outline" size={14} color="rgba(255,255,255,0.8)" />
          <Text style={styles.heroMeta}>
            Düzenleme {formatDateShort(row.issue_date)} · Vade {row.due_date ? formatDateShort(row.due_date) : '—'}
          </Text>
        </View>
        {urgency && status !== 'paid' && status !== 'cancelled' ? (
          <View style={styles.urgencyPill}>
            <Ionicons name="time-outline" size={13} color="#fff" />
            <Text style={styles.urgencyText}>{urgency}</Text>
          </View>
        ) : null}
        {(row.check_number || row.bank_name || row.branch_name) && (
          <View style={styles.bankBox}>
            {row.check_number ? (
              <Text style={styles.bankLine}>
                <Text style={styles.bankKey}>Çek no: </Text>
                {row.check_number}
              </Text>
            ) : null}
            {row.bank_name ? (
              <Text style={styles.bankLine}>
                <Text style={styles.bankKey}>Banka: </Text>
                {row.bank_name}
                {row.branch_name ? ` · ${row.branch_name}` : ''}
              </Text>
            ) : null}
          </View>
        )}
      </LinearGradient>

      <View style={styles.heroActions}>
        <TouchableOpacity
          style={styles.heroActionBtn}
          onPress={() => router.push({ pathname: '/admin/finance-checks/preview/[id]', params: { id: String(id) } } as never)}
          activeOpacity={0.9}
        >
          <Ionicons name="eye-outline" size={18} color={adminTheme.colors.primary} />
          <Text style={styles.heroActionText}>Önizleme</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.heroActionBtn, styles.heroActionBtnPrimary]}
          onPress={() => router.push({ pathname: '/admin/finance-checks/edit/[id]', params: { id: String(id) } } as never)}
          activeOpacity={0.9}
        >
          <Ionicons name="create-outline" size={18} color="#fff" />
          <Text style={[styles.heroActionText, styles.heroActionTextOn]}>Düzenle</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.exportWrap}>
        <FinanceCheckExportButtons data={exportData} disabled={saving} />
      </View>

      <AdminCard style={styles.previewCard} padded={false}>
        <FinanceCheckPreviewCard
          data={{
            direction: row.direction,
            counterparty_name: row.counterparty_name,
            amount: Number(row.amount),
            status,
            check_number: row.check_number,
            bank_name: row.bank_name,
            branch_name: row.branch_name,
            issue_date: row.issue_date,
            due_date: row.due_date,
            purpose: purpose || row.purpose,
            notes: notes || row.notes,
            image_urls: imageUrls,
          }}
          onImagePress={setLightbox}
        />
      </AdminCard>

      <AdminCard>
        <Text style={styles.sectionTitle}>Durum işaretle</Text>
        <Text style={styles.sectionHint}>
          Çek deftere girildiğinde «Çek girildi», bankadan tahsil/ödeme olduğunda «Ödendi», karşılıksız veya
          ödenmediğinde «Ödenmedi» seçin. Borç ödemesine bağlanırsa tutar otomatik güncellenir.
        </Text>
        <FinanceCheckQuickStatusButtons
          status={status}
          saving={saving}
          onSelect={(s) => {
            setStatus(s);
            void persist({ status: s });
          }}
        />
        <Text style={styles.advancedLabel}>Diğer durumlar</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.statusStrip}>
          {STATUSES.filter((s) => s !== 'registered' && s !== 'paid' && s !== 'bounced').map((s) => (
            <TouchableOpacity
              key={s}
              style={[
                styles.statusChip,
                status === s && styles.statusChipOn,
                status === s && { backgroundColor: checkStatusTone(s).color, borderColor: checkStatusTone(s).color },
              ]}
              onPress={() => {
                setStatus(s);
                void persist({ status: s });
              }}
            >
              <Ionicons name={statusIcon(s)} size={16} color={status === s ? '#fff' : adminTheme.colors.textSecondary} />
              <Text style={[styles.statusChipText, status === s && styles.statusChipTextOn]} numberOfLines={2}>
                {CHECK_STATUS_LABELS[s]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </AdminCard>

      <AdminCard>
        <Text style={styles.sectionTitle}>Karşı taraf ve amaç</Text>
        <Text style={styles.label}>Karşı taraf</Text>
        <TextInput
          style={styles.input}
          value={counterparty}
          onChangeText={setCounterparty}
          onBlur={() => void persist({ counterparty_name: counterparty.trim() })}
        />
        <Text style={styles.label}>Amaç</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={purpose}
          onChangeText={setPurpose}
          multiline
          onBlur={() => void persist({ purpose: purpose.trim() || null })}
        />
        <Text style={styles.label}>Notlar</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={notes}
          onChangeText={setNotes}
          multiline
          onBlur={() => void persist({ notes: notes.trim() || null })}
        />
      </AdminCard>

      <AdminCard>
        <Text style={styles.sectionTitle}>Borç ödemeleriyle bağlantı</Text>
        {linkedPayments.length === 0 ? (
          <Text style={styles.emptyLink}>Bu çeke henüz borç/alacak ödemesi bağlanmamış.</Text>
        ) : (
          <>
            <Text style={styles.linkedSum}>
              Bağlı ödemeler toplamı: {fmtMoneyTry(linkedTotal)}
              {Number(row.amount) > 0 ? ` / çek ${fmtMoneyTry(Number(row.amount))}` : ''}
            </Text>
            {linkedPayments.map((p) => (
              <View key={p.id} style={styles.linkedRow}>
                <Text style={styles.linkedAmt}>{fmtMoneyTry(p.amount)}</Text>
                <Text style={styles.linkedMeta}>{formatDateShort(p.paid_at)}</Text>
                {p.debt_description ? (
                  <Text style={styles.linkedDesc} numberOfLines={2}>
                    {p.debt_description}
                  </Text>
                ) : null}
                {p.notes ? (
                  <Text style={styles.linkedNote} numberOfLines={2}>
                    {p.notes}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        )}
      </AdminCard>

      <AdminCard>
        <Text style={styles.sectionTitle}>Görseller</Text>
        <View style={styles.imgRow}>
          <TouchableOpacity
            style={styles.imgBtn}
            onPress={async () => {
              const ok = await ensureCameraPermission({ title: 'Kamera', message: '', settingsMessage: '' });
              if (!ok) return;
              const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.75 });
              if (!r.canceled && r.assets[0]?.uri) await addImage(r.assets[0].uri);
            }}
            disabled={uploading}
          >
            <Ionicons name="camera-outline" size={20} color={adminTheme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.imgBtn}
            onPress={async () => {
              const uris = await pickGalleryImages({ quality: 0.75, selectionLimit: 8 });
              for (const uri of uris) await addImage(uri);
            }}
            disabled={uploading}
          >
            <Ionicons name="images-outline" size={20} color={adminTheme.colors.primary} />
          </TouchableOpacity>
        </View>
        {uploading ? <ActivityIndicator /> : null}
        <View style={styles.thumbs}>
          {imageUrls.map((u) => (
            <TouchableOpacity key={u} onPress={() => setLightbox(u)}>
              <Image source={{ uri: u }} style={styles.thumb} />
            </TouchableOpacity>
          ))}
        </View>
      </AdminCard>

      <ImageLightboxModal visible={!!lightbox} uri={lightbox} onClose={() => setLightbox(null)} />

      {me?.role === 'admin' ? (
        <TouchableOpacity style={styles.delBtn} onPress={removeAdmin} disabled={saving}>
          <Text style={styles.delText}>Kaydı sil (yönetici)</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  heroCard: { borderRadius: 16, padding: 16, marginBottom: 4 },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  heroBadgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  statusHeroPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  statusHeroText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroAmount: { fontSize: 30, fontWeight: '800', color: '#fff', marginTop: 14 },
  heroCp: { fontSize: 17, fontWeight: '700', color: '#fff', marginTop: 6 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  heroMeta: { fontSize: 13, color: 'rgba(255,255,255,0.85)' },
  urgencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  urgencyText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  bankBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bankLine: { fontSize: 13, color: '#fff', marginBottom: 4 },
  bankKey: { fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  heroActions: { flexDirection: 'row', gap: 10, marginTop: 12, marginBottom: 8 },
  heroActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  heroActionBtnPrimary: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  heroActionText: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.primary },
  heroActionTextOn: { color: '#fff' },
  exportWrap: { marginBottom: 12 },
  previewCard: { padding: 0, overflow: 'hidden', marginBottom: 4 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 6 },
  sectionHint: { fontSize: 12, color: adminTheme.colors.textMuted, lineHeight: 17, marginBottom: 12 },
  advancedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  statusStrip: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  statusChip: {
    width: 112,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  statusChipOn: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  statusChipText: { fontSize: 11, color: adminTheme.colors.textSecondary, textAlign: 'center', fontWeight: '600' },
  statusChipTextOn: { color: '#fff' },
  label: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 6, marginTop: 10 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
  },
  multiline: { minHeight: 64, textAlignVertical: 'top' },
  emptyLink: { fontSize: 14, color: adminTheme.colors.textMuted },
  linkedSum: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 10 },
  linkedRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  linkedAmt: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  linkedMeta: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  linkedDesc: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 4 },
  linkedNote: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 4, fontStyle: 'italic' },
  imgRow: { flexDirection: 'row', gap: 12 },
  imgBtn: { padding: 10, borderWidth: 1, borderColor: adminTheme.colors.border, borderRadius: 10 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  thumb: { width: 88, height: 88, borderRadius: 8 },
  delBtn: { marginTop: 16, padding: 14, alignItems: 'center' },
  delText: { color: adminTheme.colors.error, fontWeight: '600' },
});
