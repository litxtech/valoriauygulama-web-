import { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  Platform,
  TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminTheme } from '@/constants/adminTheme';
import { openWhatsApp, openTel, openMailto, whatsappUrlFromPhone } from '@/lib/contactLaunch';
import {
  ensureOnlineBookingPdf,
  getOnlineBookingById,
  parseOnlineBookingExtras,
  updateOnlineBookingStatus,
  updateOnlineBookingFields,
  buildAdminGuestWhatsAppText,
  nightsBetweenBookingDates,
  bookingStatusLabel,
  bookingStatusTone,
  formatBookingDate,
  formatBookingDateRange,
  decideOnlineBookingOffer,
  type OnlineBookingRow,
} from '@/lib/onlineBooking';

function badgeColors(booking: Pick<OnlineBookingRow, 'status' | 'paid_at' | 'offer_status'>) {
  const tone = bookingStatusTone(booking);
  if (tone === 'warn') return { bg: '#ffedd5', fg: '#9a3412' };
  if (tone === 'ok') return { bg: '#d1fae5', fg: '#065f46' };
  if (tone === 'bad') return { bg: '#fee2e2', fg: '#991b1b' };
  return { bg: '#e2e8f0', fg: '#334155' };
}

function money(n: number | null) {
  if (n == null || !Number.isFinite(n)) return '—';
  return `₺${Math.round(n).toLocaleString('tr-TR')}`;
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value.trim()) return null;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

type EditDraft = {
  guest_full_name: string;
  guest_phone: string;
  guest_email: string;
  guest_note: string;
  guest_id_number: string;
  guest_birth_date: string;
  check_in_date: string;
  check_out_date: string;
  adults: string;
  children: string;
  quoted_price_per_night: string;
  quoted_total: string;
};

function draftFromBooking(b: OnlineBookingRow): EditDraft {
  return {
    guest_full_name: b.guest_full_name ?? '',
    guest_phone: b.guest_phone ?? '',
    guest_email: b.guest_email ?? '',
    guest_note: b.guest_note ?? '',
    guest_id_number: b.guest_id_number ?? '',
    guest_birth_date: b.guest_birth_date ?? '',
    check_in_date: b.check_in_date ?? '',
    check_out_date: b.check_out_date ?? '',
    adults: String(b.adults ?? 1),
    children: String(b.children ?? 0),
    quoted_price_per_night: b.quoted_price_per_night != null ? String(b.quoted_price_per_night) : '',
    quoted_total: b.quoted_total != null ? String(b.quoted_total) : '',
  };
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address' | 'numeric' | 'number-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#94a3b8"
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
      />
    </View>
  );
}

