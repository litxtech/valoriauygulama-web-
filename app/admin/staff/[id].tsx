import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { adminTheme } from '@/constants/adminTheme';
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
import {
  STAFF_MENU_CATALOG,
  STAFF_MENU_SECTION_LABELS_TR,
  normalizeHiddenMenuItemIds,
  type StaffMenuCatalogSection,
} from '@/lib/staffMenuCatalog';

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
  { key: 'kahvalti_rapor', label: 'Kahvaltı teyit raporları (salt okunur, onay/puan yok)' },
  { key: 'transfer_tour_services', label: 'Transfer & Tur: hizmetleri yönet' },
  { key: 'transfer_tour_requests', label: 'Transfer & Tur: talepleri yönet' },
  { key: 'dining_venues', label: 'Yemek & Mekanlar: rehberi yönet (ekle, düzenle, sil)' },
  { key: 'yarin_oda_temizlik_listesi', label: 'Yarın temizlenecek odalar listesini yönetebilir' },
  { key: 'yemek_listesi_olustur', label: 'Aylık yemek listesi oluşturabilir / düzenleyebilir' },
  { key: 'yemek_listesi_mutfak_onay', label: 'Günlük yemek listesi mutfak onayı verebilir' },
  { key: 'otel_mutfak_menu', label: 'Otel mutfağı menüsünü yönetebilir (yemek/içecek, fiyat, fotoğraf)' },
  { key: 'kbs_mrz_scan', label: 'Pasaport / MRZ tarama (KBS)' },
  { key: 'id_capture', label: 'Kimlik / pasaport çekim sistemi' },
  { key: 'teknik_varlik_yonetimi', label: 'Akıllı Tesis Envanteri: bina, lokasyon, varlık ve QR yönetimi' },
  { key: 'teknik_varliklar', label: 'Teknik QR: okutma, müdahale kaydı, durum güncelleme' },
  { key: 'teknik_varliklar_okuma', label: 'Teknik QR: salt okunur (talimatları görüntüleme)' },
  { key: 'emanet_buluntu', label: 'Emanet / buluntu: kayıt oluşturma ve yönetim' },
  { key: 'tesis_gunlugu', label: 'Tesis günlüğü: kayıt oluşturma (foto/video)' },
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
  yemek_listesi_olustur: false,
  yemek_listesi_mutfak_onay: false,
  otel_mutfak_menu: false,
  kbs_mrz_scan: false,
  id_capture: false,
  teknik_varlik_yonetimi: false,
  teknik_varliklar: false,
  teknik_varliklar_okuma: false,
  emanet_buluntu: false,
  tesis_gunlugu: false,
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
  profile_hidden_by_admin?: boolean | null;
  hidden_menu_item_ids?: unknown;
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

