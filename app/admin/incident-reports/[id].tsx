import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, usePathname, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';
import {
  getIncidentReportDetail,
  markIncidentReportPdfGenerated,
  notifyIncidentReportRecipients,
  resendIncidentReportToPrinter,
  syncIncidentReportRecipients,
  type IncidentReportRecipientRow,
  type IncidentReportRow,
} from '@/lib/incidentReports';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import * as Linking from 'expo-linking';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useAuthStore } from '@/stores/authStore';
import { IncidentStaffPicker } from '@/components/incident/IncidentStaffPicker';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Taslak',
  pending_admin_approval: 'Admin onayı bekliyor',
  revision_requested: 'Düzeltme istendi',
  approved: 'Onaylandı',
  pdf_generated: 'PDF oluşturuldu',
  archived: 'Arşivlendi',
  cancelled: 'İptal edildi',
};

const EDITABLE_STATUSES = new Set(['draft', 'pending_admin_approval', 'revision_requested']);

export default function AdminIncidentReportDetailScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const isStaffRoute = pathname.startsWith('/staff');
  const basePath = isStaffRoute ? '/staff/incident-reports' : '/admin/incident-reports';
  const { staff } = useAuthStore();
  const params = useLocalSearchParams<{ id?: string }>();
  const reportId = useMemo(() => String(params.id ?? ''), [params.id]);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<IncidentReportRow | null>(null);
  const [mediaCount, setMediaCount] = useState(0);
  const [auditCount, setAuditCount] = useState(0);
  const [recipients, setRecipients] = useState<IncidentReportRecipientRow[]>([]);
  const [recipientStaffIds, setRecipientStaffIds] = useState<string[]>([]);
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [sending, setSending] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const canEditRecipients = report ? EDITABLE_STATUSES.has(report.status) : false;

  const load = useCallback(async () => {
    if (!reportId) return;
    const res = await getIncidentReportDetail(reportId);
    if (!res.reportRes.error && res.reportRes.data) {
      setReport(res.reportRes.data as IncidentReportRow);
      setMediaCount(res.mediaRes?.data?.length ?? 0);
      setAuditCount(res.auditRes?.data?.length ?? 0);
      const rows = (res.recipientsRes?.data ?? []) as IncidentReportRecipientRow[];
      setRecipients(rows);
      setRecipientStaffIds(rows.map((r) => r.staff_id));
    }
    setLoading(false);
  }, [reportId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Tutanak detayı bulunamadı.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace(basePath as any)}>
          <Text style={styles.backText}>Geri dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const buildIncidentHtml = (r: IncidentReportRow) => {
    const esc = (v: string | null | undefined) =>
      String(v ?? '—')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    const recipientNames =
      recipients
        .map((x) => x.staff?.full_name?.trim())
        .filter(Boolean)
        .join(', ') || r.related_staff_name;
    return `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
@page { size: A4; margin: 14mm; }
body { font-family: Arial, sans-serif; color: #0f172a; font-size: 11px; }
.head { display:flex; justify-content:space-between; border-bottom:2px solid #1e293b; padding-bottom:8px; margin-bottom:10px; }
.title { font-size: 16px; font-weight: 800; }
.meta { font-size: 11px; color:#475569; text-align:right; }
.card { border:1px solid #dbe2ea; border-radius:8px; padding:8px; margin-bottom:8px; }
.k { color:#475569; font-weight:700; font-size:11px; margin-top:4px; }
.v { color:#0f172a; font-size:12px; margin-top:2px; white-space: pre-wrap; }
</style></head><body>
<div class="head">
  <div class="title">OTEL TUTANAĞI</div>
  <div class="meta">${esc(r.report_no)}<br/>${new Date(r.occurred_at).toLocaleString('tr-TR')}</div>
</div>
<div class="card">
  <div class="k">Otel</div><div class="v">${esc(r.hotel_name)}</div>
  <div class="k">Departman</div><div class="v">${esc(r.department)}</div>
  <div class="k">Lokasyon / Oda</div><div class="v">${esc(r.location_label)} / ${esc(r.room_number)}</div>
  <div class="k">İlgili Misafir</div><div class="v">${esc(r.related_guest_name)}</div>
  <div class="k">İlgili Personel</div><div class="v">${esc(recipientNames)}</div>
</div>
<div class="card">
  <div class="k">Olay Açıklaması</div><div class="v">${esc(r.description)}</div>
  <div class="k">Alınan Aksiyon</div><div class="v">${esc(r.action_taken)}</div>
</div>
<div class="card">
  <div class="k">Durum</div><div class="v">${esc(STATUS_LABELS[r.status] ?? r.status)}</div>
</div>
</body></html>`;
  };

  const generatePdfForReport = async (): Promise<{ localUri: string; storagePath: string } | null> => {
    if (!report || !staff?.id || !staff.organization_id) {
      Alert.alert('Hata', 'PDF için personel/organizasyon bilgisi eksik.');
      return null;
    }
    setGeneratingPdf(true);
    try {
      const html = buildIncidentHtml(report);
      const { uri } = await Print.printToFileAsync({
        html,
        width: 595,
        height: 842,
        margins: { top: 18, right: 16, bottom: 18, left: 16 },
      });
      const storagePath = `org/${staff.organization_id}/reports/${report.id}/TUTANAK-${Date.now()}.pdf`;
      const blob = await uriToArrayBuffer(uri);
      const upload = await supabase.storage.from('incident-reports').upload(storagePath, blob, {
        contentType: 'application/pdf',
        upsert: true,
      });
      if (upload.error) throw new Error(upload.error.message);

      const markRes = await markIncidentReportPdfGenerated(report.id, {
        filePath: storagePath,
        generatedByStaffId: staff.id,
      });
      if (markRes.error) throw new Error(markRes.error.message);

      setReport((prev) => (prev ? { ...prev, pdf_file_path: storagePath, status: 'pdf_generated' } : prev));
      return { localUri: uri, storagePath };
    } catch (e) {
      Alert.alert('PDF Hatası', (e as Error)?.message ?? 'PDF oluşturulamadı.');
      return null;
    } finally {
      setGeneratingPdf(false);
    }
  };

  const ensurePdf = async (): Promise<{ localUri?: string; storagePath: string } | null> => {
    if (report?.pdf_file_path) return { storagePath: report.pdf_file_path };
    const created = await generatePdfForReport();
    if (!created) return null;
    return { localUri: created.localUri, storagePath: created.storagePath };
  };

  const openPdfPreview = async () => {
    const ensured = await ensurePdf();
    if (!ensured) return;
    const path = ensured.storagePath;
    const { data, error } = await supabase.storage.from('incident-reports').createSignedUrl(path, 60 * 10);
    if (error || !data?.signedUrl) {
      Alert.alert('Hata', error?.message ?? 'PDF önizleme bağlantısı alınamadı.');
      return;
    }
    await Linking.openURL(data.signedUrl);
  };

  const printNative = async () => {
    try {
      const ensured = await ensurePdf();
      if (!ensured) return;
      if (ensured.localUri) {
        if (Platform.OS === 'web') {
          await Print.printAsync({ html: buildIncidentHtml(report) });
        } else {
          await Print.printAsync({ uri: ensured.localUri });
        }
        return;
      }
      const { data, error } = await supabase.storage.from('incident-reports').createSignedUrl(ensured.storagePath, 120);
      if (error || !data?.signedUrl) throw new Error(error?.message ?? 'PDF bağlantısı alınamadı');
      await Print.printAsync({ uri: data.signedUrl });
    } catch (e) {
      Alert.alert('Yazdırma Hatası', (e as Error)?.message ?? 'Yazdırılamadı.');
    }
  };

  const sendToPrinter = async () => {
    const ensured = await ensurePdf();
    if (!ensured) return;
    setSending(true);
    const { data, error } = await resendIncidentReportToPrinter(report.id);
    setSending(false);
    if (error || (data as { ok?: boolean; error?: { message?: string } })?.ok === false) {
      const msg =
        (error as { message?: string })?.message ??
        (data as { error?: { message?: string } })?.error?.message ??
        'Yazıcıya mail gönderilemedi.';
      Alert.alert('Hata', msg);
      return;
    }
    Alert.alert('Başarılı', 'Tutanak PDF dosyası yazıcı e-postasına gönderildi.');
  };

  const sharePdf = async () => {
    const ensured = await ensurePdf();
    if (!ensured) return;
    try {
      let localUri = ensured.localUri;
      if (!localUri) {
        const generated = await Print.printToFileAsync({
          html: buildIncidentHtml(report),
          width: 595,
          height: 842,
          margins: { top: 18, right: 16, bottom: 18, left: 16 },
        });
        localUri = generated.uri;
      }
      const can = await Sharing.isAvailableAsync();
      if (!can) throw new Error('Paylaşım bu cihazda kullanılamıyor');
      await Sharing.shareAsync(localUri, {
        mimeType: 'application/pdf',
        dialogTitle: 'Tutanak PDF paylaş',
        UTI: 'com.adobe.pdf',
      });
    } catch (e) {
      Alert.alert('Paylaşım Hatası', (e as Error)?.message ?? 'Paylaşım başarısız.');
    }
  };

  const saveRecipients = async () => {
    if (!staff?.id || !staff.organization_id || !report) return;
    setSavingRecipients(true);
    const syncRes = await syncIncidentReportRecipients({
      organizationId: staff.organization_id,
      reportId: report.id,
      staffIds: recipientStaffIds,
      createdByStaffId: staff.id,
    });
    setSavingRecipients(false);
    if (syncRes.error) {
      Alert.alert('Hata', syncRes.error.message ?? 'Personel kaydedilemedi.');
      return;
    }
    await load();
    Alert.alert('Kaydedildi', 'İlgili personel listesi güncellendi.');
  };

  const notifyRecipients = async () => {
    if (!staff?.id || !report) return;
    if (recipientStaffIds.length === 0) {
      Alert.alert('Personel seçin', 'Bildirim göndermek için en az bir personel seçmelisiniz.');
      return;
    }
    setNotifying(true);
    const result = await notifyIncidentReportRecipients({
      report,
      staffIds: recipientStaffIds,
      createdByStaffId: staff.id,
      isStaffRoute,
      message: `${report.report_no} tutanağı sizinle paylaşıldı.`,
    });
    setNotifying(false);
    if (result.error) {
      Alert.alert('Bildirim Hatası', result.error);
      return;
    }
    if (result.count === 0) {
      Alert.alert('Bilgi', 'Bildirim gönderilecek personel bulunamadı (tercihler kapalı olabilir).');
      return;
    }
    await load();
    Alert.alert('Gönderildi', `${result.count} personele bildirim iletildi.`);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TouchableOpacity style={styles.backBtnTop} onPress={() => router.replace(basePath as any)} activeOpacity={0.85}>
        <Ionicons name="arrow-back" size={16} color={adminTheme.colors.text} />
        <Text style={styles.backText}>Listeye dön</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        <Text style={styles.no}>{report.report_no}</Text>
        <Text style={styles.status}>{STATUS_LABELS[report.status] ?? report.status}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Lokasyon</Text>
        <Text style={styles.value}>{report.location_label}</Text>
        <Text style={styles.label}>Oda</Text>
        <Text style={styles.value}>{report.room_number || '-'}</Text>
        <Text style={styles.label}>Olay Tarihi</Text>
        <Text style={styles.value}>{new Date(report.occurred_at).toLocaleString('tr-TR')}</Text>
        {report.related_guest_name ? (
          <>
            <Text style={styles.label}>İlgili Misafir</Text>
            <Text style={styles.value}>{report.related_guest_name}</Text>
          </>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Olay Açıklaması</Text>
        <Text style={styles.value}>{report.description}</Text>
        <Text style={styles.label}>Alınan Aksiyon</Text>
        <Text style={styles.value}>{report.action_taken || '-'}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>İlgili Personel</Text>
        <IncidentStaffPicker
          organizationId={staff?.organization_id ?? null}
          selectedStaffIds={recipientStaffIds}
          onChange={setRecipientStaffIds}
          disabled={!canEditRecipients}
        />
        {recipients.length > 0 ? (
          <Text style={styles.recipientMeta}>
            {recipients.filter((r) => r.notified_at).length} / {recipients.length} personele bildirim gönderildi
          </Text>
        ) : null}
        {canEditRecipients ? (
          <TouchableOpacity
            style={[styles.inlineBtn, savingRecipients && styles.disabledBtn]}
            onPress={() => void saveRecipients()}
            disabled={savingRecipients}
            activeOpacity={0.86}
          >
            <Ionicons name="people-outline" size={16} color={adminTheme.colors.primary} />
            <Text style={styles.inlineBtnText}>{savingRecipients ? 'Kaydediliyor...' : 'Personeli kaydet'}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.inlineBtn, styles.inlineBtnNotify, notifying && styles.disabledBtn]}
          onPress={() => void notifyRecipients()}
          disabled={notifying || recipientStaffIds.length === 0}
          activeOpacity={0.86}
        >
          <Ionicons name="notifications-outline" size={16} color="#fff" />
          <Text style={styles.inlineBtnTextWhite}>{notifying ? 'Gönderiliyor...' : 'Personellere bildir'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Ekler</Text>
        <Text style={styles.value}>{mediaCount} medya kaydı</Text>
        <Text style={styles.label}>Geçmiş</Text>
        <Text style={styles.value}>{auditCount} audit kaydı</Text>
        {report.pdf_file_path ? (
          <>
            <Text style={styles.label}>PDF</Text>
            <Text style={styles.value} numberOfLines={2}>
              Hazır
            </Text>
          </>
        ) : null}
      </View>

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnCreate]}
          onPress={() => void generatePdfForReport()}
          activeOpacity={0.86}
          disabled={generatingPdf}
        >
          <Ionicons name="document-attach-outline" size={16} color="#fff" />
          <Text style={styles.actionText}>{generatingPdf ? 'PDF oluşturuluyor...' : 'PDF Oluştur'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => void openPdfPreview()} activeOpacity={0.86}>
          <Ionicons name="eye-outline" size={16} color="#fff" />
          <Text style={styles.actionText}>PDF Önizle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAlt]} onPress={() => void printNative()} activeOpacity={0.86}>
          <Ionicons name="print-outline" size={16} color="#fff" />
          <Text style={styles.actionText}>Yazdır</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnAlt]}
          onPress={() => void sendToPrinter()}
          activeOpacity={0.86}
          disabled={sending}
        >
          <Ionicons name="mail-outline" size={16} color="#fff" />
          <Text style={styles.actionText}>{sending ? 'Gönderiliyor...' : 'Yazıcıya Mail'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnWhatsapp]} onPress={() => void sharePdf()} activeOpacity={0.86}>
          <Ionicons name="share-social-outline" size={16} color="#fff" />
          <Text style={styles.actionText}>Paylaş (WhatsApp vb.)</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 28, gap: 10 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  empty: { fontSize: 14, color: adminTheme.colors.textMuted },
  backBtnTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  backBtn: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  backText: { color: adminTheme.colors.text, fontSize: 12, fontWeight: '700' },
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.lg,
    padding: 12,
  },
  no: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  status: { marginTop: 4, fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 4 },
  label: { marginTop: 8, fontSize: 12, fontWeight: '800', color: adminTheme.colors.textMuted },
  value: { marginTop: 2, fontSize: 14, color: adminTheme.colors.text, lineHeight: 20 },
  recipientMeta: { marginTop: 8, fontSize: 12, color: adminTheme.colors.textMuted, fontWeight: '600' },
  inlineBtn: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  inlineBtnNotify: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  inlineBtnText: { fontSize: 13, fontWeight: '700', color: adminTheme.colors.primary },
  inlineBtnTextWhite: { fontSize: 13, fontWeight: '700', color: '#fff' },
  disabledBtn: { opacity: 0.6 },
  actionsRow: { marginTop: 6, gap: 8 },
  actionBtn: {
    borderRadius: 12,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  actionBtnAlt: { backgroundColor: '#0f766e' },
  actionBtnCreate: { backgroundColor: '#1d4ed8' },
  actionBtnWhatsapp: { backgroundColor: '#16a34a' },
  actionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
