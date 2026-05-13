import { useState, useEffect, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';
import * as Print from 'expo-print';
import { sendPdfToPrinterEmail } from '@/lib/printerEmail';
import { exportStaffDetailPdf, buildStaffDetailHtml } from '@/lib/staffDetailPdf';
import { sendNotification } from '@/lib/notificationService';
import { uploadUriToPublicBucket } from '@/lib/storagePublicUpload';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { getDocumentsBucketPublicUrl, isDocumentImageMime } from '@/lib/documentsSignedUrl';
import { useAuthStore } from '@/stores/authStore';
import {
  type StaffPersonnelWarningSeverity,
  SEVERITY_LABEL_TR,
  SEVERITY_DESC_TR,
  notificationTitleForSeverity,
} from '@/lib/staffPersonnelWarnings';

const WARN_SEVERITY_LEVELS: StaffPersonnelWarningSeverity[] = [
  'reminder',
  'verbal',
  'written',
  'severe',
  'final',
];

function personnelWarningImageList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((u): u is string => typeof u === 'string' && u.trim().length > 0);
}

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
  { value: 'admin', label: 'Admin' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
  { value: 'receptionist', label: 'Resepsiyonist' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'technical', label: 'Teknik' },
  { value: 'security', label: 'Güvenlik' },
];

const SHIFT_TYPES = [
  { value: 'morning', label: 'Sabah (08:00-17:00)' },
  { value: 'evening', label: 'Akşam (14:00-23:00)' },
  { value: 'night', label: 'Gece (23:00-08:00)' },
  { value: 'flexible', label: 'Esnek' },
];

const CONTRACT_TYPES: { value: string; label: string }[] = [
  { value: '', label: 'Seçilmedi' },
  { value: 'full_time', label: 'Belirsiz süreli' },
  { value: 'fixed_term', label: 'Belirli süreli' },
  { value: 'seasonal', label: 'Sezonluk' },
  { value: 'intern', label: 'Stajyer' },
  { value: 'other', label: 'Diğer' },
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
  { key: 'transfer_tour_services', label: 'Transfer & Tur: hizmetleri yönet' },
  { key: 'transfer_tour_requests', label: 'Transfer & Tur: talepleri yönet' },
  { key: 'dining_venues', label: 'Yemek & Mekanlar: rehberi yönet (ekle, düzenle, sil)' },
  { key: 'yarin_oda_temizlik_listesi', label: 'Yarın temizlenecek odalar listesini yönetebilir' },
  { key: 'kbs_mrz_scan', label: 'Pasaport / MRZ tarama (KBS)' },
  { key: 'teknik_varlik_yonetimi', label: 'Akıllı Tesis Envanteri: bina, lokasyon, varlık ve QR yönetimi' },
  { key: 'teknik_varliklar', label: 'Teknik QR: okutma, müdahale kaydı, durum güncelleme' },
  { key: 'teknik_varliklar_okuma', label: 'Teknik QR: salt okunur (talimatları görüntüleme)' },
];

const APP_PERMISSION_LABELS: Record<string, string> = APP_PERMISSIONS.reduce<Record<string, string>>((acc, item) => {
  acc[item.key] = item.label;
  return acc;
}, {});

const DAYS = [
  { value: 1, label: 'Pzt' },
  { value: 2, label: 'Sal' },
  { value: 3, label: 'Çar' },
  { value: 4, label: 'Per' },
  { value: 5, label: 'Cum' },
  { value: 6, label: 'Cmt' },
  { value: 7, label: 'Paz' },
];

const DEFAULT_PERMISSIONS: Record<string, boolean> = {
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
  kbs_mrz_scan: false,
  teknik_varlik_yonetimi: false,
  teknik_varliklar: false,
  teknik_varliklar_okuma: false,
};

type OrgRow = { id: string; name: string; slug: string; kind: string };

type StaffDetail = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  birth_date: string | null;
  id_number: string | null;
  address: string | null;
  hire_date: string | null;
  tenure_note?: string | null;
  personnel_no: string | null;
  salary: number | null;
  sgk_no: string | null;
  app_permissions: Record<string, boolean> | null;
  work_days: number[] | null;
  shift_type: string | null;
  notes: string | null;
  is_active: boolean | null;
  office_location: string | null;
  bio?: string | null;
  achievements: string[] | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact2_name?: string | null;
  emergency_contact2_phone?: string | null;
  previous_work_experience?: string | null;
  whatsapp: string | null;
  verification_badge: 'blue' | 'yellow' | null;
  organization_id: string | null;
  contract_type?: string | null;
  termination_date?: string | null;
  internal_extension?: string | null;
  certifications_summary?: string | null;
  kvkk_consent_at?: string | null;
  drives_vehicle?: boolean | null;
};

type StaffRelatedDocument = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  current_version_id: string | null;
};

type StaffRelatedVersion = {
  id: string;
  file_name: string;
  file_path: string;
  mime_type: string | null;
};

type PersonnelWarningRow = {
  id: string;
  severity: StaffPersonnelWarningSeverity;
  subject_line: string | null;
  body: string;
  created_at: string;
  acknowledged_at: string | null;
  acknowledgement_note: string | null;
  image_urls: unknown;
};

