import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

const DEPARTMENTS = [
  { value: 'owner', label: 'Sahip' },
  { value: 'general_manager', label: 'Genel Müdür' },
  { value: 'manager', label: 'Müdür' },
  { value: 'supervisor', label: 'Sorumlu / Şef' },
  { value: 'housekeeping', label: 'Temizlik' },
  { value: 'technical', label: 'Teknik' },
  { value: 'receptionist', label: 'Resepsiyon' },
  { value: 'front_office', label: 'Ön Büro' },
  { value: 'security', label: 'Güvenlik' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
  { value: 'kitchen', label: 'Mutfak' },
  { value: 'kitchen_staff', label: 'Mutfak Personeli' },
  { value: 'chef', label: 'Aşçı' },
  { value: 'head_chef', label: 'Baş Aşçı' },
  { value: 'pastry', label: 'Pastane' },
  { value: 'restaurant', label: 'Restoran' },
  { value: 'service', label: 'Servis' },
  { value: 'bar', label: 'Bar' },
  { value: 'hr', label: 'İnsan Kaynakları' },
  { value: 'accounting', label: 'Muhasebe' },
];

const ROLES = [
  { value: 'receptionist', label: 'Resepsiyonist' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'technical', label: 'Teknik' },
  { value: 'security', label: 'Güvenlik' },
];

const ROLE_BY_DEPARTMENT: Record<string, string> = {
  owner: 'reception_chief',
  general_manager: 'reception_chief',
  manager: 'reception_chief',
  supervisor: 'reception_chief',
  front_office: 'receptionist',
  kitchen: 'technical',
  kitchen_staff: 'technical',
  chef: 'technical',
  head_chef: 'technical',
  pastry: 'technical',
  service: 'receptionist',
  bar: 'receptionist',
  hr: 'reception_chief',
  accounting: 'reception_chief',
};

const SHIFT_TYPES = [
  { value: 'morning', label: 'Sabah (08:00-17:00)' },
  { value: 'evening', label: 'Akşam (14:00-23:00)' },
  { value: 'night', label: 'Gece (23:00-08:00)' },
  { value: 'flexible', label: 'Esnek' },
];

const APP_PERMISSIONS = [
  { key: 'stok_giris', label: 'Stok girişi yapabilir' },
  { key: 'mesajlasma', label: 'Müşterilerle mesajlaşabilir' },
  { key: 'misafir_mesaj_alabilir', label: 'Müşteriden direkt mesaj alabilir' },
  { key: 'video_paylasim', label: 'Video/resim paylaşabilir' },
  { key: 'ekip_sohbet', label: 'Ekip sohbetini görebilir' },
  { key: 'dokuman_yukle', label: 'Doküman yükleyebilir / yönetebilir' },
  { key: 'gorev_ata', label: 'Görev atayabilir' },
  { key: 'personel_ekle', label: 'Personel ekleyebilir (sadece yönetici)' },
  { key: 'raporlar', label: 'Raporları görebilir' },
  { key: 'satis_komisyon', label: 'Satış / komisyon modülüne erişebilir' },
  { key: 'tum_sozlesmeler', label: 'Tüm sözleşmeleri görüntüleyebilir' },
  { key: 'kahvalti_teyit_olustur', label: 'Kahvaltı teyidi oluşturabilir' },
  { key: 'kahvalti_teyit_departman', label: 'Kahvaltı teyitlerini (mutfak) görüntüleyebilir / düzenleyebilir' },
  { key: 'kahvalti_teyit_onayla', label: 'Kahvaltı teyitlerini onaylayabilir' },
  { key: 'kahvalti_rapor', label: 'Kahvaltı raporlarını görebilir' },
  { key: 'transfer_tour_services', label: 'Transfer & Tur: hizmetleri yönet (ekle, düzenle, sil)' },
  { key: 'transfer_tour_requests', label: 'Transfer & Tur: talepleri yönet (onay, red, fiyat)' },
  { key: 'dining_venues', label: 'Yemek & Mekanlar: rehberi yönet (ekle, düzenle, sil)' },
  { key: 'yarin_oda_temizlik_listesi', label: 'Yarın temizlenecek odalar listesini yönetebilir' },
  { key: 'yemek_listesi_olustur', label: 'Aylık yemek listesi oluşturabilir / düzenleyebilir' },
  { key: 'yemek_listesi_mutfak_onay', label: 'Günlük yemek listesi mutfak onayı verebilir' },
  { key: 'otel_mutfak_menu', label: 'Otel mutfağı menüsünü yönetebilir (yemek/içecek, fiyat, fotoğraf)' },
  { key: 'kbs_mrz_scan', label: 'Pasaport / MRZ tarama (KBS)' },
  { key: 'teknik_varlik_yonetimi', label: 'Akıllı Tesis Envanteri: bina, lokasyon, varlık ve QR yönetimi' },
  { key: 'teknik_varliklar', label: 'Teknik QR: okutma, müdahale kaydı, durum güncelleme' },
  { key: 'teknik_varliklar_okuma', label: 'Teknik QR: salt okunur (talimatları görüntüleme)' },
  { key: 'emanet_buluntu', label: 'Emanet / buluntu: kayıt oluşturma ve yönetim' },
  { key: 'tesis_gunlugu', label: 'Tesis günlüğü: kayıt oluşturma (foto/video, zimmet/değişiklik)' },
];

const CONTRACT_TYPES: { value: string; label: string }[] = [
  { value: '', label: 'Seçilmedi' },
  { value: 'full_time', label: 'Belirsiz süreli' },
  { value: 'fixed_term', label: 'Belirli süreli' },
  { value: 'seasonal', label: 'Sezonluk' },
  { value: 'intern', label: 'Stajyer' },
  { value: 'other', label: 'Diğer' },
];

const DAYS = [
  { value: 1, label: 'Pzt' },
  { value: 2, label: 'Sal' },
  { value: 3, label: 'Çar' },
  { value: 4, label: 'Per' },
  { value: 5, label: 'Cum' },
  { value: 6, label: 'Cmt' },
  { value: 7, label: 'Paz' },
];

type OrgRow = { id: string; name: string; slug: string; kind: string };

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function AddStaffScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [id_number, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [hire_date, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [personnel_no, setPersonnelNo] = useState('');
  const [salary, setSalary] = useState('');
  const [sgk_no, setSgkNo] = useState('');
  const [shift_type, setShiftType] = useState('');
  const [work_days, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [app_permissions, setAppPermissions] = useState<Record<string, boolean>>({
    stok_giris: true,
    mesajlasma: true,
    misafir_mesaj_alabilir: true,
    video_paylasim: true,
    ekip_sohbet: true,
    dokuman_yukle: false,
    gorev_ata: false,
    personel_ekle: false,
    raporlar: false,
    satis_komisyon: false,
    tum_sozlesmeler: false,
    kahvalti_teyit_olustur: false,
    kahvalti_teyit_departman: false,
    kahvalti_teyit_onayla: false,
    kahvalti_rapor: false,
    transfer_tour_services: false,
    transfer_tour_requests: false,
    dining_venues: false,
    yarin_oda_temizlik_listesi: false,
    yemek_listesi_olustur: false,
    yemek_listesi_mutfak_onay: false,
    otel_mutfak_menu: false,
    kbs_mrz_scan: false,
    teknik_varlik_yonetimi: false,
    teknik_varliklar: false,
    teknik_varliklar_okuma: false,
    emanet_buluntu: false,
    tesis_gunlugu: false,
  });
  const [notes, setNotes] = useState('');
  const [emergency_contact_name, setEmergencyContactName] = useState('');
  const [emergency_contact_phone, setEmergencyContactPhone] = useState('');
  const [emergency_contact2_name, setEmergencyContact2Name] = useState('');
  const [emergency_contact2_phone, setEmergencyContact2Phone] = useState('');
  const [previous_work_experience, setPreviousWorkExperience] = useState('');
  const [contract_type, setContractType] = useState('');
  const [termination_date, setTerminationDate] = useState('');
  const [internal_extension, setInternalExtension] = useState('');
  const [certifications_summary, setCertificationsSummary] = useState('');
  const [kvkk_consent_at, setKvkkConsentAt] = useState('');
  const [drives_vehicle, setDrivesVehicle] = useState(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('organizations')
      .select('id, name, slug, kind')
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        const rows = (data as OrgRow[]) ?? [];
        setOrganizations(rows);
        if (rows.length) setOrganizationId((prev) => prev ?? rows[0].id);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleDay = (d: number) => {
    setWorkDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const togglePermission = (key: string) => {
    setAppPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submit = async (active: boolean) => {
    if (!full_name.trim() || !email.trim() || !password) {
      Alert.alert('Hata', 'Ad Soyad, E-posta ve Şifre zorunludur.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.');
      return;
    }
    const role = ROLE_BY_DEPARTMENT[department] ?? department ?? 'receptionist';
    if (!ROLES.some((r) => r.value === role)) {
      Alert.alert('Hata', 'Geçerli bir departman seçin.');
      return;
    }
    if (!organizationId) {
      Alert.alert('Hata', 'İşletme seçin (otel veya tur şirketi).');
      return;
    }
    setLoading(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Hata', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
        setLoading(false);
        return;
      }
      if (!supabaseUrl) {
        Alert.alert('Hata', 'Supabase URL yapılandırılmamış.');
        setLoading(false);
        return;
      }
      const url = `${supabaseUrl}/functions/v1/create-staff`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          full_name: full_name.trim(),
          role,
          access_token: session.access_token,
          department: department || null,
          position: position.trim() || null,
          phone: phone.trim() || null,
          birth_date: birth_date || null,
          id_number: id_number.trim() || null,
          address: address.trim() || null,
          hire_date: hire_date || null,
          personnel_no: personnel_no.trim() || null,
          salary: salary ? parseFloat(salary.replace(',', '.')) : null,
          sgk_no: sgk_no.trim() || null,
          app_permissions,
          work_days,
          shift_type: shift_type || null,
          notes: notes.trim() || null,
          emergency_contact_name: emergency_contact_name.trim() || null,
          emergency_contact_phone: emergency_contact_phone.trim() || null,
          emergency_contact2_name: emergency_contact2_name.trim() || null,
          emergency_contact2_phone: emergency_contact2_phone.trim() || null,
          previous_work_experience: previous_work_experience.trim() || null,
          organization_id: organizationId,
          contract_type: contract_type.trim() || null,
          termination_date: termination_date.trim() || null,
          internal_extension: internal_extension.trim() || null,
          certifications_summary: certifications_summary.trim() || null,
          kvkk_consent_at: kvkk_consent_at.trim() || null,
          drives_vehicle,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data?.error) throw new Error(data.error);
      Alert.alert('Başarılı', 'Çalışan hesabı oluşturuldu. ' + (data?.email ?? ''), [
        { text: 'Tamam', onPress: () => router.replace('/admin/staff') },
      ]);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Çalışan eklenemedi.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.sectionTitle}>👤 Yeni çalışan ekle (admin)</Text>

      <Text style={styles.label}>Ad Soyad *</Text>
      <TextInput
        style={styles.input}
        value={full_name}
        onChangeText={setFullName}
        placeholder="Ahmet Yılmaz"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>E-posta *</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="ahmet@valoria.com"
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor="#9ca3af"
      />
      <View style={styles.row}>
        <Text style={[styles.label, { flex: 1 }]}>Şifre *</Text>
        <TouchableOpacity
          style={styles.smallBtn}
          onPress={() => setPassword(randomPassword())}
        >
          <Text style={styles.smallBtnText}>Otomatik oluştur</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Telefon</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="+90 555 123 45 67"
        keyboardType="phone-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Doğum tarihi</Text>
      <TextInput
        style={styles.input}
        value={birth_date}
        onChangeText={setBirthDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>T.C. Kimlik</Text>
      <TextInput
        style={styles.input}
        value={id_number}
        onChangeText={setIdNumber}
        placeholder="12345678901"
        keyboardType="number-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Adres</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="Adres"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>1. Yakın Ad Soyad</Text>
      <TextInput
        style={styles.input}
        value={emergency_contact_name}
        onChangeText={setEmergencyContactName}
        placeholder="Örn: Ayşe Yılmaz"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>1. Yakın Telefon</Text>
      <TextInput
        style={styles.input}
        value={emergency_contact_phone}
        onChangeText={setEmergencyContactPhone}
        placeholder="05xx xxx xx xx"
        keyboardType="phone-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>2. Yakın Ad Soyad</Text>
      <TextInput
        style={styles.input}
        value={emergency_contact2_name}
        onChangeText={setEmergencyContact2Name}
        placeholder="Örn: Mehmet Yılmaz"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>2. Yakın Telefon</Text>
      <TextInput
        style={styles.input}
        value={emergency_contact2_phone}
        onChangeText={setEmergencyContact2Phone}
        placeholder="05xx xxx xx xx"
        keyboardType="phone-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Geçmişte Çalıştığı İşler / Deneyim</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={previous_work_experience}
        onChangeText={setPreviousWorkExperience}
        placeholder={'Örn:\n- 2021-2023 Resepsiyon Görevlisi\n- 2023-2025 Ön Büro Sorumlusu'}
        placeholderTextColor="#9ca3af"
        multiline
      />

      <Text style={styles.sectionTitle}>🏢 İşletme</Text>
      <Text style={styles.label}>Bu personel hangi otel / ofis için? *</Text>
      <View style={styles.chips}>
        {organizations.map((o) => (
          <TouchableOpacity
            key={o.id}
            style={[styles.chip, organizationId === o.id && styles.chipActive]}
            onPress={() => setOrganizationId(o.id)}
          >
            <Text style={[styles.chipText, organizationId === o.id && styles.chipTextActive]}>{o.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>🏢 Çalışan bilgileri</Text>
      <Text style={styles.label}>Departman</Text>
      <View style={styles.chips}>
        {DEPARTMENTS.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[styles.chip, department === d.value && styles.chipActive]}
            onPress={() => setDepartment(d.value)}
          >
            <Text style={[styles.chipText, department === d.value && styles.chipTextActive]}>
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Pozisyon</Text>
      <TextInput
        style={styles.input}
        value={position}
        onChangeText={setPosition}
        placeholder="Kat Hizmetleri Sorumlusu"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>İşe başlama tarihi</Text>
      <TextInput
        style={styles.input}
        value={hire_date}
        onChangeText={setHireDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Personel no</Text>
      <TextInput
        style={styles.input}
        value={personnel_no}
        onChangeText={setPersonnelNo}
        placeholder="P-2025-001"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Maaş (TL)</Text>
      <TextInput
        style={styles.input}
        value={salary}
        onChangeText={setSalary}
        placeholder="22500"
        keyboardType="decimal-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>SGK no</Text>
      <TextInput
        style={styles.input}
        value={sgk_no}
        onChangeText={setSgkNo}
        placeholder="1234567890"
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.sectionTitle}>📋 Ek seçenekler (İK)</Text>
      <Text style={styles.label}>Sözleşme tipi</Text>
      <View style={styles.chips}>
        {CONTRACT_TYPES.map((c) => (
          <TouchableOpacity
            key={c.value || 'none'}
            style={[styles.chip, contract_type === c.value && styles.chipActive]}
            onPress={() => setContractType(c.value)}
          >
            <Text style={[styles.chipText, contract_type === c.value && styles.chipTextActive]} numberOfLines={2}>
              {c.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>İşten çıkış tarihi (varsa)</Text>
      <TextInput
        style={styles.input}
        value={termination_date}
        onChangeText={setTerminationDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Dahili hat</Text>
      <TextInput
        style={styles.input}
        value={internal_extension}
        onChangeText={setInternalExtension}
        placeholder="Örn: 204"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Sertifikalar / geçerlilik (serbest metin)</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={certifications_summary}
        onChangeText={setCertificationsSummary}
        placeholder={'İlk yardım — 2026-12-01\nHijyen — 2025-06-15'}
        placeholderTextColor="#9ca3af"
        multiline
      />
      <Text style={styles.label}>KVKK onay tarihi</Text>
      <TextInput
        style={styles.input}
        value={kvkk_consent_at}
        onChangeText={setKvkkConsentAt}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />
      <View style={styles.switchRow}>
        <Text style={styles.label}>Ehliyet / araç kullanabilir</Text>
        <Switch value={drives_vehicle} onValueChange={setDrivesVehicle} trackColor={{ false: '#cbd5e0', true: '#ed8936' }} thumbColor="#fff" />
      </View>

      <Text style={styles.sectionTitle}>⏰ Çalışma</Text>
      <Text style={styles.label}>Vardiya</Text>
      <View style={styles.chips}>
        {SHIFT_TYPES.map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.chip, shift_type === s.value && styles.chipActive]}
            onPress={() => setShiftType(s.value)}
          >
            <Text style={[styles.chipText, shift_type === s.value && styles.chipTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Çalışma günleri</Text>
      <View style={styles.chips}>
        {DAYS.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[styles.chip, work_days.includes(d.value) && styles.chipActive]}
            onPress={() => toggleDay(d.value)}
          >
            <Text
              style={[styles.chipText, work_days.includes(d.value) && styles.chipTextActive]}
            >
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>📱 Uygulama yetkileri</Text>
      {APP_PERMISSIONS.map((p) => (
        <TouchableOpacity
          key={p.key}
          style={styles.checkRow}
          onPress={() => togglePermission(p.key)}
        >
          <Text style={styles.checkbox}>{app_permissions[p.key] ? '☑' : '☐'}</Text>
          <Text style={styles.checkLabel}>{p.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Açıklama / Not</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Deneme süresi 3 ay..."
        placeholderTextColor="#9ca3af"
        multiline
      />

      <Text style={styles.hint}>
        Kapı yetkileri (geçiş kontrolü) için: Panel → Geçiş Kontrolü → Personel Yetkileri
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#ed8936" style={{ marginTop: 24 }} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => submit(true)}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>💾 Kaydet ve aktif et</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>İptal</Text>
          </TouchableOpacity>
        </>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24, paddingBottom: 48 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a202c', marginTop: 20, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#4a5568', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  textArea: { minHeight: 80 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  smallBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#e2e8f0', borderRadius: 8 },
  smallBtnText: { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#1a365d' },
  chipText: { color: '#4a5568', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: { fontSize: 18, marginRight: 10 },
  checkLabel: { fontSize: 15, color: '#374151' },
  hint: { fontSize: 12, color: '#718096', marginBottom: 16 },
  primaryButton: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#718096', fontSize: 16 },
});