export default function AdminBookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [booking, setBooking] = useState<OnlineBookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const editingRef = useRef(false);
  editingRef.current = editing;

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const row = await getOnlineBookingById(String(id));
      setBooking(row);
      if (!editingRef.current) {
        setDraft(row ? draftFromBooking(row) : null);
      }
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Yüklenemedi');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load])
  );

  const setStatus = async (status: 'confirmed' | 'cancelled') => {
    if (!booking) return;
    const doUpdate = async () => {
      setBusy(true);
      try {
        await updateOnlineBookingStatus(booking.id, status);
        setEditing(false);
        await load();
      } catch (e) {
        Alert.alert('Hata', (e as Error)?.message || 'Güncellenemedi');
      } finally {
        setBusy(false);
      }
    };

    if (status === 'cancelled') {
      Alert.alert('Rezervasyonu iptal et', `${booking.guest_full_name} — emin misiniz?`, [
        { text: 'Vazgeç', style: 'cancel' },
        { text: 'İptal et', style: 'destructive', onPress: () => void doUpdate() },
      ]);
      return;
    }
    await doUpdate();
  };

  const decideOffer = async (approve: boolean) => {
    if (!booking) return;
    const amount = booking.offer_amount != null ? money(booking.offer_amount) : '—';
    Alert.alert(
      approve ? 'Teklifi onayla' : 'Teklifi reddet',
      approve
        ? `${amount} teklifi kabul edilecek; ödenecek tutar buna çekilir ve misafire bildirim gider.`
        : 'Teklif reddedilecek ve misafire bildirim gider.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: approve ? 'Onayla' : 'Reddet',
          style: approve ? 'default' : 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                await decideOnlineBookingOffer({ bookingId: booking.id, approve });
                await load();
              } catch (e) {
                Alert.alert('Hata', (e as Error)?.message || 'Karar kaydedilemedi');
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  };

  const startEdit = () => {
    if (!booking) return;
    setDraft(draftFromBooking(booking));
    setEditing(true);
  };

  const cancelEdit = () => {
    if (booking) setDraft(draftFromBooking(booking));
    setEditing(false);
  };

  const saveEdit = async () => {
    if (!booking || !draft) return;
    const name = draft.guest_full_name.trim();
    const phone = draft.guest_phone.trim();
    if (!name) {
      Alert.alert('Eksik', 'Misafir adı gerekli');
      return;
    }
    if (!phone) {
      Alert.alert('Eksik', 'Telefon gerekli');
      return;
    }
    const checkIn = draft.check_in_date.trim();
    const checkOut = draft.check_out_date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
      Alert.alert('Tarih', 'Tarihler YYYY-AA-GG formatında olmalı (ör. 2026-08-15)');
      return;
    }
    if (nightsBetweenBookingDates(checkIn, checkOut) < 1) {
      Alert.alert('Tarih', 'Çıkış tarihi girişten sonra olmalı');
      return;
    }
    const adults = Number(draft.adults);
    const children = Number(draft.children);
    if (!Number.isFinite(adults) || adults < 1) {
      Alert.alert('Kişi', 'Yetişkin sayısı en az 1 olmalı');
      return;
    }

    const parseMoney = (s: string): number | null => {
      const t = s.trim().replace(',', '.');
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };

    setBusy(true);
    try {
      await updateOnlineBookingFields(booking.id, {
        guest_full_name: name,
        guest_phone: phone,
        guest_email: draft.guest_email.trim() || null,
        guest_note: draft.guest_note.trim() || null,
        guest_id_number: draft.guest_id_number.trim() || null,
        guest_birth_date: draft.guest_birth_date.trim() || null,
        check_in_date: checkIn,
        check_out_date: checkOut,
        adults,
        children: Number.isFinite(children) ? Math.max(0, children) : 0,
        quoted_price_per_night: parseMoney(draft.quoted_price_per_night),
        quoted_total: parseMoney(draft.quoted_total),
      });
      setEditing(false);
      await load();
      Alert.alert('Kaydedildi', 'Rezervasyon güncellendi.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message || 'Kaydedilemedi');
    } finally {
      setBusy(false);
    }
  };

  const openOrMakePdf = async () => {
    if (!booking) return;
    setPdfBusy(true);
    try {
      let url = booking.pdf_url;
      if (!url) {
        url = await ensureOnlineBookingPdf(booking);
        await load();
      }
      if (!url) {
        Alert.alert('PDF', 'PDF oluşturulamadı');
        return;
      }
      await Linking.openURL(url);
    } catch (e) {
      Alert.alert('PDF', (e as Error)?.message || 'Açılamadı');
    } finally {
      setPdfBusy(false);
    }
  };

  const regeneratePdf = async () => {
    if (!booking) return;
    setPdfBusy(true);
    try {
      const url = await ensureOnlineBookingPdf(booking);
      await load();
      if (!url) {
        Alert.alert('PDF', 'PDF oluşturulamadı');
        return;
      }
      Alert.alert('PDF hazır', 'Belge güncellendi.', [
        { text: 'Aç', onPress: () => void Linking.openURL(url) },
        { text: 'Tamam', style: 'cancel' },
      ]);
    } catch (e) {
      Alert.alert('PDF', (e as Error)?.message || 'Oluşturulamadı');
    } finally {
      setPdfBusy(false);
    }
  };

  if (loading && !booking) {
    return (
      <View style={[styles.root, styles.centered]}>
        <ActivityIndicator color={adminTheme.colors.primary} />
      </View>
    );
  }

  if (!booking) {
    return (
      <View style={[styles.root, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.empty}>Rezervasyon bulunamadı</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const badge = badgeColors(booking);
  const extras = parseOnlineBookingExtras(booking.extras);
  const extrasLabel = [
    extras.breakfast ? 'Kahvaltı' : null,
    extras.parking ? 'Otopark' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const roomTitle =
    booking.display_title && booking.capacity_label
      ? `${booking.display_title} · ${booking.capacity_label}`
      : booking.capacity_label || booking.room_label || 'Standart';
  const ref = booking.id.slice(0, 8).toUpperCase();
  const canContact = !!whatsappUrlFromPhone(booking.guest_phone) || !!booking.guest_phone?.trim();
  const canCancel = booking.status === 'pending' || booking.status === 'confirmed';
  const canConfirm = booking.status === 'pending';
  const canEdit = booking.status !== 'cancelled' && booking.status !== 'expired';

  return (
    <View style={[styles.root, { paddingTop: Platform.OS === 'web' ? 0 : 0 }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
      >
        <TouchableOpacity style={styles.navBack} onPress={() => router.back()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={22} color={adminTheme.colors.text} />
          <Text style={styles.navBackText}>Talepler</Text>
        </TouchableOpacity>

        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.ref}>REF {ref}</Text>
            <View style={[styles.badge, { backgroundColor: badge.bg }]}>
              <Text style={[styles.badgeText, { color: badge.fg }]}>{bookingStatusLabel(booking)}</Text>
            </View>
          </View>
          <Text style={styles.guestName}>{booking.guest_full_name}</Text>
          <Text style={styles.heroMeta}>
            {roomTitle} · {booking.nights_count} gece
          </Text>
          <Text style={styles.heroDates}>{formatBookingDateRange(booking.check_in_date, booking.check_out_date)}</Text>
          <Text style={styles.heroPrice}>{money(booking.quoted_total)}</Text>
          {!booking.paid_at ? (
            <Text style={styles.heroPayWarn}>Ödeme alınmadan kesin rezervasyon sayılmaz</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Misafirle iletişim</Text>
          <Text style={styles.cardHint}>WhatsApp, arama veya e-posta ile doğrudan ulaşın.</Text>
          <View style={styles.contactRow}>
            <TouchableOpacity
              style={[styles.contactBtn, styles.contactWa, !canContact && styles.disabled]}
              onPress={() =>
                void openWhatsApp(booking.guest_phone, buildAdminGuestWhatsAppText(booking))
              }
              disabled={!canContact}
              activeOpacity={0.88}
            >
              <Ionicons name="logo-whatsapp" size={18} color="#fff" />
              <Text style={styles.contactBtnText}>WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, styles.contactTel, !booking.guest_phone?.trim() && styles.disabled]}
              onPress={() => void openTel(booking.guest_phone)}
              disabled={!booking.guest_phone?.trim()}
              activeOpacity={0.88}
            >
              <Ionicons name="call-outline" size={18} color="#fff" />
              <Text style={styles.contactBtnText}>Ara</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.contactBtn, styles.contactMail, !booking.guest_email?.trim() && styles.disabled]}
              onPress={() => void openMailto(booking.guest_email || '')}
              disabled={!booking.guest_email?.trim()}
              activeOpacity={0.88}
            >
              <Ionicons name="mail-outline" size={18} color="#fff" />
              <Text style={styles.contactBtnText}>E-posta</Text>
            </TouchableOpacity>
          </View>
        </View>

        {editing && draft ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Rezervasyonu düzenle</Text>
            <Field
              label="Ad soyad"
              value={draft.guest_full_name}
              onChange={(v) => setDraft({ ...draft, guest_full_name: v })}
            />
            <Field
              label="Telefon"
              value={draft.guest_phone}
              onChange={(v) => setDraft({ ...draft, guest_phone: v })}
              keyboardType="phone-pad"
            />
            <Field
              label="E-posta"
              value={draft.guest_email}
              onChange={(v) => setDraft({ ...draft, guest_email: v })}
              keyboardType="email-address"
            />
            <Field
              label="TC kimlik"
              value={draft.guest_id_number}
              onChange={(v) => setDraft({ ...draft, guest_id_number: v })}
              keyboardType="number-pad"
            />
            <Field
              label="Doğum tarihi (YYYY-AA-GG)"
              value={draft.guest_birth_date}
              onChange={(v) => setDraft({ ...draft, guest_birth_date: v })}
              placeholder="1990-05-20"
            />
            <Field
              label="Giriş (YYYY-AA-GG)"
              value={draft.check_in_date}
              onChange={(v) => setDraft({ ...draft, check_in_date: v })}
              placeholder="2026-08-15"
            />
            <Field
              label="Çıkış (YYYY-AA-GG)"
              value={draft.check_out_date}
              onChange={(v) => setDraft({ ...draft, check_out_date: v })}
              placeholder="2026-08-17"
            />
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Yetişkin"
                  value={draft.adults}
                  onChange={(v) => setDraft({ ...draft, adults: v })}
                  keyboardType="number-pad"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Çocuk"
                  value={draft.children}
                  onChange={(v) => setDraft({ ...draft, children: v })}
                  keyboardType="number-pad"
                />
              </View>
            </View>
            <View style={styles.fieldRow}>
              <View style={{ flex: 1 }}>
                <Field
                  label="Gecelik ₺"
                  value={draft.quoted_price_per_night}
                  onChange={(v) => setDraft({ ...draft, quoted_price_per_night: v })}
                  keyboardType="numeric"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Toplam ₺"
                  value={draft.quoted_total}
                  onChange={(v) => setDraft({ ...draft, quoted_total: v })}
                  keyboardType="numeric"
                />
              </View>
            </View>
            <Field
              label="Misafir notu"
              value={draft.guest_note}
              onChange={(v) => setDraft({ ...draft, guest_note: v })}
              multiline
            />
            <View style={styles.editActions}>
              <TouchableOpacity
                style={[styles.editCancelBtn, busy && styles.disabled]}
                onPress={cancelEdit}
                disabled={busy}
              >
                <Text style={styles.editCancelText}>Vazgeç</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editSaveBtn, busy && styles.disabled]}
                onPress={() => void saveEdit()}
                disabled={busy}
                activeOpacity={0.88}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.editSaveText}>Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Misafir</Text>
                {canEdit ? (
                  <TouchableOpacity onPress={startEdit} hitSlop={8}>
                    <Text style={styles.editLink}>Düzenle</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Row label="Ad soyad" value={booking.guest_full_name} />
              <Row label="Telefon" value={booking.guest_phone} mono />
              <Row label="E-posta" value={booking.guest_email || ''} />
              <Row label="TC kimlik" value={booking.guest_id_number || '—'} mono />
              <Row label="Doğum tarihi" value={formatBookingDate(booking.guest_birth_date)} />
              <Row label="Not" value={booking.guest_note || ''} />
              {(booking.party_guests ?? []).map((p, i) => (
                <Row
                  key={`party-${i}`}
                  label={`Grup üyesi ${i + 1}`}
                  value={[
                    p.full_name,
                    p.id_number ? `TC ${p.id_number}` : null,
                    p.phone,
                    p.is_student ? 'öğrenci' : null,
                    p.university ? `üniv: ${p.university}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </View>

            <View style={styles.card}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>Konaklama</Text>
                {canEdit ? (
                  <TouchableOpacity onPress={startEdit} hitSlop={8}>
                    <Text style={styles.editLink}>Düzenle</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <Row label="Oda tipi" value={roomTitle} />
              <Row label="Giriş" value={formatBookingDate(booking.check_in_date)} />
              <Row label="Çıkış" value={formatBookingDate(booking.check_out_date)} />
              <Row
                label="Kişi"
                value={`${booking.adults} yetişkin${booking.children ? ` · ${booking.children} çocuk` : ''}`}
              />
              <Row label="Ekstra" value={extrasLabel || '—'} />
              <Row label="Gecelik" value={money(booking.quoted_price_per_night)} />
              <Row label="Liste tutarı" value={money(booking.list_total ?? booking.quoted_total)} />
              <Row
                label="Verilen indirim"
                value={
                  (booking.discount_amount ?? 0) > 0
                    ? `${money(booking.discount_amount)}${booking.campaign_code ? ` · ${booking.campaign_code}` : ''}`
                    : '—'
                }
              />
              <Row label="Ödenecek" value={money(booking.quoted_total)} />
              {booking.offer_amount != null ? (
                <Row
                  label="Pazarlık teklifi"
                  value={`${money(booking.offer_amount)}${
                    booking.offer_status ? ` · ${booking.offer_status}` : ''
                  }`}
                />
              ) : null}
              {booking.offer_note ? <Row label="Teklif notu" value={booking.offer_note} /> : null}
              <Row label="Kaynak" value={booking.source || '—'} />
              {booking.is_group ? <Row label="Grup rezervasyonu" value="Evet" /> : null}
              {booking.is_student_party ? (
                <Row label="Öğrenci" value={`Evet · ${booking.student_count ?? 0} kişi`} />
              ) : null}
              <Row
                label="Ödeme"
                value={
                  booking.paid_at
                    ? `Ödendi ${money(booking.paid_amount ?? booking.quoted_total)} · ${new Date(booking.paid_at).toLocaleString('tr-TR')}`
                    : 'Ödeme bekleniyor — rezervasyon henüz kesin değil'
                }
              />
              <Row label="Durum" value={bookingStatusLabel(booking)} />
              <Row label="Oluşturulma" value={new Date(booking.created_at).toLocaleString('tr-TR')} />
              {booking.room_number ? <Row label="İç oda no" value={booking.room_number} /> : null}
            </View>

            {booking.offer_status === 'pending' ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Pazarlık kararı</Text>
                <Text style={styles.cardHint}>
                  Misafir {money(booking.offer_amount)} teklif etti
                  {booking.offer_note ? ` — “${booking.offer_note}”` : ''}. Onaylarsanız ödenecek tutar
                  teklife çekilir ve uygulamaya bildirim gider.
                </Text>
                <View style={styles.offerActions}>
                  <TouchableOpacity
                    style={[styles.offerApprove, busy && styles.disabled]}
                    onPress={() => void decideOffer(true)}
                    disabled={busy}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.offerApproveText}>Teklifi onayla</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.offerReject, busy && styles.disabled]}
                    onPress={() => void decideOffer(false)}
                    disabled={busy}
                    activeOpacity={0.88}
                  >
                    <Text style={styles.offerRejectText}>Reddet</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>PDF belge</Text>
          <Text style={styles.cardHint}>
            Misafir kimliği, konaklama ve tutar bilgileri tek belgede. Hazır değilse burada oluşturabilirsiniz.
          </Text>
          <TouchableOpacity
            style={styles.pdfPrimary}
            onPress={() => void openOrMakePdf()}
            disabled={pdfBusy}
            activeOpacity={0.88}
          >
            {pdfBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="document-text" size={18} color="#fff" />
                <Text style={styles.pdfPrimaryText}>{booking.pdf_url ? 'PDF aç' : 'PDF oluştur ve aç'}</Text>
              </>
            )}
          </TouchableOpacity>
          {booking.pdf_url ? (
            <TouchableOpacity style={styles.pdfSecondary} onPress={() => void regeneratePdf()} disabled={pdfBusy}>
              <Text style={styles.pdfSecondaryText}>PDF’yi yeniden oluştur</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {(canConfirm || canCancel) && !editing ? (
          <View style={styles.actions}>
            {canConfirm ? (
              <TouchableOpacity
                style={[styles.confirmBtn, busy && styles.disabled]}
                onPress={() => void setStatus('confirmed')}
                disabled={busy}
                activeOpacity={0.88}
              >
                <Text style={styles.confirmText}>Onayla</Text>
              </TouchableOpacity>
            ) : null}
            {canCancel ? (
              <TouchableOpacity
                style={[styles.cancelBtn, busy && styles.disabled]}
                onPress={() => void setStatus('cancelled')}
                disabled={busy}
                activeOpacity={0.88}
              >
                <Text style={styles.cancelText}>İptal et</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 12 },
  navBack: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 12, alignSelf: 'flex-start' },
  navBackText: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  hero: {
    backgroundColor: '#0f172a',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
  },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  ref: { color: '#5eead4', fontWeight: '800', fontSize: 12, letterSpacing: 1 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  guestName: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.4 },
  heroMeta: { color: 'rgba(255,255,255,0.72)', fontWeight: '600', marginTop: 6, fontSize: 14 },
  heroDates: { color: 'rgba(255,255,255,0.88)', fontWeight: '700', marginTop: 4, fontSize: 15 },
  heroPrice: { color: '#5eead4', fontWeight: '900', fontSize: 22, marginTop: 14 },
  heroPayWarn: {
    marginTop: 10,
    color: '#fdba74',
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: adminTheme.colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  editLink: { color: '#0f766e', fontWeight: '800', fontSize: 13, marginBottom: 10 },
  cardHint: { fontSize: 13, color: adminTheme.colors.textMuted, lineHeight: 19, marginBottom: 14 },
  contactRow: { flexDirection: 'row', gap: 8 },
  contactBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  contactWa: { backgroundColor: '#128C7E' },
  contactTel: { backgroundColor: '#0f766e' },
  contactMail: { backgroundColor: '#334155' },
  contactBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.border,
  },
  rowLabel: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.textMuted, flexShrink: 0 },
  rowValue: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.text, flex: 1, textAlign: 'right' },
  mono: { fontVariant: ['tabular-nums'], letterSpacing: 0.3 },
  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: adminTheme.colors.textMuted, marginBottom: 6 },
  fieldRow: { flexDirection: 'row', gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
    backgroundColor: '#f8fafc',
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  editCancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
  },
  editCancelText: { color: '#475569', fontWeight: '800', fontSize: 15 },
  editSaveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#0f766e',
  },
  editSaveText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pdfPrimary: {
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  pdfPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pdfSecondary: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  pdfSecondaryText: { color: '#0f766e', fontWeight: '800', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  offerActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  offerApprove: {
    flex: 1,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  offerApproveText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  offerReject: {
    flex: 1,
    backgroundColor: '#fee2e2',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  offerRejectText: { color: '#991b1b', fontWeight: '800', fontSize: 14 },
  confirmBtn: {
    flex: 1,
    backgroundColor: '#0f766e',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#fee2e2',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelText: { color: '#b91c1c', fontWeight: '800', fontSize: 15 },
  disabled: { opacity: 0.6 },
  empty: { color: adminTheme.colors.textMuted, fontWeight: '700', fontSize: 16 },
  backLink: { marginTop: 16, padding: 12 },
  backLinkText: { color: '#0f766e', fontWeight: '800' },
});