export default function EditStaffScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { staff: adminActor } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [password, setPassword] = useState('');
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [id_number, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [hire_date, setHireDate] = useState('');
  const [tenure_note, setTenureNote] = useState('');
  const [personnel_no, setPersonnelNo] = useState('');
  const [salary, setSalary] = useState('');
  const [sgk_no, setSgkNo] = useState('');
  const [shift_type, setShiftType] = useState('');
  const [work_days, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [app_permissions, setAppPermissions] = useState<Record<string, boolean>>(DEFAULT_PERMISSIONS);
  const [notes, setNotes] = useState('');
  const [is_active, setIsActive] = useState(true);
  const [office_location, setOfficeLocation] = useState('');
  const [bio, setBio] = useState('');
  const [achievements, setAchievements] = useState('');
  const [emergency_contact_name, setEmergencyContactName] = useState('');
  const [emergency_contact_phone, setEmergencyContactPhone] = useState('');
  const [emergency_contact2_name, setEmergencyContact2Name] = useState('');
  const [emergency_contact2_phone, setEmergencyContact2Phone] = useState('');
  const [previous_work_experience, setPreviousWorkExperience] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [verification_badge, setVerificationBadge] = useState<'blue' | 'yellow' | ''>('');
  const [organizations, setOrganizations] = useState<OrgRow[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [contract_type, setContractType] = useState('');
  const [termination_date, setTerminationDate] = useState('');
  const [internal_extension, setInternalExtension] = useState('');
  const [certifications_summary, setCertificationsSummary] = useState('');
  const [kvkk_consent_at, setKvkkConsentAt] = useState('');
  const [drives_vehicle, setDrivesVehicle] = useState(false);
  const [nonAdminRole, setNonAdminRole] = useState<string>('receptionist');
  /** Uzak DB’de migration 211 uygulanmadıysa tenure_note yok; güncellemede göndermeyelim. */
  const [supportsTenureNoteColumn, setSupportsTenureNoteColumn] = useState(true);
  const [staffDocs, setStaffDocs] = useState<StaffRelatedDocument[]>([]);
  const [staffDocVersions, setStaffDocVersions] = useState<Record<string, StaffRelatedVersion>>({});
  const [staffDocPreviewUrlByPath, setStaffDocPreviewUrlByPath] = useState<Record<string, string>>({});
  const [staffDocsLoading, setStaffDocsLoading] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [personnelWarnings, setPersonnelWarnings] = useState<PersonnelWarningRow[]>([]);
  const [personnelWarningsLoading, setPersonnelWarningsLoading] = useState(false);
  const [warnModalOpen, setWarnModalOpen] = useState(false);
  const [warnSeverity, setWarnSeverity] = useState<StaffPersonnelWarningSeverity>('verbal');
  const [warnSubject, setWarnSubject] = useState('');
  const [warnBody, setWarnBody] = useState('');
  const [warnImageUrls, setWarnImageUrls] = useState<string[]>([]);
  const [warnImageUploading, setWarnImageUploading] = useState(false);
  const [issuingWarning, setIssuingWarning] = useState(false);

  const loadPersonnelWarnings = useCallback(async () => {
    if (!id) return;
    setPersonnelWarningsLoading(true);
    const { data, error } = await supabase
      .from('staff_personnel_warnings')
      .select('id, severity, subject_line, body, created_at, acknowledged_at, acknowledgement_note, image_urls')
      .eq('subject_staff_id', id)
      .order('created_at', { ascending: false })
      .limit(40);
    setPersonnelWarningsLoading(false);
    if (!error && data) setPersonnelWarnings(data as PersonnelWarningRow[]);
    else setPersonnelWarnings([]);
  }, [id]);

  useEffect(() => {
    loadPersonnelWarnings();
  }, [loadPersonnelWarnings]);

  useEffect(() => {
    supabase
      .from('organizations')
      .select('id, name, slug, kind')
      .order('name')
      .then(({ data }) => setOrganizations((data as OrgRow[]) ?? []));
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const STAFF_SELECT_FULL =
        'id, full_name, email, role, department, position, phone, birth_date, id_number, address, hire_date, tenure_note, personnel_no, salary, sgk_no, app_permissions, work_days, shift_type, notes, is_active, office_location, bio, achievements, emergency_contact_name, emergency_contact_phone, emergency_contact2_name, emergency_contact2_phone, previous_work_experience, whatsapp, verification_badge, organization_id, contract_type, termination_date, internal_extension, certifications_summary, kvkk_consent_at, drives_vehicle';
      const STAFF_SELECT_LEGACY =
        'id, full_name, email, role, department, position, phone, birth_date, id_number, address, hire_date, personnel_no, salary, sgk_no, app_permissions, work_days, shift_type, notes, is_active, office_location, bio, achievements, emergency_contact_name, emergency_contact_phone, whatsapp, verification_badge, organization_id, contract_type, termination_date, internal_extension, certifications_summary, kvkk_consent_at, drives_vehicle';
      let { data, error } = await supabase
        .from('staff')
        .select(STAFF_SELECT_FULL)
        .eq('id', id)
        .single();
      const msg = String(error?.message ?? '');
      const tenureMissing =
        msg.includes('tenure_note') ||
        msg.includes('does not exist') ||
        /schema cache/i.test(msg) ||
        /PGRST204/i.test(msg);
      if (error && tenureMissing) {
        setSupportsTenureNoteColumn(false);
        ({ data, error } = await supabase.from('staff').select(STAFF_SELECT_LEGACY).eq('id', id).single());
      } else if (!error) {
        setSupportsTenureNoteColumn(true);
      }
      if (error || !data) {
        Alert.alert('Hata', 'Çalışan bulunamadı.');
        router.back();
        return;
      }
      const s = data as StaffDetail;
      setStaff(s);
      setFullName(s.full_name ?? '');
      setEmail(s.email ?? '');
      setRole(s.role ?? 'receptionist');
      setNonAdminRole((s.role && s.role !== 'admin' ? s.role : 'receptionist') ?? 'receptionist');
      setDepartment(s.department ?? '');
      setPosition(s.position ?? '');
      setPhone(s.phone ?? '');
      setBirthDate(s.birth_date ?? '');
      setIdNumber(s.id_number ?? '');
      setAddress(s.address ?? '');
      setHireDate(s.hire_date ?? '');
      setTenureNote(s.tenure_note ?? '');
      setPersonnelNo(s.personnel_no ?? '');
      setSalary(s.salary != null ? String(s.salary) : '');
      setSgkNo(s.sgk_no ?? '');
      setShiftType(s.shift_type ?? '');
      setWorkDays(Array.isArray(s.work_days) && s.work_days.length ? s.work_days : [1, 2, 3, 4, 5]);
      setAppPermissions(typeof s.app_permissions === 'object' && s.app_permissions ? { ...DEFAULT_PERMISSIONS, ...s.app_permissions } : DEFAULT_PERMISSIONS);
      setNotes(s.notes ?? '');
      setIsActive(s.is_active ?? true);
      setOfficeLocation(s.office_location ?? '');
      setBio(s.bio ?? '');
      setAchievements(Array.isArray(s.achievements) ? s.achievements.join(', ') : '');
      setEmergencyContactName(s.emergency_contact_name ?? '');
      setEmergencyContactPhone(s.emergency_contact_phone ?? '');
      setEmergencyContact2Name(s.emergency_contact2_name ?? '');
      setEmergencyContact2Phone(s.emergency_contact2_phone ?? '');
      setPreviousWorkExperience(s.previous_work_experience ?? '');
      setWhatsapp(s.whatsapp ?? '');
      setVerificationBadge(s.verification_badge === 'blue' || s.verification_badge === 'yellow' ? s.verification_badge : '');
      setOrganizationId(s.organization_id ?? null);
      setContractType(s.contract_type ?? '');
      setTerminationDate(s.termination_date ?? '');
      setInternalExtension(s.internal_extension ?? '');
      setCertificationsSummary(s.certifications_summary ?? '');
      setKvkkConsentAt(s.kvkk_consent_at ?? '');
      setDrivesVehicle(s.drives_vehicle === true);
    })().finally(() => setLoading(false));
  }, [id]);

  const loadStaffDocuments = useCallback(async () => {
    if (!id) return;
    setStaffDocsLoading(true);
    try {
      const docsRes = await supabase
        .from('documents')
        .select('id, title, status, updated_at, current_version_id')
        .eq('related_staff_id', id)
        .is('archived_at', null)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (docsRes.error) throw docsRes.error;

      const docs = (docsRes.data as StaffRelatedDocument[]) ?? [];
      setStaffDocs(docs);
      const versionIds = Array.from(new Set(docs.map((d) => d.current_version_id).filter(Boolean) as string[]));
      if (versionIds.length === 0) {
        setStaffDocVersions({});
        setStaffDocPreviewUrlByPath({});
        return;
      }

      const versionsRes = await supabase
        .from('document_versions')
        .select('id, file_name, file_path, mime_type')
        .in('id', versionIds);
      if (versionsRes.error) throw versionsRes.error;

      const versionsMap: Record<string, StaffRelatedVersion> = {};
      const previewUrlMap: Record<string, string> = {};
      for (const row of (versionsRes.data as StaffRelatedVersion[]) ?? []) {
        versionsMap[row.id] = row;
        const url = getDocumentsBucketPublicUrl(row.file_path);
        if (url) previewUrlMap[row.file_path] = url;
      }
      setStaffDocVersions(versionsMap);
      setStaffDocPreviewUrlByPath(previewUrlMap);
    } catch {
      setStaffDocs([]);
      setStaffDocVersions({});
      setStaffDocPreviewUrlByPath({});
    } finally {
      setStaffDocsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadStaffDocuments();
  }, [loadStaffDocuments]);

  const toggleDay = (d: number) => {
    setWorkDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const togglePermission = (key: string) => {
    setAppPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const guestMessagesBlocked = app_permissions.misafir_mesaj_alabilir === false;
  const toggleGuestMessagesBlocked = (blocked: boolean) => {
    setAppPermissions((prev) => ({ ...prev, misafir_mesaj_alabilir: !blocked }));
  };

  const isAdmin = role === 'admin';
  const toggleFullAdmin = (next: boolean) => {
    if (next) {
      if (role && role !== 'admin') setNonAdminRole(role);
      setRole('admin');
      Alert.alert('Tam admin', 'Kaydedince kullanıcı tam admin yetkisi alacak ve Admin sekmesi görünecek.');
      return;
    }
    setRole(nonAdminRole || 'receptionist');
  };

  const uploadWarnImage = async (uri: string) => {
    setWarnImageUploading(true);
    try {
      const { publicUrl } = await uploadUriToPublicBucket({
        bucketId: 'staff-personnel-warnings',
        uri,
        subfolder: 'warn',
      });
      setWarnImageUrls((prev) => (prev.length >= 8 ? prev : [...prev, publicUrl]));
    } catch (e) {
      Alert.alert('Yükleme', (e as Error).message);
    } finally {
      setWarnImageUploading(false);
    }
  };

  const pickWarnCamera = async () => {
    const ok = await ensureCameraPermission({
      title: 'Kamera',
      message: 'Uyarıya görsel eklemek için kamera gerekli.',
      settingsMessage: 'Ayarlardan kamera iznini açın.',
    });
    if (!ok) return;
    const r = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
    });
    if (!r.canceled && r.assets[0]?.uri) await uploadWarnImage(r.assets[0].uri);
  };

  const pickWarnLibrary = async () => {
    const ok = await ensureMediaLibraryPermission();
    if (!ok) return;
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsMultipleSelection: true,
      selectionLimit: 8,
    });
    if (r.canceled) return;
    for (const a of r.assets ?? []) {
      if (warnImageUrls.length >= 8) break;
      if (a.uri) await uploadWarnImage(a.uri);
    }
  };

  const issuePersonnelWarning = async () => {
    if (!id || !organizationId) {
      Alert.alert('Uyarı', 'İşletme bilgisi eksik.');
      return;
    }
    if (!adminActor?.id) {
      Alert.alert('Hata', 'Oturum bulunamadı.');
      return;
    }
    const bodyText = warnBody.trim();
    if (!bodyText) {
      Alert.alert('Uyarı', 'Uyarı metnini yazın.');
      return;
    }
    setIssuingWarning(true);
    try {
      const { data: inserted, error } = await supabase
        .from('staff_personnel_warnings')
        .insert({
          organization_id: organizationId,
          subject_staff_id: id,
          issued_by_staff_id: adminActor.id,
          severity: warnSeverity,
          subject_line: warnSubject.trim() || null,
          body: bodyText,
          image_urls: warnImageUrls.length > 0 ? warnImageUrls : [],
        })
        .select('id')
        .maybeSingle();
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
      const wid = (inserted as { id?: string } | null)?.id;
      const title = notificationTitleForSeverity(warnSeverity);
      const shortBody = bodyText.length > 220 ? `${bodyText.slice(0, 217)}…` : bodyText;
      await sendNotification({
        staffId: id,
        title,
        body: shortBody,
        notificationType: 'staff_personnel_warning',
        category: 'admin',
        data: {
          warningId: wid ?? '',
          screen: '/staff/warnings',
          severity: warnSeverity,
        },
        createdByStaffId: adminActor.id,
      });
      setWarnModalOpen(false);
      setWarnSubject('');
      setWarnBody('');
      setWarnImageUrls([]);
      setWarnSeverity('verbal');
      await loadPersonnelWarnings();
      Alert.alert('Gönderildi', 'Personele bildirim gitti; sözlü ve üzeri seviyede tam ekran onay istenir.');
    } finally {
      setIssuingWarning(false);
    }
  };

  const submit = async () => {
    if (!id || !staff) return;
    if (!organizationId) {
      Alert.alert('Hata', 'İşletme seçin.');
      return;
    }
    setSaving(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !supabaseUrl) {
        Alert.alert('Hata', 'Oturum bulunamadı.');
        setSaving(false);
        return;
      }
      const url = `${supabaseUrl}/functions/v1/update-staff`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
        },
        body: JSON.stringify({
          staff_id: id,
          access_token: session.access_token,
          password: password.trim() || undefined,
          full_name: full_name.trim() || null,
          email: email.trim() || null,
          role: role || null,
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
          app_permissions: app_permissions,
          work_days: work_days,
          shift_type: shift_type || null,
          notes: notes.trim() || null,
          is_active,
          whatsapp: whatsapp.trim() || null,
          office_location: office_location.trim() || null,
          bio: bio.trim() || null,
          achievements: achievements ? achievements.split(',').map((s) => s.trim()).filter(Boolean) : [],
          emergency_contact_name: emergency_contact_name.trim() || null,
          emergency_contact_phone: emergency_contact_phone.trim() || null,
          emergency_contact2_name: emergency_contact2_name.trim() || null,
          emergency_contact2_phone: emergency_contact2_phone.trim() || null,
          previous_work_experience: previous_work_experience.trim() || null,
          verification_badge: verification_badge === 'blue' || verification_badge === 'yellow' ? verification_badge : null,
          organization_id: organizationId ?? undefined,
          contract_type: contract_type.trim() ? contract_type.trim() : null,
          termination_date: termination_date.trim() || null,
          internal_extension: internal_extension.trim() || null,
          certifications_summary: certifications_summary.trim() || null,
          kvkk_consent_at: kvkk_consent_at.trim() || null,
          drives_vehicle,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data?.error) throw new Error(data.error);
      const staffExtraUpdate: Record<string, unknown> = {
        notes: notes.trim() || null,
        office_location: office_location.trim() || null,
        bio: bio.trim() || null,
        achievements: achievements ? achievements.split(',').map((s) => s.trim()).filter(Boolean) : [],
        emergency_contact_name: emergency_contact_name.trim() || null,
        emergency_contact_phone: emergency_contact_phone.trim() || null,
        emergency_contact2_name: emergency_contact2_name.trim() || null,
        emergency_contact2_phone: emergency_contact2_phone.trim() || null,
        previous_work_experience: previous_work_experience.trim() || null,
        whatsapp: whatsapp.trim() || null,
        verification_badge: verification_badge === 'blue' || verification_badge === 'yellow' ? verification_badge : null,
        contract_type: contract_type.trim() ? contract_type.trim() : null,
        termination_date: termination_date.trim() || null,
        internal_extension: internal_extension.trim() || null,
        certifications_summary: certifications_summary.trim() || null,
        kvkk_consent_at: kvkk_consent_at.trim() || null,
        drives_vehicle,
      };
      if (supportsTenureNoteColumn) {
        staffExtraUpdate.tenure_note = tenure_note.trim() || null;
      }
      const { error: updateErr } = await supabase.from('staff').update(staffExtraUpdate).eq('id', id);
      if (updateErr) {
        const umsg = String(updateErr.message ?? '');
        if (
          supportsTenureNoteColumn &&
          (umsg.includes('tenure_note') || /schema cache/i.test(umsg) || /PGRST204/i.test(umsg))
        ) {
          setSupportsTenureNoteColumn(false);
          const { tenure_note: _drop, ...retry } = staffExtraUpdate as { tenure_note?: unknown } & Record<string, unknown>;
          const { error: retryErr } = await supabase.from('staff').update(retry).eq('id', id);
          if (retryErr) throw new Error(retryErr.message);
        } else {
          throw new Error(updateErr.message);
        }
      }
      const previousPermissions = staff.app_permissions ?? {};
      const changedPermissionKeys = Object.keys(app_permissions).filter(
        (key) => (previousPermissions[key] ?? false) !== (app_permissions[key] ?? false)
      );
      if (changedPermissionKeys.length > 0) {
        const enabledLabels = changedPermissionKeys
          .filter((key) => app_permissions[key] === true)
          .map((key) => APP_PERMISSION_LABELS[key] ?? key);
        const disabledLabels = changedPermissionKeys
          .filter((key) => app_permissions[key] === false)
          .map((key) => APP_PERMISSION_LABELS[key] ?? key);
        const parts: string[] = [];
        if (enabledLabels.length > 0) parts.push(`Açılan: ${enabledLabels.join(', ')}`);
        if (disabledLabels.length > 0) parts.push(`Kapatılan: ${disabledLabels.join(', ')}`);
        const body =
          parts.length > 0
            ? parts.join(' | ').slice(0, 500)
            : 'Uygulama yetkileriniz admin tarafından güncellendi.';
        void sendNotification({
          staffId: id,
          title: 'Yetki güncellemesi',
          body,
          notificationType: 'staff_permission_updated',
          category: 'staff',
          data: { screen: 'notifications', changedKeys: changedPermissionKeys },
        });
      }
      Alert.alert('Başarılı', 'Çalışan bilgileri güncellendi.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Güncellenemedi.');
    }
    setSaving(false);
  };

  const staffPdfData = {
    fullName: full_name || '—',
    email,
    phone,
    whatsapp,
    role,
    department,
    position,
    organizationName: organizations.find((o) => o.id === organizationId)?.name ?? null,
    address,
    officeLocation: office_location,
    hireDate: hire_date,
    terminationDate: termination_date,
    personnelNo: personnel_no,
    sgkNo: sgk_no,
    contractType: contract_type,
    emergency1Name: emergency_contact_name,
    emergency1Phone: emergency_contact_phone,
    emergency2Name: emergency_contact2_name,
    emergency2Phone: emergency_contact2_phone,
    achievements,
    certificationsSummary: certifications_summary,
    previousWorkExperience: previous_work_experience,
    drivesVehicle: drives_vehicle,
    kvkkConsentAt: kvkk_consent_at,
    notes,
  };

  const previewPdf = async () => {
    try {
      await Print.printAsync({ html: buildStaffDetailHtml(staffPdfData) });
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF önizleme açılamadı.');
    }
  };

  const downloadPdf = async () => {
    try {
      await exportStaffDetailPdf(staffPdfData);
      Alert.alert('Hazır', 'PDF oluşturuldu. Paylaşım ekranından indirebilirsiniz.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    }
  };

  const sendToPrinter = async () => {
    try {
      const pdfUri = await exportStaffDetailPdf(staffPdfData);
      await sendPdfToPrinterEmail({
        pdfUri,
        subject: `Personel Detay - ${full_name || 'Personel'}`,
        fileName: `PERSONEL-${(full_name || 'DETAY').replace(/\s+/g, '-')}.pdf`,
      });
      Alert.alert('Başarılı', 'Personel detayı yazıcı e-postasına gönderildi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Yazıcıya gönderilemedi.');
    }
  };

  if (loading || !staff) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.sectionTitle}>👤 Çalışan düzenle</Text>

        <Text style={styles.label}>Yeni şifre (boş bırakırsanız değişmez)</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.label}>Ad Soyad</Text>
        <TextInput style={styles.input} value={full_name} onChangeText={setFullName} placeholder="Ad Soyad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>E-posta</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#9ca3af"
        />
        <Text style={styles.label}>Telefon</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Telefon" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>WhatsApp</Text>
        <TextInput style={styles.input} value={whatsapp} onChangeText={setWhatsapp} placeholder="05551234567" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Doğum tarihi</Text>
        <TextInput style={styles.input} value={birth_date} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>T.C. Kimlik</Text>
        <TextInput style={styles.input} value={id_number} onChangeText={setIdNumber} placeholder="T.C. Kimlik" keyboardType="number-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Adres</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Adres" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Acil durum kişisi</Text>
        <TextInput style={styles.input} value={emergency_contact_name} onChangeText={setEmergencyContactName} placeholder="Ad Soyad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Acil durum telefonu</Text>
        <TextInput style={styles.input} value={emergency_contact_phone} onChangeText={setEmergencyContactPhone} placeholder="0532 111 22 33" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>2. yakın kişi</Text>
        <TextInput style={styles.input} value={emergency_contact2_name} onChangeText={setEmergencyContact2Name} placeholder="Ad Soyad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>2. yakın telefonu</Text>
        <TextInput style={styles.input} value={emergency_contact2_phone} onChangeText={setEmergencyContact2Phone} placeholder="05xx xxx xx xx" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />

        <Text style={styles.sectionTitle}>🏢 Çalışan bilgileri</Text>
        <Text style={styles.label}>İşletme</Text>
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
        <Text style={styles.sectionTitle}>🔑 Yönetici</Text>
        <Text style={styles.label}>Tam admin (tüm yönetim paneli)</Text>
        <View style={styles.rowSwitch}>
          <Text style={[styles.label, { marginBottom: 0, flex: 1 }]}>
            {isAdmin ? 'Bu kullanıcı tam admin.' : 'Kapalıysa kullanıcı admin panelini görmez.'}
          </Text>
          <Switch value={isAdmin} onValueChange={toggleFullAdmin} trackColor={{ false: '#cbd5e0', true: '#1a365d' }} thumbColor="#fff" />
        </View>

        {!isAdmin ? (
          <>
            <Text style={styles.label}>Rol</Text>
            <View style={styles.chips}>
              {ROLES.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.chip, role === r.value && styles.chipActive]}
                  onPress={() => setRole(r.value)}
                >
                  <Text style={[styles.chipText, role === r.value && styles.chipTextActive]}>{r.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <Text style={styles.hint}>
            Tam admin açıkken rol otomatik <Text style={{ fontWeight: '700' }}>admin</Text> olur. Kapatırsanız önceki rolüne döner.
          </Text>
        )}
        <Text style={styles.label}>Departman</Text>
        <View style={styles.chips}>
          {DEPARTMENTS.map((d) => (
            <TouchableOpacity
              key={d.value}
              style={[styles.chip, department === d.value && styles.chipActive]}
              onPress={() => setDepartment(d.value)}
            >
              <Text style={[styles.chipText, department === d.value && styles.chipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Pozisyon</Text>
        <TextInput style={styles.input} value={position} onChangeText={setPosition} placeholder="Pozisyon" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>İşe başlama tarihi</Text>
        <TextInput style={styles.input} value={hire_date} onChangeText={setHireDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Kıdem notu (profil göstergesi alt metni)</Text>
        <TextInput
          style={styles.input}
          value={tenure_note}
          onChangeText={setTenureNote}
          placeholder="Örn: Ön büro kıdem sorumlusu"
          placeholderTextColor="#9ca3af"
        />
        <Text style={styles.label}>Personel no</Text>
        <TextInput style={styles.input} value={personnel_no} onChangeText={setPersonnelNo} placeholder="Personel no" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Ofis / Konum</Text>
        <TextInput style={styles.input} value={office_location} onChangeText={setOfficeLocation} placeholder="Örn: 2. Kat Ofisi" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Hakkında</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={bio}
          onChangeText={setBio}
          placeholder="Personel hakkında kısa bilgi. Link eklerseniz profilde tıklanabilir görünür."
          placeholderTextColor="#9ca3af"
          multiline
        />
        <Text style={styles.label}>Başarılar (virgülle)</Text>
        <TextInput style={styles.input} value={achievements} onChangeText={setAchievements} placeholder="Örn: Ayın Personeli 2024, En İyi Müşteri Yorumu" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Geçmişte çalıştığı işler / deneyim</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          value={previous_work_experience}
          onChangeText={setPreviousWorkExperience}
          placeholder={'Örn:\n- 2021-2023 Resepsiyon\n- 2023-2025 Ön Büro'}
          placeholderTextColor="#9ca3af"
          multiline
        />
        <Text style={styles.sectionTitle}>💰 Maaş bilgileri</Text>
        <Text style={styles.label}>Maaş (TL)</Text>
        <TextInput style={styles.input} value={salary} onChangeText={setSalary} placeholder="Maaş" keyboardType="decimal-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>SGK no</Text>
        <TextInput style={styles.input} value={sgk_no} onChangeText={setSgkNo} placeholder="SGK no" placeholderTextColor="#9ca3af" />

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
        <Text style={styles.label}>Sertifikalar / geçerlilik</Text>
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
        <View style={styles.rowSwitch}>
          <Text style={styles.label}>Ehliyet / araç kullanabilir</Text>
          <Switch value={drives_vehicle} onValueChange={setDrivesVehicle} trackColor={{ false: '#cbd5e0', true: '#1a365d' }} thumbColor="#fff" />
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
              <Text style={[styles.chipText, shift_type === s.value && styles.chipTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Çalışma günleri</Text>
        <View style={styles.chips}>
          {DAYS.map((d) => (
            <TouchableOpacity key={d.value} style={[styles.chip, work_days.includes(d.value) && styles.chipActive]} onPress={() => toggleDay(d.value)}>
              <Text style={[styles.chipText, work_days.includes(d.value) && styles.chipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>📱 Uygulama yetkileri</Text>
        <View style={styles.rowSwitch}>
          <Text style={[styles.label, { flex: 1, marginBottom: 0 }]}>
            Bu personel misafirden mesaj alamaz
          </Text>
          <Switch
            value={guestMessagesBlocked}
            onValueChange={toggleGuestMessagesBlocked}
            trackColor={{ false: '#cbd5e0', true: '#1a365d' }}
            thumbColor="#fff"
          />
        </View>
        <Text style={styles.hint}>
          Açıksa, misafir ekranında "Güvenlik nedeniyle otel tarafından mesaja kapatıldı" uyarısı gösterilir.
        </Text>
        {APP_PERMISSIONS.filter((p) => p.key !== 'misafir_mesaj_alabilir').map((p) => (
          <TouchableOpacity key={p.key} style={styles.checkRow} onPress={() => togglePermission(p.key)}>
            <Text style={styles.checkbox}>{app_permissions[p.key] ? '☑' : '☐'}</Text>
            <Text style={styles.checkLabel}>{p.label}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.rowSwitch}>
          <Text style={styles.label}>Aktif</Text>
          <Switch value={is_active} onValueChange={setIsActive} trackColor={{ false: '#cbd5e0', true: '#1a365d' }} thumbColor="#fff" />
        </View>

        <Text style={styles.sectionTitle}>✓ Doğrulama rozeti (mavi / sarı tik)</Text>
        <Text style={styles.label}>Tik verilen kullanıcı her yerde rozet ile görünür. Kaldırmak için "Yok" seçin.</Text>
        <View style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, verification_badge === '' && styles.chipActive]}
            onPress={() => setVerificationBadge('')}
          >
            <Text style={[styles.chipText, verification_badge === '' && styles.chipTextActive]}>Yok (kaldır)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, verification_badge === 'blue' && styles.chipActive]}
            onPress={() => setVerificationBadge('blue')}
          >
            <Text style={[styles.chipText, verification_badge === 'blue' && styles.chipTextActive]}>🔵 Mavi tik</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, verification_badge === 'yellow' && styles.chipActive]}
            onPress={() => setVerificationBadge('yellow')}
          >
            <Text style={[styles.chipText, verification_badge === 'yellow' && styles.chipTextActive]}>🟡 Sarı tik</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>⚠️ Resmi uyarı (disiplin)</Text>
        <Text style={styles.label}>
          Personelde kalıcı kayıt oluşturur; sözlü ve üzeri seviyede uygulama açılışında tam ekran uyarı ve okundu onayı zorunludur.
          Yıldızlı değerlendirme ile birlikte İK sürecinde kullanılabilir — ikisi ayrı kayıtlardır.
        </Text>
        <TouchableOpacity
          style={styles.warnIssueBtn}
          onPress={() => {
            setWarnImageUrls([]);
            setWarnModalOpen(true);
          }}
          activeOpacity={0.85}
        >
          <Text style={styles.warnIssueBtnText}>Bu personele uyarı gönder</Text>
        </TouchableOpacity>
        {personnelWarningsLoading ? (
          <ActivityIndicator size="small" color="#991b1b" style={{ marginVertical: 10 }} />
        ) : personnelWarnings.length === 0 ? (
          <Text style={styles.hint}>Henüz resmi uyarı kaydı yok.</Text>
        ) : (
          <View style={styles.warnList}>
            {personnelWarnings.map((w) => {
              const wImgs = personnelWarningImageList(w.image_urls);
              return (
              <View key={w.id} style={styles.warnCard}>
                {wImgs.length > 0 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.warnCardImages}>
                    {wImgs.map((uri) => (
                      <TouchableOpacity key={uri} onPress={() => setPreviewImageUri(uri)} activeOpacity={0.9}>
                        <CachedImage uri={uri} style={styles.warnCardThumb} contentFit="cover" />
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.warnCardTop}>
                  <Text style={styles.warnSeverity}>{SEVERITY_LABEL_TR[w.severity]}</Text>
                  <Text style={styles.warnDate}>{new Date(w.created_at).toLocaleString('tr-TR')}</Text>
                </View>
                {w.subject_line?.trim() ? (
                  <Text style={styles.warnSubject}>{w.subject_line.trim()}</Text>
                ) : null}
                <Text style={styles.warnBodyPreview} numberOfLines={4}>
                  {w.body.trim()}
                </Text>
                <Text style={styles.warnAck}>
                  {w.acknowledged_at
                    ? `Personel okudu: ${new Date(w.acknowledged_at).toLocaleString('tr-TR')}`
                    : 'Personel henüz okundu onayı vermedi'}
                </Text>
                {w.acknowledgement_note?.trim() ? (
                  <Text style={styles.warnAckNote}>Personel notu: {w.acknowledgement_note.trim()}</Text>
                ) : null}
              </View>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle}>⭐ Yönetim değerlendirmesi</Text>
        <Text style={styles.label}>
          Takım çalışması, disiplin, kurallara uyum vb. yıldızlı değerlendirme kaydı oluşturun; personel kendi ekranında görür.
        </Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push(`/admin/staff/evaluation/${id}`)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Değerlendirme ekranına git</Text>
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>📝 Admin notları</Text>
        <Text style={styles.label}>Not (sadece admin görür)</Text>
        <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder="Çalışkan, terfi düşünülebilir..." placeholderTextColor="#9ca3af" multiline />

        <Text style={styles.sectionTitle}>📎 Personel evrakları</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() =>
            router.push({
              pathname: '/admin/documents/new',
              params: {
                relatedStaffId: id,
                relatedStaffName: full_name || undefined,
              },
            })
          }
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Sabıka kaydı / evrak yükle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={loadStaffDocuments} activeOpacity={0.8}>
          <Text style={styles.secondaryButtonText}>Evrak listesini yenile</Text>
        </TouchableOpacity>
        {staffDocsLoading ? (
          <ActivityIndicator size="small" color="#1a365d" style={{ marginTop: 8 }} />
        ) : staffDocs.length === 0 ? (
          <Text style={styles.hint}>Bu personele bağlı evrak yok.</Text>
        ) : (
          <View style={styles.docList}>
            {staffDocs.map((doc) => {
              const ver = doc.current_version_id ? staffDocVersions[doc.current_version_id] : undefined;
              const isImage = ver ? isDocumentImageMime(ver.mime_type, ver.file_name, ver.file_path) : false;
              const previewUrl = ver?.file_path ? staffDocPreviewUrlByPath[ver.file_path] : undefined;
              return (
                <View key={doc.id} style={styles.docCard}>
                  {isImage && previewUrl ? (
                    <TouchableOpacity
                      style={styles.docThumb}
                      onPress={() => setPreviewImageUri(previewUrl)}
                      activeOpacity={0.85}
                    >
                      <CachedImage uri={previewUrl} style={styles.docThumbImage} contentFit="cover" />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.docThumbFallback}>
                      <Text style={styles.docThumbFallbackText}>DOSYA</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={() => router.push(`/admin/documents/${doc.id}`)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.docTitle} numberOfLines={1}>{doc.title}</Text>
                    <Text style={styles.docMeta} numberOfLines={1}>
                      {ver?.file_name ?? 'Dosya'} · {new Date(doc.updated_at).toLocaleDateString('tr-TR')}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle}>🖨️ Personel Detay PDF</Text>
        <TouchableOpacity style={styles.primaryButton} onPress={previewPdf} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>PDF Önizle / Yazdır</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={downloadPdf} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>PDF Oluştur / İndir</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={sendToPrinter} activeOpacity={0.85}>
          <Text style={styles.primaryButtonText}>Yazıcıya Mail Gönder</Text>
        </TouchableOpacity>

        {saving ? (
          <ActivityIndicator size="large" color="#1a365d" style={{ marginTop: 24 }} />
        ) : (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={saving}>
              <Text style={styles.primaryButtonText}>💾 Kaydet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
              <Text style={styles.secondaryButtonText}>İptal</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
      <Modal visible={warnModalOpen} transparent animationType="fade" onRequestClose={() => !issuingWarning && setWarnModalOpen(false)}>
        <View style={styles.warnModalBackdrop}>
          <View style={styles.warnModalCard}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.warnModalTitle}>Resmi uyarı</Text>
              <Text style={styles.warnModalHint}>Ciddiyet seviyesi personelin ekranında aynen görünür. Görseller metnin yanında / üstünde gösterilir.</Text>
              <Text style={styles.label}>Seviye</Text>
              <View style={styles.chips}>
                {WARN_SEVERITY_LEVELS.map((sev) => (
                  <TouchableOpacity
                    key={sev}
                    style={[styles.chip, warnSeverity === sev && styles.chipActive]}
                    onPress={() => setWarnSeverity(sev)}
                  >
                    <Text style={[styles.chipText, warnSeverity === sev && styles.chipTextActive]} numberOfLines={2}>
                      {SEVERITY_LABEL_TR[sev]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.warnSevDesc}>{SEVERITY_DESC_TR[warnSeverity]}</Text>
              <Text style={styles.label}>Konu başlığı (isteğe bağlı)</Text>
              <TextInput
                style={styles.input}
                value={warnSubject}
                onChangeText={setWarnSubject}
                placeholder="Örn: Kılık kıyafet ihlali"
                placeholderTextColor="#9ca3af"
              />
              <Text style={styles.label}>Ek görseller (isteğe bağlı, en fazla 8)</Text>
              <View style={styles.warnImgActions}>
                <TouchableOpacity style={styles.warnImgBtn} onPress={pickWarnCamera} disabled={warnImageUploading || issuingWarning}>
                  <Text style={styles.warnImgBtnText}>Kamera</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.warnImgBtn} onPress={pickWarnLibrary} disabled={warnImageUploading || issuingWarning}>
                  <Text style={styles.warnImgBtnText}>Galeri</Text>
                </TouchableOpacity>
              </View>
              {warnImageUploading ? <ActivityIndicator style={{ marginBottom: 12 }} color="#1a365d" /> : null}
              {warnImageUrls.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.warnThumbStrip}>
                  {warnImageUrls.map((uri, idx) => (
                    <View key={uri} style={styles.warnThumbWrap}>
                      <CachedImage uri={uri} style={styles.warnThumbImg} contentFit="cover" />
                      <TouchableOpacity
                        style={styles.warnThumbRemove}
                        onPress={() => setWarnImageUrls((prev) => prev.filter((_, i) => i !== idx))}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.warnThumbRemoveText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : null}
              <Text style={styles.label}>Uyarı metni (zorunlu)</Text>
              <TextInput
                style={[styles.input, styles.warnModalTextArea]}
                value={warnBody}
                onChangeText={setWarnBody}
                placeholder="Net, ölçülebilir ve kayda geçecek şekilde yazın."
                placeholderTextColor="#9ca3af"
                multiline
              />
              <TouchableOpacity
                style={[styles.primaryButton, issuingWarning && { opacity: 0.7 }]}
                onPress={issuePersonnelWarning}
                disabled={issuingWarning}
              >
                <Text style={styles.primaryButtonText}>{issuingWarning ? 'Gönderiliyor…' : 'Gönder ve kaydet'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => !issuingWarning && setWarnModalOpen(false)}
                disabled={issuingWarning}
              >
                <Text style={styles.secondaryButtonText}>İptal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <ImagePreviewModal
        visible={previewImageUri !== null}
        uri={previewImageUri}
        onClose={() => setPreviewImageUri(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  rowSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#1a365d' },
  chipText: { color: '#4a5568', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: { fontSize: 18, marginRight: 10 },
  checkLabel: { fontSize: 15, color: '#374151' },
  primaryButton: { backgroundColor: '#1a365d', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#718096', fontSize: 16 },
  docList: { marginTop: 6, marginBottom: 8, gap: 10 },
  docCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 10,
  },
  docThumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#edf2f7',
  },
  docThumbImage: { width: '100%', height: '100%' },
  docThumbFallback: {
    width: 64,
    height: 64,
    borderRadius: 10,
    backgroundColor: '#edf2f7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docThumbFallbackText: { color: '#4a5568', fontSize: 11, fontWeight: '700' },
  docTitle: { color: '#1a202c', fontWeight: '700', fontSize: 14 },
  docMeta: { color: '#4a5568', marginTop: 4, fontSize: 12 },
  hint: { fontSize: 13, color: '#718096', marginTop: 4, marginBottom: 8, lineHeight: 19 },
  warnIssueBtn: {
    backgroundColor: '#7f1d1d',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  warnIssueBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  warnList: { gap: 10, marginTop: 4, marginBottom: 8 },
  warnCard: {
    backgroundColor: '#fff7ed',
    borderWidth: 1,
    borderColor: '#fed7aa',
    borderRadius: 12,
    padding: 12,
  },
  warnCardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, gap: 8 },
  warnSeverity: { fontSize: 14, fontWeight: '800', color: '#9a3412' },
  warnDate: { fontSize: 12, color: '#78716c' },
  warnSubject: { fontSize: 15, fontWeight: '700', color: '#1a202c', marginBottom: 4 },
  warnBodyPreview: { fontSize: 14, color: '#44403c', lineHeight: 20, marginBottom: 6 },
  warnAck: { fontSize: 12, color: '#b45309', fontWeight: '600' },
  warnModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  warnModalCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    maxHeight: '88%',
    width: '100%',
  },
  warnModalTextArea: { minHeight: 120, textAlignVertical: 'top' },
  warnImgActions: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  warnImgBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#edf2f7',
    alignItems: 'center',
  },
  warnImgBtnText: { fontSize: 14, fontWeight: '700', color: '#1a365d' },
  warnThumbStrip: { marginBottom: 14 },
  warnThumbWrap: {
    width: 88,
    height: 88,
    marginRight: 10,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#edf2f7',
  },
  warnThumbImg: { width: '100%', height: '100%' },
  warnThumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnThumbRemoveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  warnCardImages: { marginBottom: 10, maxHeight: 96 },
  warnCardThumb: { width: 88, height: 88, borderRadius: 10, marginRight: 8, backgroundColor: '#fff' },
  warnAckNote: { fontSize: 13, color: '#1e40af', fontWeight: '600', marginTop: 8, lineHeight: 19 },
  warnModalTitle: { fontSize: 20, fontWeight: '800', color: '#1a202c', marginBottom: 6 },
  warnModalHint: { fontSize: 13, color: '#64748b', marginBottom: 12, lineHeight: 19 },
  warnSevDesc: { fontSize: 13, color: '#9a3412', marginTop: -8, marginBottom: 12, lineHeight: 19 },
});
