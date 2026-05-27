import { View, Text, StyleSheet, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { adminTheme } from '@/constants/adminTheme';

/** Cihaz / uygulama izinleri: Uygulamanın kullanıcıdan veya sistemden aldığı izinler */
const DEVICE_PERMISSIONS = [
  {
    key: 'camera',
    icon: 'camera-outline' as const,
    title: 'Kamera',
    reason: 'QR kod okutma (sözleşme onayı, check-in), stok barkodu tarama.',
    ios: 'NSCameraUsageDescription',
    android: 'android.permission.CAMERA',
  },
  {
    key: 'photo_library',
    icon: 'images-outline' as const,
    title: 'Fotoğraf / Galeri',
    reason: 'Profil fotoğrafı ve belge yükleme.',
    ios: 'NSPhotoLibraryUsageDescription',
    android: '(Medya erişimi)',
  },
  {
    key: 'location',
    icon: 'location-outline' as const,
    title: 'Konum',
    reason: 'Uygulama açıkken oteli haritada göstermek ve otele yaklaştığınızda check-in için kolaylık sunmak üzere konum kullanılır.',
    ios: 'NSLocationWhenInUseUsageDescription',
    android: 'ACCESS_FINE_LOCATION',
  },
  {
    key: 'notifications',
    icon: 'notifications-outline' as const,
    title: 'Bildirimler',
    reason: 'Anlık bildirimler (mesaj, rezervasyon, acil duyuru).',
    ios: 'Push Notifications',
    android: 'expo-notifications',
  },
];

/** Personel uygulama yetkileri: Admin tarafından çalışana verilen yetkiler (staff.app_permissions) */
const STAFF_APP_PERMISSIONS = [
  { key: 'stok_giris', label: 'Stok girişi yapabilir', desc: 'Stok giriş/çıkış ve barkod okutma.' },
  { key: 'mesajlasma', label: 'Müşterilerle mesajlaşabilir', desc: 'Misafirlerle sohbet ve mesaj görüntüleme.' },
  { key: 'misafir_mesaj_alabilir', label: 'Müşteriden direkt mesaj alabilir', desc: 'Kapalıysa misafir yeni sohbet başlatamaz ve mevcut sohbete yeni mesaj gönderemez.' },
  { key: 'video_paylasim', label: 'Video/resim paylaşabilir', desc: 'Feed ve sohbetlerde medya paylaşımı.' },
  { key: 'ekip_sohbet', label: 'Ekip sohbetini görebilir', desc: 'Tüm personel sohbet kanalına erişim.' },
  { key: 'dokuman_yukle', label: 'Doküman yükleyebilir / yönetebilir', desc: 'Doküman Yönetimi modülünde belge yükleme, versiyon ekleme ve yetki kapsamına göre görüntüleme.' },
  {
    key: 'gorev_ata',
    label: 'Görev atayabilir',
    desc: 'Admin verdiği sürece diğer personel için görev oluşturur; admin bu kutuyu kapatana kadar yetki devam eder. Tam yönetim paneli değil, sadece görev listesi ve atama ekranı açılır.',
  },
  { key: 'satis_komisyon', label: 'Satış/komisyon modülü', desc: 'Referanslı rezervasyon, ödeme yeri ve komisyon hakedişi ekranlarına erişim.' },
  { key: 'personel_ekle', label: 'Personel ekleyebilir', desc: 'Yeni çalışan hesabı oluşturma (genelde yönetici).' },
  { key: 'raporlar', label: 'Raporları görebilir', desc: 'Raporlar ve HMB raporlarına erişim.' },
  { key: 'tum_sozlesmeler', label: 'Tüm sözleşmeleri görüntüleyebilir', desc: 'Tüm müşteri sözleşmelerine tarih filtresiyle erişim; telefon ve WhatsApp iletişim.' },
  { key: 'kahvalti_teyit_olustur', label: 'Kahvaltı teyidi oluşturabilir', desc: 'Mutfak/restoran + bu yetki: günlük kahvaltı teyit kaydı (foto, kişi sayısı).' },
  { key: 'kahvalti_teyit_departman', label: 'Kahvaltı teyitleri (mutfak) görüntüleme', desc: 'Aynı işletmede mutfak/restoran personelinin tüm kahvaltı kayıtlarını görür ve düzenler.' },
  { key: 'kahvalti_teyit_onayla', label: 'Kahvaltı teyitlerini onaylama', desc: 'Kayıtları onaylar (onay zamanı ve onaylayan olarak saklanır).' },
  { key: 'kahvalti_rapor', label: 'Kahvaltı teyit raporları (salt okunur)', desc: 'İşletmedeki tüm kahvaltı teyit geçmişini görür; onay, red veya puanlama yapamaz. Admin istediği personele verebilir.' },
  {
    key: 'yarin_oda_temizlik_listesi',
    label: 'Yarın temizlenecek odalar listesi',
    desc: 'Ertesi gün temizlenecek oda listesini seçili personele gönderir ve planı yönetir.',
  },
  {
    key: 'kbs_mrz_scan',
    label: 'Pasaport / MRZ tarama (KBS)',
    desc: 'Kimlik ve pasaport MRZ okuma, KBS tarama ekranı ve header MRZ simgesi.',
  },
  {
    key: 'teknik_varlik_yonetimi',
    label: 'Akıllı Tesis Envanteri (yönetim)',
    desc: 'Bina/lokasyon/varlık tanımlama, QR ve etiket çıktısı; yönetim paneli menüsü.',
  },
  {
    key: 'teknik_varliklar',
    label: 'Teknik QR (operasyon)',
    desc: 'QR okutma, talimatlar, müdahale kaydı ve durum güncelleme.',
  },
  {
    key: 'teknik_varliklar_okuma',
    label: 'Teknik QR (salt okunur)',
    desc: 'QR okutup talimatları görür; kayıt ve durum değişikliği yapamaz.',
  },
  {
    key: 'tesis_gunlugu',
    label: 'Tesis günlüğü',
    desc: 'Değişiklik, zimmet, emanet kayıtları; foto ve video yükleme. Hamburger menüde yeni kayıt butonu görünür.',
  },
];

/** Geçiş kontrolü yetkileri */
const ACCESS_PERMISSIONS = [
  { title: 'Kapılar', desc: 'Oda kapıları, otopark, havuz, personel girişi tanımlama.' },
  { title: 'Kart tanımlama', desc: 'Misafir/personel kartı, geçerlilik tarihi, hangi kapılar.' },
  { title: 'Personel kapı yetkileri', desc: 'Kim hangi kapıyı hangi saatte açabilir (staff_door_permissions).' },
  { title: 'Kapı logları', desc: 'Kim ne zaman hangi kapıyı açtı, yetkisiz denemeler.' },
];

function PermissionRow({
  icon,
  title,
  reason,
  sub,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  reason: string;
  sub?: string;
}) {
  return (
    <View style={styles.permRow}>
      <View style={styles.permIconWrap}>
        <Ionicons name={icon} size={22} color={adminTheme.colors.primary} />
      </View>
      <View style={styles.permBody}>
        <Text style={styles.permTitle}>{title}</Text>
        <Text style={styles.permReason}>{reason}</Text>
        {sub ? <Text style={styles.permSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function AdminPermissionsScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Izin ve Yetki Mimarisi</Text>
        <Text style={styles.intro}>
          Bu ekran cihaz izinleri, personel uygulama yetkileri ve gecis kontrolu yetkilerini tek bir profesyonel
          referans olarak sunar.
        </Text>
      </View>

      <Text style={styles.sectionTitle}>Cihaz / uygulama izinleri</Text>
      <Text style={styles.sectionDesc}>
        Bu izinler iOS/Android sisteminden alinir. Istem metinleri app.json ve plugin konfiglerinde tanimlanir.
      </Text>
      {DEVICE_PERMISSIONS.map((p) => (
        <PermissionRow
          key={p.key}
          icon={p.icon}
          title={p.title}
          reason={p.reason}
          sub={Platform.OS === 'web' ? `iOS: ${p.ios} | Android: ${p.android}` : undefined}
        />
      ))}

      <Text style={styles.sectionTitle}>Personel uygulama yetkileri</Text>
      <Text style={styles.sectionDesc}>
        Admin panelinden çalışan düzenlerken atanır (staff.app_permissions). Çalışan ekle / düzenle ekranında checkbox olarak görünür.
      </Text>
      {STAFF_APP_PERMISSIONS.map((p) => (
        <View key={p.key} style={styles.staffPermRow}>
          <Text style={styles.staffPermLabel}>{p.label}</Text>
          <Text style={styles.staffPermDesc}>{p.desc}</Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Gecis kontrolu yetkileri</Text>
      <Text style={styles.sectionDesc}>
        Kapılar, kartlar ve personel-kapı eşleştirmesi. Geçiş kontrolü menüsünden yönetilir.
      </Text>
      {ACCESS_PERMISSIONS.map((p) => (
        <View key={p.title} style={styles.accessRow}>
          <Text style={styles.accessTitle}>{p.title}</Text>
          <Text style={styles.accessDesc}>{p.desc}</Text>
        </View>
      ))}

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Not: Cihaz izni "verildi/kapali" gibi durumlar canli kullanici ekraninda takip edilir; bu ekran ise yonetsel
          dokumantasyon amaclidir.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  content: {
    padding: 20,
    paddingBottom: 48,
  },
  hero: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.lg,
    padding: 14,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: adminTheme.colors.text,
    marginBottom: 8,
  },
  intro: {
    fontSize: 15,
    color: adminTheme.colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  sectionDesc: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    marginBottom: 12,
    lineHeight: 19,
  },
  permRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: adminTheme.colors.surface,
    padding: 14,
    borderRadius: adminTheme.radius.md,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  permIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  permBody: { flex: 1, minWidth: 0 },
  permTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: adminTheme.colors.text,
    marginBottom: 4,
  },
  permReason: {
    fontSize: 14,
    color: adminTheme.colors.textSecondary,
    lineHeight: 20,
  },
  permSub: {
    fontSize: 11,
    color: adminTheme.colors.textMuted,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  staffPermRow: {
    backgroundColor: adminTheme.colors.surface,
    padding: 12,
    borderRadius: adminTheme.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  staffPermLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  staffPermDesc: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    marginTop: 4,
  },
  accessRow: {
    backgroundColor: adminTheme.colors.surface,
    padding: 12,
    borderRadius: adminTheme.radius.md,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  accessTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  accessDesc: {
    fontSize: 13,
    color: adminTheme.colors.textSecondary,
    marginTop: 4,
  },
  footer: {
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: adminTheme.colors.border,
  },
  footerText: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    lineHeight: 18,
  },
});