function SectionCard({
  title,
  subtitle,
  icon,
  children,
  variant = 'default',
}: {
  title: string;
  subtitle?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
  variant?: 'default' | 'danger';
}) {
  const accent = variant === 'danger' ? adminTheme.colors.error : adminTheme.colors.primary;
  const bubbleBg = variant === 'danger' ? adminTheme.colors.errorLight : adminTheme.colors.surfaceTertiary;
  return (
    <View style={[sectionStyles.card, variant === 'danger' && { borderLeftWidth: 4, borderLeftColor: accent }]}>
      <View style={sectionStyles.cardHeader}>
        {icon ? (
          <View style={[sectionStyles.iconBubble, { backgroundColor: bubbleBg }]}>
            <Ionicons name={icon} size={18} color={accent} />
          </View>
        ) : null}
        <View style={sectionStyles.cardHeaderText}>
          <Text style={sectionStyles.cardTitle}>{title}</Text>
          {subtitle ? <Text style={sectionStyles.cardSubtitle}>{subtitle}</Text> : null}
        </View>
      </View>
      <View style={sectionStyles.cardBody}>{children}</View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={sectionStyles.fieldBlock}>
      <Text style={sectionStyles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const sectionStyles = StyleSheet.create({
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: adminTheme.spacing.lg,
    ...adminTheme.shadow.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: adminTheme.spacing.lg,
    paddingTop: adminTheme.spacing.lg,
    paddingBottom: adminTheme.spacing.sm,
    gap: adminTheme.spacing.md,
  },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: adminTheme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderText: { flex: 1, minWidth: 0 },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: adminTheme.colors.text,
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    lineHeight: 18,
  },
  cardBody: {
    paddingHorizontal: adminTheme.spacing.lg,
    paddingBottom: adminTheme.spacing.lg,
    paddingTop: adminTheme.spacing.xs,
  },
  fieldBlock: { marginBottom: adminTheme.spacing.md },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});

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
  const [profileHiddenByAdmin, setProfileHiddenByAdmin] = useState(false);
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
  const [permissionsExpanded, setPermissionsExpanded] = useState(false);
  const [menuRestrictionsExpanded, setMenuRestrictionsExpanded] = useState(false);
  const [hiddenMenuItemIds, setHiddenMenuItemIds] = useState<string[]>([]);
  const [supportsHiddenMenuColumn, setSupportsHiddenMenuColumn] = useState(true);

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
      const STAFF_BASE =
        'id, full_name, email, role, department, position, phone, birth_date, id_number, address, hire_date, personnel_no, salary, sgk_no, app_permissions, work_days, shift_type, notes, is_active, office_location, bio, achievements, emergency_contact_name, emergency_contact_phone, emergency_contact2_name, emergency_contact2_phone, previous_work_experience, whatsapp, verification_badge, organization_id, contract_type, termination_date, internal_extension, certifications_summary, kvkk_consent_at, drives_vehicle, profile_hidden_by_admin';
      const isSchemaColMissing = (errMsg: string, col: string) =>
        errMsg.includes(col) ||
        errMsg.includes('does not exist') ||
        /schema cache/i.test(errMsg) ||
        /PGRST204/i.test(errMsg);

      let tenureOk = true;
      let menuOk = true;
      let selectCols = `${STAFF_BASE}, tenure_note, hidden_menu_item_ids`;
      let { data, error } = await supabase.from('staff').select(selectCols).eq('id', id).single();
      let errMsg = String(error?.message ?? '');

      if (error && isSchemaColMissing(errMsg, 'tenure_note')) {
        tenureOk = false;
        selectCols = `${STAFF_BASE}, hidden_menu_item_ids`;
        ({ data, error } = await supabase.from('staff').select(selectCols).eq('id', id).single());
        errMsg = String(error?.message ?? '');
      }
      if (error && isSchemaColMissing(errMsg, 'hidden_menu_item_ids')) {
        menuOk = false;
        selectCols = tenureOk ? `${STAFF_BASE}, tenure_note` : STAFF_BASE;
        ({ data, error } = await supabase.from('staff').select(selectCols).eq('id', id).single());
        errMsg = String(error?.message ?? '');
      }
      if (error && tenureOk && isSchemaColMissing(errMsg, 'tenure_note')) {
        tenureOk = false;
        selectCols = menuOk ? `${STAFF_BASE}, hidden_menu_item_ids` : STAFF_BASE;
        ({ data, error } = await supabase.from('staff').select(selectCols).eq('id', id).single());
      }
      setSupportsTenureNoteColumn(tenureOk);
      setSupportsHiddenMenuColumn(menuOk);
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
      setProfileHiddenByAdmin(s.profile_hidden_by_admin === true);
      setHiddenMenuItemIds(normalizeHiddenMenuItemIds(s.hidden_menu_item_ids));
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

  const toggleHiddenMenuItem = (itemId: string) => {
    setHiddenMenuItemIds((prev) =>
      prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
    );
  };

  const menuCatalogBySection = useMemo(() => {
    const grouped: Record<StaffMenuCatalogSection, typeof STAFF_MENU_CATALOG> = {
      nav: [],
      staff: [],
      hotel: [],
      ops: [],
      admin: [],
    };
    for (const entry of STAFF_MENU_CATALOG) {
      grouped[entry.section].push(entry);
    }
    return grouped;
  }, []);

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
        profile_hidden_by_admin: profileHiddenByAdmin,
      };
      if (supportsHiddenMenuColumn) {
        staffExtraUpdate.hidden_menu_item_ids = hiddenMenuItemIds;
      }
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
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={styles.heroCard}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>
              {(full_name || '?')
                .trim()
                .slice(0, 2)
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.heroTextCol}>
            <Text style={styles.heroName} numberOfLines={2}>
              {full_name?.trim() ? full_name.trim() : 'İsimsiz personel'}
            </Text>
            <Text style={styles.heroMeta} numberOfLines={1}>
              {email?.trim() ? email.trim() : 'E-posta yok'}
            </Text>
            <View style={styles.heroPills}>
              <View style={[styles.heroPill, is_active ? styles.heroPillOn : styles.heroPillOff]}>
                <Text style={[styles.heroPillText, is_active ? styles.heroPillTextOn : styles.heroPillTextOff]}>{is_active ? 'Aktif' : 'Pasif'}</Text>
              </View>
              {isAdmin ? (
                <View style={[styles.heroPill, styles.heroPillAdmin]}>
                  <Text style={styles.heroPillTextAdmin}>Admin</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        <SectionCard title="Hesap güvenliği" subtitle="Şifre boş bırakılırsa değişmez." icon="key-outline">
          <Field label="Yeni şifre">
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
        </SectionCard>

        <SectionCard title="Kimlik ve iletişim" subtitle="Temel kişisel bilgiler ve adres." icon="person-outline">
          <Field label="Ad Soyad">
            <TextInput
              style={styles.input}
              value={full_name}
              onChangeText={setFullName}
              placeholder="Ad Soyad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="E-posta">
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="E-posta"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Telefon">
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="Telefon"
              keyboardType="phone-pad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="WhatsApp">
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="05551234567"
              keyboardType="phone-pad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Doğum tarihi">
            <TextInput
              style={styles.input}
              value={birth_date}
              onChangeText={setBirthDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="T.C. Kimlik">
            <TextInput
              style={styles.input}
              value={id_number}
              onChangeText={setIdNumber}
              placeholder="T.C. Kimlik"
              keyboardType="number-pad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Adres">
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Adres"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
        </SectionCard>

        <SectionCard title="Acil durum" subtitle="Birinci ve ikinci yakın kişi." icon="medkit-outline">
          <Field label="1. yakın — ad soyad">
            <TextInput
              style={styles.input}
              value={emergency_contact_name}
              onChangeText={setEmergencyContactName}
              placeholder="Ad Soyad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="1. yakın — telefon">
            <TextInput
              style={styles.input}
              value={emergency_contact_phone}
              onChangeText={setEmergencyContactPhone}
              placeholder="0532 111 22 33"
              keyboardType="phone-pad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="2. yakın — ad soyad">
            <TextInput
              style={styles.input}
              value={emergency_contact2_name}
              onChangeText={setEmergencyContact2Name}
              placeholder="Ad Soyad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="2. yakın — telefon">
            <TextInput
              style={styles.input}
              value={emergency_contact2_phone}
              onChangeText={setEmergencyContact2Phone}
              placeholder="05xx xxx xx xx"
              keyboardType="phone-pad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
        </SectionCard>

        <SectionCard title="İşletme ve görev" subtitle="Organizasyon, rol ve çalışma profili." icon="briefcase-outline">
          <Field label="İşletme">
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
          </Field>

          <View style={styles.rowSwitch}>
            <Text style={styles.switchLabel}>{isAdmin ? 'Tam admin (tüm yönetim paneli)' : 'Tam admin kapalı'}</Text>
            <Switch
              value={isAdmin}
              onValueChange={toggleFullAdmin}
              trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.hintInline}>
            {isAdmin ? 'Bu kullanıcı tam admin yetkisine sahip.' : 'Kapalıysa kullanıcı yönetim panelini görmez.'}
          </Text>

          {!isAdmin ? (
            <Field label="Rol">
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
            </Field>
          ) : (
            <Text style={styles.hint}>
              Tam admin açıkken rol otomatik <Text style={{ fontWeight: '700' }}>admin</Text> olur. Kapatırsanız önceki rolüne döner.
            </Text>
          )}

          <Field label="Departman">
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
          </Field>

          <Field label="Pozisyon">
            <TextInput
              style={styles.input}
              value={position}
              onChangeText={setPosition}
              placeholder="Pozisyon"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="İşe başlama tarihi">
            <TextInput
              style={styles.input}
              value={hire_date}
              onChangeText={setHireDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Kıdem notu (profil alt metni)">
            <TextInput
              style={styles.input}
              value={tenure_note}
              onChangeText={setTenureNote}
              placeholder="Örn: Ön büro kıdem sorumlusu"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Personel no">
            <TextInput
              style={styles.input}
              value={personnel_no}
              onChangeText={setPersonnelNo}
              placeholder="Personel no"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Ofis / konum">
            <TextInput
              style={styles.input}
              value={office_location}
              onChangeText={setOfficeLocation}
              placeholder="Örn: 2. Kat Ofisi"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Hakkında">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={bio}
              onChangeText={setBio}
              placeholder="Personel hakkında kısa bilgi. Link eklerseniz profilde tıklanabilir görünür."
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />
          </Field>
          <Field label="Başarılar (virgülle)">
            <TextInput
              style={styles.input}
              value={achievements}
              onChangeText={setAchievements}
              placeholder="Örn: Ayın Personeli 2024, En İyi Müşteri Yorumu"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Geçmiş iş deneyimi">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={previous_work_experience}
              onChangeText={setPreviousWorkExperience}
              placeholder={'Örn:\n- 2021-2023 Resepsiyon\n- 2023-2025 Ön Büro'}
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />
          </Field>
        </SectionCard>

        <SectionCard title="Maaş ve SGK" icon="cash-outline">
          <Field label="Maaş (TL)">
            <TextInput
              style={styles.input}
              value={salary}
              onChangeText={setSalary}
              placeholder="Maaş"
              keyboardType="decimal-pad"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="SGK no">
            <TextInput
              style={styles.input}
              value={sgk_no}
              onChangeText={setSgkNo}
              placeholder="SGK no"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
        </SectionCard>

        <SectionCard title="İK ve sözleşme" subtitle="Sözleşme, çıkış, sertifika ve uyumluluk." icon="document-text-outline">
          <Field label="Sözleşme tipi">
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
          </Field>
          <Field label="İşten çıkış tarihi (varsa)">
            <TextInput
              style={styles.input}
              value={termination_date}
              onChangeText={setTerminationDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Dahili hat">
            <TextInput
              style={styles.input}
              value={internal_extension}
              onChangeText={setInternalExtension}
              placeholder="Örn: 204"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <Field label="Sertifikalar / geçerlilik">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={certifications_summary}
              onChangeText={setCertificationsSummary}
              placeholder={'İlk yardım — 2026-12-01\nHijyen — 2025-06-15'}
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />
          </Field>
          <Field label="KVKK onay tarihi">
            <TextInput
              style={styles.input}
              value={kvkk_consent_at}
              onChangeText={setKvkkConsentAt}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={adminTheme.colors.textMuted}
            />
          </Field>
          <View style={styles.rowSwitch}>
            <Text style={styles.switchLabel}>Ehliyet / araç kullanabilir</Text>
            <Switch
              value={drives_vehicle}
              onValueChange={setDrivesVehicle}
              trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </SectionCard>

        <SectionCard title="Çalışma düzeni" subtitle="Vardiya ve haftalık günler." icon="time-outline">
          <Field label="Vardiya">
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
          </Field>
          <Field label="Çalışma günleri">
            <View style={styles.chips}>
              {DAYS.map((d) => (
                <TouchableOpacity
                  key={d.value}
                  style={[styles.chip, work_days.includes(d.value) && styles.chipActive]}
                  onPress={() => toggleDay(d.value)}
                >
                  <Text style={[styles.chipText, work_days.includes(d.value) && styles.chipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
        </SectionCard>

        <SectionCard
          title="Uygulama yetkileri"
          subtitle="Modül erişimleri ve gizlilik. Detaylı izin listesini gerektiğinde açın."
          icon="phone-portrait-outline"
        >
          <View style={styles.rowSwitch}>
            <Text style={styles.switchLabel}>Misafirden mesaj alamaz</Text>
            <Switch
              value={guestMessagesBlocked}
              onValueChange={toggleGuestMessagesBlocked}
              trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.hintInline}>
            Açıksa misafir ekranında güvenlik uyarısı gösterilir.
          </Text>

          <View style={[styles.rowSwitch, { marginTop: 10 }]}>
            <Text style={styles.switchLabel}>Gizli profil</Text>
            <Switch
              value={profileHiddenByAdmin}
              onValueChange={setProfileHiddenByAdmin}
              trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
          <Text style={styles.hintInline}>
            Açıksa yalnızca fotoğraf ve maskeli ad görünür.
          </Text>

          <TouchableOpacity
            style={styles.expandToggle}
            onPress={() => setPermissionsExpanded((v) => !v)}
            activeOpacity={0.75}
          >
            <Text style={styles.expandToggleText}>
              {permissionsExpanded
                ? 'Modül izinlerini gizle'
                : `Modül izinlerini göster (${APP_PERMISSIONS.filter((p) => p.key !== 'misafir_mesaj_alabilir').length} kalem)`}
            </Text>
            <Ionicons name={permissionsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={adminTheme.colors.primary} />
          </TouchableOpacity>

          {permissionsExpanded
            ? APP_PERMISSIONS.filter((p) => p.key !== 'misafir_mesaj_alabilir').map((p) => (
                <TouchableOpacity key={p.key} style={styles.checkRow} onPress={() => togglePermission(p.key)} activeOpacity={0.7}>
                  <Ionicons
                    name={app_permissions[p.key] ? 'checkmark-circle' : 'ellipse-outline'}
                    size={22}
                    color={app_permissions[p.key] ? adminTheme.colors.primary : adminTheme.colors.textMuted}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={styles.checkLabel}>{p.label}</Text>
                </TouchableOpacity>
              ))
            : null}

          <View style={[styles.rowSwitch, { marginTop: 12 }]}>
            <Text style={styles.switchLabel}>Hesap aktif</Text>
            <Switch
              value={is_active}
              onValueChange={setIsActive}
              trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
              thumbColor="#fff"
            />
          </View>
        </SectionCard>

        <SectionCard
          title="Menü kısıtlamaları"
          subtitle="Yetki verilmiş olsa bile hamburger menüde gizlenir. Doğrudan bağlantı erişimini kapatmaz."
          icon="menu-outline"
        >
          {!supportsHiddenMenuColumn ? (
            <Text style={styles.hintInline}>
              Veritabanı migration 296 uygulanmadı; menü kısıtlaması kaydedilemez.
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.expandToggle}
            onPress={() => setMenuRestrictionsExpanded((v) => !v)}
            activeOpacity={0.75}
            disabled={!supportsHiddenMenuColumn}
          >
            <Text style={styles.expandToggleText}>
              {menuRestrictionsExpanded
                ? 'Menü öğelerini gizle'
                : `Menüden gizlenecek öğeler (${hiddenMenuItemIds.length} seçili)`}
            </Text>
            <Ionicons
              name={menuRestrictionsExpanded ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={adminTheme.colors.primary}
            />
          </TouchableOpacity>
          {menuRestrictionsExpanded && supportsHiddenMenuColumn
            ? (['nav', 'staff', 'hotel', 'ops', 'admin'] as StaffMenuCatalogSection[]).map((sectionId) => (
                <View key={sectionId} style={{ marginTop: 10 }}>
                  <Text style={styles.menuSectionHeading}>{STAFF_MENU_SECTION_LABELS_TR[sectionId]}</Text>
                  {menuCatalogBySection[sectionId].map((entry) => {
                    const hidden = hiddenMenuItemIds.includes(entry.id);
                    return (
                      <TouchableOpacity
                        key={entry.id}
                        style={styles.checkRow}
                        onPress={() => toggleHiddenMenuItem(entry.id)}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name={hidden ? 'eye-off-outline' : 'eye-outline'}
                          size={22}
                          color={hidden ? adminTheme.colors.warning ?? '#b45309' : adminTheme.colors.textMuted}
                          style={{ marginRight: 10 }}
                        />
                        <Text style={[styles.checkLabel, hidden && styles.checkLabelMuted]}>{entry.labelTr}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))
            : null}
        </SectionCard>

        <SectionCard title="Doğrulama rozeti" subtitle="Mavi veya sarı tik; kaldırmak için Yok seçin." icon="checkmark-circle-outline">
          <Field label="Rozet seçimi">
            <View style={styles.chips}>
              <TouchableOpacity
                style={[styles.chip, verification_badge === '' && styles.chipActive]}
                onPress={() => setVerificationBadge('')}
              >
                <Text style={[styles.chipText, verification_badge === '' && styles.chipTextActive]}>Yok</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, verification_badge === 'blue' && styles.chipActive]}
                onPress={() => setVerificationBadge('blue')}
              >
                <Text style={[styles.chipText, verification_badge === 'blue' && styles.chipTextActive]}>Mavi tik</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.chip, verification_badge === 'yellow' && styles.chipActive]}
                onPress={() => setVerificationBadge('yellow')}
              >
                <Text style={[styles.chipText, verification_badge === 'yellow' && styles.chipTextActive]}>Sarı tik</Text>
              </TouchableOpacity>
            </View>
          </Field>
        </SectionCard>

        <SectionCard
          title="Resmi uyarı"
          subtitle="Kalıcı kayıt; sözlü ve üzeri seviyede tam ekran onay. Yıldızlı değerlendirme ayrı kayıttır."
          icon="warning-outline"
          variant="danger"
        >
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
            <ActivityIndicator size="small" color={adminTheme.colors.error} style={{ marginVertical: 10 }} />
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
                    {w.subject_line?.trim() ? <Text style={styles.warnSubject}>{w.subject_line.trim()}</Text> : null}
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
        </SectionCard>

        {isAdmin ? (
          <SectionCard title="Yönetim değerlendirmesi" subtitle="Yıldızlı kayıt; personel kendi ekranında görür." icon="star-outline">
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => router.push(`/admin/staff/evaluation/${id}`)}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryButtonText}>Değerlendirme ekranına git</Text>
            </TouchableOpacity>
          </SectionCard>
        ) : null}

        <SectionCard title="Admin notları" subtitle="Yalnızca yönetici görür." icon="clipboard-outline">
          <Field label="Not">
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Çalışkan, terfi düşünülebilir..."
              placeholderTextColor={adminTheme.colors.textMuted}
              multiline
            />
          </Field>
        </SectionCard>

        <SectionCard title="Personel evrakları" subtitle="Sabıka ve diğer belgeler." icon="attach-outline">
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.primaryButton, styles.actionRowBtn]}
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
              <Text style={styles.primaryButtonText}>Evrak yükle</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.outlineButton, styles.actionRowBtn]} onPress={loadStaffDocuments} activeOpacity={0.8}>
              <Text style={styles.outlineButtonText}>Yenile</Text>
            </TouchableOpacity>
          </View>
          {staffDocsLoading ? (
            <ActivityIndicator size="small" color={adminTheme.colors.primary} style={{ marginTop: 8 }} />
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
                      <Text style={styles.docTitle} numberOfLines={1}>
                        {doc.title}
                      </Text>
                      <Text style={styles.docMeta} numberOfLines={1}>
                        {ver?.file_name ?? 'Dosya'} · {new Date(doc.updated_at).toLocaleDateString('tr-TR')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </SectionCard>

        <SectionCard title="Personel PDF" subtitle="Önizleme, indirme ve yazıcı e-postası." icon="print-outline">
          <TouchableOpacity style={styles.secondaryPill} onPress={previewPdf} activeOpacity={0.85}>
            <Ionicons name="eye-outline" size={18} color={adminTheme.colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.secondaryPillText}>Önizle / yazdır</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryPill} onPress={downloadPdf} activeOpacity={0.85}>
            <Ionicons name="download-outline" size={18} color={adminTheme.colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.secondaryPillText}>Oluştur / indir</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryPill} onPress={sendToPrinter} activeOpacity={0.85}>
            <Ionicons name="mail-outline" size={18} color={adminTheme.colors.primary} style={{ marginRight: 8 }} />
            <Text style={styles.secondaryPillText}>Yazıcıya e-posta</Text>
          </TouchableOpacity>
        </SectionCard>

        <View style={styles.footerCard}>
          {saving ? (
            <ActivityIndicator size="large" color={adminTheme.colors.primary} style={{ marginVertical: 16 }} />
          ) : (
            <>
              <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={saving} activeOpacity={0.88}>
                <View style={styles.primaryButtonInner}>
                  <Ionicons name="save-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryButtonText}>Kaydet</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
                <Text style={styles.secondaryButtonText}>İptal</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
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
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: adminTheme.spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text, marginTop: 20, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 6 },
  heroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: adminTheme.spacing.lg,
    marginBottom: adminTheme.spacing.lg,
    gap: adminTheme.spacing.md,
    ...adminTheme.shadow.md,
  },
  heroAvatar: {
    width: 56,
    height: 56,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroAvatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroTextCol: { flex: 1, minWidth: 0 },
  heroName: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text, letterSpacing: -0.3 },
  heroMeta: { marginTop: 4, fontSize: 14, color: adminTheme.colors.textMuted },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  heroPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: adminTheme.radius.full },
  heroPillOn: { backgroundColor: adminTheme.colors.successLight },
  heroPillOff: { backgroundColor: adminTheme.colors.surfaceTertiary },
  heroPillAdmin: { backgroundColor: adminTheme.colors.infoLight },
  heroPillText: { fontSize: 12, fontWeight: '700' },
  heroPillTextOn: { color: adminTheme.colors.success },
  heroPillTextOff: { color: adminTheme.colors.textMuted },
  heroPillTextAdmin: { color: adminTheme.colors.info, fontSize: 12, fontWeight: '700' },
  switchLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
    marginRight: 12,
    lineHeight: 20,
  },
  hintInline: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginTop: -8,
    marginBottom: 4,
    lineHeight: 17,
  },
  expandToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  expandToggleText: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.primary, flex: 1, marginRight: 8 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  actionRowBtn: { flex: 1, marginTop: 0 },
  outlineButton: {
    paddingVertical: 14,
    borderRadius: adminTheme.radius.md,
    borderWidth: 1.5,
    borderColor: adminTheme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: adminTheme.colors.surface,
  },
  outlineButtonText: { color: adminTheme.colors.primary, fontSize: 15, fontWeight: '700' },
  secondaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    marginBottom: 8,
  },
  secondaryPillText: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
  footerCard: {
    marginTop: 8,
    paddingTop: 4,
    paddingBottom: 8,
  },
  primaryButtonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  input: {
    backgroundColor: adminTheme.colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    padding: 14,
    fontSize: 16,
    color: adminTheme.colors.text,
    marginBottom: 0,
  },
  textArea: { minHeight: 88, textAlignVertical: 'top' },
  rowSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 0 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: adminTheme.radius.sm,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: { backgroundColor: adminTheme.colors.primary, borderColor: adminTheme.colors.primary },
  chipText: { color: adminTheme.colors.textSecondary, fontWeight: '600', fontSize: 13 },
  chipTextActive: { color: '#fff' },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: adminTheme.radius.sm,
  },
  checkbox: { fontSize: 18, marginRight: 10 },
  checkLabel: { fontSize: 14, color: adminTheme.colors.text, flex: 1, lineHeight: 20 },
  checkLabelMuted: { color: adminTheme.colors.textMuted, textDecorationLine: 'line-through' },
  menuSectionHeading: {
    fontSize: 12,
    fontWeight: '700',
    color: adminTheme.colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  primaryButton: {
    backgroundColor: adminTheme.button.primaryBg,
    paddingVertical: 16,
    borderRadius: adminTheme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    ...adminTheme.shadow.sm,
  },
  primaryButtonText: { color: adminTheme.button.primaryText, fontSize: 17, fontWeight: '700' },
  secondaryButton: { paddingVertical: 14, alignItems: 'center' },
  secondaryButtonText: { color: adminTheme.colors.textMuted, fontSize: 16, fontWeight: '600' },
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
