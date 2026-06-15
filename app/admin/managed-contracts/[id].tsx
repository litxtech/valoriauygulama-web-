import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import {
  activateContract,
  addContractSignature,
  archiveContract,
  getManagedContractDetail,
  recordContractView,
  submitContractForApproval,
  terminateContract,
} from '@/lib/managedContracts';
import type { ManagedContractDetail } from '@/lib/managedContracts/types';
import { contractStatusMeta, contractTypeLabel } from '@/lib/managedContracts/constants';
import { exportManagedContractPdf } from '@/lib/managedContractPdf';
import { ContractSignatureModal } from '@/components/contracts/ContractSignatureModal';
import { canManageManagedContracts } from '@/lib/staffPermissions';
import { logContractAudit } from '@/lib/managedContracts';

export default function ManagedContractDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { staff } = useAuthStore();
  const canManage = canManageManagedContracts(staff);

  const [detail, setDetail] = useState<ManagedContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signOpen, setSignOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    const { data, error } = await getManagedContractDetail(String(id));
    if (error) Alert.alert('Hata', error.message);
    setDetail(data);
    if (data && staff?.id) {
      await recordContractView(data.contract.id, data.contract.organization_id, staff.id);
    }
    setLoading(false);
  }, [id, staff?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const runPdf = async (action: 'share' | 'print' | 'printer') => {
    if (!detail || !staff?.id) return;
    setPdfBusy(true);
    try {
      await exportManagedContractPdf(detail, action);
      await logContractAudit(
        detail.contract.id,
        detail.contract.organization_id,
        action === 'printer' ? 'printed' : 'downloaded',
        staff.id,
        { action },
      );
    } catch (e) {
      Alert.alert('Hata', (e as Error).message);
    }
    setPdfBusy(false);
  };

  const handleSign = async (result: Parameters<NonNullable<React.ComponentProps<typeof ContractSignatureModal>['onSubmit']>>[0]) => {
    if (!detail || !staff?.id) return;
    const err = await addContractSignature({
      contractId: detail.contract.id,
      orgId: detail.contract.organization_id,
      staffId: staff.id,
      signerName: result.signerName,
      signerTitle: result.signerTitle,
      method: result.method,
      signatureData: result.data,
      versionNo: detail.contract.current_version_no,
    });
    if (err.error) Alert.alert('Hata', err.error.message);
    else {
      Alert.alert('İmza kaydedildi');
      load();
    }
  };

  if (loading && !detail) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.centered}>
        <Text style={styles.muted}>Sözleşme bulunamadı.</Text>
      </View>
    );
  }

  const c = detail.contract;
  const status = contractStatusMeta(c.status);

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headCard}>
          <Text style={styles.number}>{c.contract_number}</Text>
          <Text style={styles.title}>{c.title}</Text>
          <Text style={styles.meta}>
            {contractTypeLabel(c.contract_type)} · v{c.current_version_no}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: `${status.color}20` }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>

        {canManage ? (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => router.push(`/admin/managed-contracts/edit?id=${c.id}` as never)}
          >
            <Ionicons name="create-outline" size={18} color={adminTheme.colors.primary} />
            <Text style={styles.editBtnText}>Düzenle (taraflar, tarih, metin)</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.actionRow}>
          <ActionBtn icon="download-outline" label="PDF" busy={pdfBusy} onPress={() => runPdf('share')} />
          <ActionBtn icon="print-outline" label="Yazdır" busy={pdfBusy} onPress={() => runPdf('print')} />
          <ActionBtn icon="mail-outline" label="Yazıcıya" busy={pdfBusy} onPress={() => runPdf('printer')} />
          <ActionBtn icon="create-outline" label="İmza" onPress={() => setSignOpen(true)} />
        </View>

        {canManage ? (
          <View style={styles.manageRow}>
            {c.status === 'draft' ? (
              <ManageBtn
                label="Onaya gönder"
                onPress={async () => {
                  const e = await submitContractForApproval(c.id, c.organization_id, staff!.id);
                  if (e.error) Alert.alert('Hata', e.error.message);
                  else load();
                }}
              />
            ) : null}
            {c.status === 'pending' ? (
              <ManageBtn
                label="Aktifleştir"
                onPress={async () => {
                  const e = await activateContract(c.id, c.organization_id, staff!.id);
                  if (e.error) Alert.alert('Hata', e.error.message);
                  else load();
                }}
              />
            ) : null}
            {['active', 'pending'].includes(c.status) ? (
              <ManageBtn
                label="Feshet"
                danger
                onPress={() => {
                  Alert.alert('Feshet', 'Bu sözleşmeyi feshetmek istediğinize emin misiniz?', [
                    { text: 'Vazgeç', style: 'cancel' },
                    {
                      text: 'Feshet',
                      style: 'destructive',
                      onPress: async () => {
                        const e = await terminateContract(c.id, c.organization_id, staff!.id, 'Yönetici tarafından feshedildi');
                        if (e.error) Alert.alert('Hata', e.error.message);
                        else load();
                      },
                    },
                  ]);
                }}
              />
            ) : null}
            {c.status !== 'archived' ? (
              <ManageBtn
                label="Arşivle"
                onPress={async () => {
                  const e = await archiveContract(c.id, c.organization_id, staff!.id);
                  if (e.error) Alert.alert('Hata', e.error.message);
                  else load();
                }}
              />
            ) : null}
          </View>
        ) : null}

        <Section title="Taraflar">
          {detail.parties.map((p) => (
            <View key={p.id} style={styles.partyCard}>
              <Text style={styles.partySide}>{p.party_side === 'party_1' ? 'Taraf 1' : 'Taraf 2'} · {p.party_role}</Text>
              {p.company_name ? <Text style={styles.partyLine}>{p.company_name}</Text> : null}
              {p.full_name ? <Text style={styles.partyLine}>{p.full_name}{p.is_authority && p.authority_title ? ` (${p.authority_title})` : ''}</Text> : null}
              {p.phone ? <Text style={styles.partyMuted}>{p.phone}</Text> : null}
              {p.email ? <Text style={styles.partyMuted}>{p.email}</Text> : null}
              {p.tax_number || p.id_number ? <Text style={styles.partyMuted}>No: {p.tax_number || p.id_number}</Text> : null}
              {p.address ? <Text style={styles.partyMuted}>{p.address}</Text> : null}
            </View>
          ))}
        </Section>

        <Section title="Sözleşme metni">
          <Text style={styles.bodyText}>{c.body_text}</Text>
        </Section>

        {c.special_clauses ? (
          <Section title="Özel maddeler">
            <Text style={styles.bodyText}>{c.special_clauses}</Text>
          </Section>
        ) : null}

        <Section title={`İmzalar (${detail.signatures.length})`}>
          {detail.signatures.length === 0 ? (
            <Text style={styles.muted}>Henüz imza yok.</Text>
          ) : (
            detail.signatures.map((s) => (
              <View key={s.id} style={styles.sigRow}>
                <Text style={styles.sigName}>{s.signer_name}{s.signer_title ? ` · ${s.signer_title}` : ''}</Text>
                <Text style={styles.muted}>
                  {new Date(s.signed_at).toLocaleString('tr-TR')} · {s.signature_method} · v{s.version_no}
                </Text>
              </View>
            ))
          )}
        </Section>

        <Section title={`Sürümler (${detail.versions.length})`}>
          {detail.versions.map((v) => (
            <View key={v.id} style={styles.versionRow}>
              <Text style={styles.versionTitle}>v{v.version_no} — {v.title}</Text>
              <Text style={styles.muted}>{new Date(v.created_at).toLocaleString('tr-TR')}</Text>
            </View>
          ))}
        </Section>

        {canManage ? (
          <Section title="Denetim kaydı">
            {detail.auditLogs.slice(0, 20).map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Text style={styles.logAction}>{log.action_type}</Text>
                <Text style={styles.muted}>
                  {(log.actor as { full_name?: string } | null)?.full_name ?? '—'} · {new Date(log.created_at).toLocaleString('tr-TR')}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}
      </ScrollView>

      <ContractSignatureModal visible={signOpen} onClose={() => setSignOpen(false)} onSubmit={handleSign} />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  busy,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress} disabled={busy} activeOpacity={0.8}>
      {busy ? <ActivityIndicator size="small" color={adminTheme.colors.primary} /> : <Ionicons name={icon} size={20} color={adminTheme.colors.primary} />}
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ManageBtn({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <TouchableOpacity style={[styles.manageBtn, danger && styles.manageBtnDanger]} onPress={onPress}>
      <Text style={[styles.manageBtnText, danger && styles.manageBtnTextDanger]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 20, paddingBottom: 36 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 12,
  },
  number: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.primary, letterSpacing: 0.5 },
  title: { marginTop: 6, fontSize: 20, fontWeight: '900', color: adminTheme.colors.text },
  meta: { marginTop: 4, fontSize: 13, color: adminTheme.colors.textMuted },
  statusPill: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusText: { fontSize: 12, fontWeight: '800' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  editBtnText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.primary },
  actionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  actionBtn: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    gap: 4,
  },
  actionLabel: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textSecondary },
  manageRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  manageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.primary,
  },
  manageBtnDanger: { backgroundColor: adminTheme.colors.surface, borderWidth: 1, borderColor: adminTheme.colors.error },
  manageBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  manageBtnTextDanger: { color: adminTheme.colors.error },
  section: { marginBottom: 18 },
  sectionTitle: { fontSize: 15, fontWeight: '900', color: adminTheme.colors.text, marginBottom: 8 },
  partyCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.borderLight,
  },
  partySide: { fontSize: 12, fontWeight: '800', color: adminTheme.colors.primaryMuted, marginBottom: 4 },
  partyLine: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  partyMuted: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  bodyText: { fontSize: 14, lineHeight: 22, color: adminTheme.colors.text, backgroundColor: adminTheme.colors.surface, padding: 12, borderRadius: 10 },
  sigRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.borderLight },
  sigName: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text },
  versionRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: adminTheme.colors.borderLight },
  versionTitle: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text },
  logRow: { paddingVertical: 6 },
  logAction: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.text, textTransform: 'capitalize' },
  muted: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
});
