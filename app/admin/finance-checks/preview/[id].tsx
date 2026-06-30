import { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Text, ActivityIndicator, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import {
  FinanceCheckPreviewCard,
} from '@/components/financeChecks/FinanceCheckPreviewCard';
import { FinanceCheckExportButtons } from '@/components/financeChecks/FinanceCheckExportButtons';
import { ImageLightboxModal } from '@/components/admin/ImageLightboxModal';
import {
  financeCheckPdfInputFromPreview,
  type FinanceCheckPreviewData,
  type FinanceCheckPdfInput,
} from '@/lib/financeCheckPdf';
import type { FinanceCheckDirection, FinanceCheckStatus } from '@/lib/finance';

export default function AdminFinanceCheckPreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<FinanceCheckPreviewData | null>(null);
  const [orgName, setOrgName] = useState<string | undefined>();
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data: row, error } = await supabase
      .from('finance_checks')
      .select('*, organizations(name)')
      .eq('id', id)
      .single();
    if (error || !row) {
      setLoading(false);
      Alert.alert('Hata', error?.message ?? 'Bulunamadı');
      router.back();
      return;
    }
    const r = row as Record<string, unknown>;
    const org = r.organizations as { name?: string } | null;
    setOrgName(org?.name);
    setData({
      direction: r.direction as FinanceCheckDirection,
      counterparty_name: String(r.counterparty_name ?? ''),
      amount: Number(r.amount),
      status: r.status as FinanceCheckStatus,
      check_number: (r.check_number as string | null) ?? null,
      bank_name: (r.bank_name as string | null) ?? null,
      branch_name: (r.branch_name as string | null) ?? null,
      issue_date: (r.issue_date as string | null) ?? null,
      due_date: (r.due_date as string | null) ?? null,
      purpose: (r.purpose as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      image_urls: Array.isArray(r.image_urls) ? (r.image_urls as string[]) : [],
    });
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || !data) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.accent} />
      </View>
    );
  }

  const exportData: FinanceCheckPdfInput = financeCheckPdfInputFromPreview(data, {
    id: String(id),
    organizationName: orgName,
  });

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content}>
        <FinanceCheckPreviewCard data={data} large onImagePress={setLightbox} />
        <View style={styles.exportWrap}>
          <FinanceCheckExportButtons data={exportData} />
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.footerBtn}
          onPress={() => router.push({ pathname: '/admin/finance-checks/edit/[id]', params: { id: String(id) } } as never)}
          activeOpacity={0.9}
        >
          <Ionicons name="create-outline" size={20} color="#fff" />
          <Text style={styles.footerBtnText}>Düzenle</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtn, styles.footerBtnSecondary]}
          onPress={() => router.back()}
          activeOpacity={0.9}
        >
          <Ionicons name="arrow-back-outline" size={20} color={adminTheme.colors.primary} />
          <Text style={[styles.footerBtnText, styles.footerBtnTextSecondary]}>Geri</Text>
        </TouchableOpacity>
      </View>

      <ImageLightboxModal visible={!!lightbox} uri={lightbox} onClose={() => setLightbox(null)} />
    </View>
  );
}

const T = adminTheme;

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: T.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 120 },
  exportWrap: { marginTop: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: T.colors.surface,
    borderTopWidth: 1,
    borderTopColor: T.colors.border,
  },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
  },
  footerBtnSecondary: {
    backgroundColor: T.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: T.colors.border,
  },
  footerBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  footerBtnTextSecondary: { color: T.colors.primary },
});
