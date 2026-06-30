import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Switch,
  ScrollView,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { BreakfastPartnerAdminGate } from '@/components/breakfastPartner/BreakfastPartnerAdminGate';
import { useBreakfastPartnerProviderOrgId } from '@/hooks/useBreakfastPartnerProviderOrgId';
import { useAuthStore } from '@/stores/authStore';
import { fetchPartnerSettings, upsertPartnerSettings } from '@/lib/breakfastPartner';
import { notifyPartnerCampaign, notifyPartnersDefaultPriceChanged } from '@/lib/breakfastPartnerNotify';
import { partnerTheme } from '@/lib/breakfastPartnerTheme';

type StaffRow = { id: string; full_name: string | null; role: string; department: string | null };

export default function AdminBreakfastPartnerSettingsScreen() {
  return (
    <BreakfastPartnerAdminGate>
      <AdminBreakfastPartnerSettingsForm />
    </BreakfastPartnerAdminGate>
  );
}

function AdminBreakfastPartnerSettingsForm() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { orgId } = useBreakfastPartnerProviderOrgId();
  const staffId = useAuthStore((s) => s.staff?.id ?? null);

  const [defaultPrice, setDefaultPrice] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [remindEnabled, setRemindEnabled] = useState(true);
  const [remindTime, setRemindTime] = useState('09:30');
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [paymentNotifyStaff, setPaymentNotifyStaff] = useState<Set<string>>(new Set());
  const [loadedDefaultPrice, setLoadedDefaultPrice] = useState<number | null>(null);
  const [notifyPriceChange, setNotifyPriceChange] = useState(true);
  const [campaignTitle, setCampaignTitle] = useState('');
  const [campaignBody, setCampaignBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendingCampaign, setSendingCampaign] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    const [settings, staffRes] = await Promise.all([
      fetchPartnerSettings(orgId),
      supabase
        .from('staff')
        .select('id, full_name, role, department')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('full_name'),
    ]);

    if (staffRes.error) {
      Alert.alert('Hata', staffRes.error.message);
      setLoading(false);
      return;
    }

    setStaffList((staffRes.data ?? []) as StaffRow[]);

    if (settings) {
      setDefaultPrice(String(settings.default_unit_price || ''));
      setLoadedDefaultPrice(settings.default_unit_price);
      setEnabled(settings.feature_enabled);
      setRemindEnabled(settings.remind_enabled);
      setRemindTime(settings.remind_time || '09:30');
      setPaymentNotifyStaff(new Set(settings.payment_notify_staff_ids));
    }
    setLoading(false);
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const togglePaymentNotifyStaff = (id: string) => {
    setPaymentNotifyStaff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!orgId) {
      Alert.alert('Hata', 'Kahvaltı partner işletmesi yüklenemedi.');
      return;
    }
    const price = parseFloat(defaultPrice.replace(',', '.'));
    if (!price || price <= 0) {
      Alert.alert('Hata', 'Varsayılan birim fiyat girin.');
      return;
    }
    setSaving(true);
    const err = await upsertPartnerSettings(orgId, price, enabled, staffId, {
      remindEnabled,
      remindTime: remindTime.trim() || '09:30',
      paymentNotifyStaffIds: [...paymentNotifyStaff],
    });
    setSaving(false);
    if (err) {
      Alert.alert('Hata', err);
      return;
    }

    const priceChanged = loadedDefaultPrice != null && Math.abs(loadedDefaultPrice - price) > 0.001;
    if (priceChanged && notifyPriceChange) {
      try {
        const sent = await notifyPartnersDefaultPriceChanged({ organizationId: orgId, unitPrice: price });
        Alert.alert('Kaydedildi', `Ayarlar güncellendi. ${sent} partnere yeni birim fiyat bildirimi gönderildi.`);
      } catch (e) {
        Alert.alert('Kaydedildi', `Ayarlar güncellendi; bildirim gönderilemedi: ${(e as Error).message}`);
      }
    } else {
      Alert.alert('Kaydedildi', 'Partner kahvaltı ayarları güncellendi.');
    }
    setLoadedDefaultPrice(price);
  };

  const sendCampaign = async () => {
    if (!orgId) {
      Alert.alert('Hata', 'Kahvaltı partner işletmesi yüklenemedi.');
      return;
    }
    const title = campaignTitle.trim();
    const body = campaignBody.trim();
    if (!title || !body) {
      Alert.alert('Hata', 'Kampanya başlığı ve mesajı girin.');
      return;
    }
    Alert.alert(
      'Kampanya gönder',
      'Tüm aktif partnerlere push ve uygulama içi bildirim gidecek. Devam edilsin mi?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Gönder',
          onPress: () => {
            setSendingCampaign(true);
            void notifyPartnerCampaign({ organizationId: orgId, title, body })
              .then((sent) => {
                Alert.alert('Gönderildi', `${sent} partnere kampanya bildirimi iletildi.`);
                setCampaignTitle('');
                setCampaignBody('');
              })
              .catch((e) => Alert.alert('Hata', (e as Error).message || 'Bildirim gönderilemedi'))
              .finally(() => setSendingCampaign(false));
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 16,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <TouchableOpacity onPress={() => router.back()} style={styles.back}>
        <Ionicons name="arrow-back" size={22} color={partnerTheme.text} />
        <Text style={styles.backText}>Geri</Text>
      </TouchableOpacity>
      <Text style={styles.title}>Partner kahvaltı ayarları</Text>
      <Text style={styles.subtitle}>Varsayılan kişi başı ücret — otel özel fiyatı yoksa uygulanır.</Text>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/admin/breakfast-partners/prices')}>
        <Ionicons name="pricetag-outline" size={18} color={partnerTheme.accent} />
        <Text style={styles.linkText}>Tüm otellerin fiyatlarını düzenle</Text>
      </TouchableOpacity>

      {loading ? (
        <ActivityIndicator color={partnerTheme.accent} style={{ marginTop: 24 }} />
      ) : (
        <>
          <Text style={styles.label}>Varsayılan birim fiyat (₺)</Text>
          <TextInput
            style={styles.input}
            value={defaultPrice}
            onChangeText={setDefaultPrice}
            keyboardType="decimal-pad"
            placeholder="150"
            placeholderTextColor={partnerTheme.muted}
          />

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Fiyat değişince partnerlere bildir</Text>
            <Switch value={notifyPriceChange} onValueChange={setNotifyPriceChange} trackColor={{ true: partnerTheme.accent }} />
          </View>
          <Text style={styles.hint}>
            Varsayılan fiyat kaydedildiğinde özel fiyatı olmayan aktif partnerlere push + uygulama içi bildirim gider.
            Partner detayından özel fiyat güncellemesi ayrıca bildirilir.
          </Text>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Modül aktif</Text>
            <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: partnerTheme.accent }} />
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Akşam hatırlatıcı (yarın eksik giriş)</Text>
            <Switch value={remindEnabled} onValueChange={setRemindEnabled} trackColor={{ true: partnerTheme.accent }} />
          </View>

          <Text style={styles.label}>Hatırlatıcı saati (İstanbul)</Text>
          <TextInput
            style={styles.input}
            value={remindTime}
            onChangeText={setRemindTime}
            placeholder="20:00"
            placeholderTextColor={partnerTheme.muted}
            keyboardType="numbers-and-punctuation"
          />
          <Text style={styles.hint}>
            Partner yarınki kahvaltıyı bugün 23:59&apos;a kadar bildirir. Önerilen hatırlatma: 20:00.
          </Text>

          <Text style={styles.sectionTitle}>Cari tahsilat bildirimi</Text>
          <Text style={styles.hint}>
            Partner cari ödemesi kaydedildiğinde (manuel veya Stripe) seçili personele push + uygulama içi bildirim
            gider. Hiç seçim yoksa yalnızca partner portalına bildirim gider.
          </Text>

          {staffList.length === 0 ? (
            <Text style={styles.emptyStaff}>Bu işletmede aktif personel yok.</Text>
          ) : (
            staffList.map((row) => (
              <View key={row.id} style={styles.staffRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.staffName}>{row.full_name || '—'}</Text>
                  <Text style={styles.staffMeta}>
                    {[row.role, row.department].filter(Boolean).join(' · ') || 'Personel'}
                  </Text>
                </View>
                <Switch
                  value={paymentNotifyStaff.has(row.id)}
                  onValueChange={() => togglePaymentNotifyStaff(row.id)}
                  trackColor={{ true: partnerTheme.accent }}
                />
              </View>
            ))
          )}

          <TouchableOpacity style={styles.btn} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#0f172a" /> : <Text style={styles.btnText}>Kaydet</Text>}
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Kampanya / duyuru</Text>
          <Text style={styles.hint}>
            Tüm aktif partnerlere özel başlık ve mesajla bildirim gönderin (ücret değişikliği, kampanya vb.).
          </Text>
          <Text style={styles.label}>Başlık</Text>
          <TextInput
            style={styles.input}
            value={campaignTitle}
            onChangeText={setCampaignTitle}
            placeholder="Kahvaltı ücreti güncellendi"
            placeholderTextColor={partnerTheme.muted}
          />
          <Text style={styles.label}>Mesaj</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={campaignBody}
            onChangeText={setCampaignBody}
            placeholder="1 Haziran'dan itibaren kişi başı ücret 175 ₺ olacaktır."
            placeholderTextColor={partnerTheme.muted}
            multiline
            textAlignVertical="top"
          />
          <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={sendCampaign} disabled={sendingCampaign}>
            {sendingCampaign ? (
              <ActivityIndicator color={partnerTheme.accent} />
            ) : (
              <Text style={styles.btnSecondaryText}>Partnerlere gönder</Text>
            )}
          </TouchableOpacity>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: partnerTheme.bg },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { color: partnerTheme.text },
  title: { color: partnerTheme.text, fontSize: 22, fontWeight: '800' },
  subtitle: { color: partnerTheme.muted, marginTop: 4, marginBottom: 16 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  linkText: { color: partnerTheme.accent, fontWeight: '700' },
  label: { color: partnerTheme.muted, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: partnerTheme.card,
    borderRadius: 12,
    padding: 12,
    color: partnerTheme.text,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20 },
  switchLabel: { color: partnerTheme.text, fontWeight: '600', flex: 1, paddingRight: 12 },
  hint: { color: partnerTheme.muted, fontSize: 12, marginTop: 6, marginBottom: 4, lineHeight: 18 },
  sectionTitle: { color: partnerTheme.text, fontSize: 16, fontWeight: '800', marginTop: 24, marginBottom: 4 },
  staffRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: partnerTheme.card,
    borderWidth: 1,
    borderColor: partnerTheme.cardBorder,
  },
  staffName: { color: partnerTheme.text, fontWeight: '700', fontSize: 15 },
  staffMeta: { color: partnerTheme.muted, fontSize: 12, marginTop: 2 },
  emptyStaff: { color: partnerTheme.muted, marginTop: 12, textAlign: 'center' },
  btn: {
    marginTop: 24,
    backgroundColor: partnerTheme.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnText: { color: '#0f172a', fontWeight: '800' },
  btnSecondary: {
    marginTop: 12,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: partnerTheme.accent,
  },
  btnSecondaryText: { color: partnerTheme.accent, fontWeight: '800' },
  textArea: { minHeight: 96, paddingTop: 12 },
});
