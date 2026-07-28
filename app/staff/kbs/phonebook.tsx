import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { KbsBrowseTabBar } from '@/components/kbs/KbsBrowseTabBar';
import { KbsHotelFilterBar } from '@/components/kbs/KbsHotelFilterBar';
import { KbsPersonAvatar } from '@/components/kbs/KbsPersonAvatar';
import {
  fetchKbsBrowseDocuments,
  listAccessibleHotels,
  resolveKbsMultiHotelContext,
  type KbsOpsHotel,
} from '@/lib/kbsMultiHotelCaptures';
import { filterKbsCapturesForViewer } from '@/lib/kbsCaptureHistory';
import {
  buildKbsPhoneContacts,
  callKbsGuestPhone,
  filterKbsPhoneContacts,
  groupKbsPhoneContactsByLetter,
  mergeKbsPhonePoolIntoContacts,
  openKbsGuestWhatsApp,
  type KbsPhoneContact,
} from '@/lib/kbsGuestPhoneContacts';
import {
  createKbsPhonePoolEntry,
  deleteKbsPhonePoolEntry,
  fetchKbsPhonePool,
} from '@/lib/kbsPhonePool';
import {
  findKbsDuplicatePhoneHits,
  formatKbsDuplicatePhoneWarning,
  pickPrimaryKbsDuplicatePhoneHit,
} from '@/lib/kbsDuplicatePhone';
import { isAbortLikeError, toSupabaseUserMessage } from '@/lib/supabaseTransientErrors';

function detailRoute(id: string): Href {
  return `/staff/kbs/capture/${id}` as Href;
}

function poolIdFromContact(item: KbsPhoneContact): string | null {
  if (item.source !== 'pool') return null;
  return item.id.startsWith('pool:') ? item.id.slice(5) : item.id;
}

function ContactRow({
  item,
  onOpen,
  onDeletePool,
}: {
  item: KbsPhoneContact;
  onOpen: () => void;
  onDeletePool?: () => void;
}) {
  const subtitleBits = [
    item.documentNumber ? `Pasaport ${item.documentNumber}` : null,
    item.roomNumber ? `Oda ${item.roomNumber}` : null,
    item.source === 'pool' ? 'Havuz' : null,
    item.note ? item.note : null,
  ].filter(Boolean);

  return (
    <Pressable
      style={[styles.row, item.source === 'pool' && styles.rowPool]}
      onPress={onOpen}
      onLongPress={onDeletePool}
      accessibilityRole="button"
    >
      <KbsPersonAvatar
        uri={item.frontImageUrl}
        size={48}
        fallbackLabel={item.nameless ? '#' : item.fullName}
      />
      <View style={styles.rowBody}>
        <Text style={[styles.name, item.nameless && styles.nameNameless]} numberOfLines={1}>
          {item.fullName}
        </Text>
        {(item.firstName || item.lastName) &&
        item.fullName !== [item.firstName, item.lastName].filter(Boolean).join(' ') ? (
          <Text style={styles.nameSub} numberOfLines={1}>
            {[item.firstName, item.lastName].filter(Boolean).join(' ')}
          </Text>
        ) : null}
        <Text style={styles.phone} numberOfLines={1}>
          {item.phone}
        </Text>
        {subtitleBits.length > 0 ? (
          <Text style={styles.meta} numberOfLines={1}>
            {subtitleBits.join(' · ')}
          </Text>
        ) : null}
      </View>
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionBtn, styles.callBtn]}
          onPress={() => void callKbsGuestPhone(item.phone)}
          hitSlop={6}
          accessibilityLabel="Ara"
        >
          <Ionicons name="call" size={16} color="#fff" />
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.waBtn]}
          onPress={() => void openKbsGuestWhatsApp(item.phone, item.countryCode)}
          hitSlop={6}
          accessibilityLabel="WhatsApp"
        >
          <Ionicons name="logo-whatsapp" size={16} color="#fff" />
        </Pressable>
      </View>
    </Pressable>
  );
}

export default function KbsPhonebookScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const staff = useAuthStore((s) => s.staff);
  const user = useAuthStore((s) => s.user);
  const authId = user?.id ?? staff?.auth_id;

  const [hotels, setHotels] = useState<KbsOpsHotel[]>([]);
  const [canViewAllHotels, setCanViewAllHotels] = useState(false);
  const [hotelFilter, setHotelFilter] = useState('all');
  const [contacts, setContacts] = useState<KbsPhoneContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [addPhone, setAddPhone] = useState('');
  const [addName, setAddName] = useState('');
  const [addNote, setAddNote] = useState('');
  const [saving, setSaving] = useState(false);
  const hotelIdRef = useRef<string | null>(null);
  const reloadSeqRef = useRef(0);

  const reload = useCallback(async () => {
    if (!authId) return;
    const seq = ++reloadSeqRef.current;
    try {
      setError(null);
      const ctx = await resolveKbsMultiHotelContext(authId);
      if (!ctx.ok) throw new Error(ctx.message);
      if (seq !== reloadSeqRef.current) return;

      hotelIdRef.current = ctx.hotelId;
      const hotelList = await listAccessibleHotels();
      setHotels(hotelList);
      setCanViewAllHotels(ctx.canViewAllHotels);

      const fetchHotelId =
        hotelFilter === 'all' ? (ctx.canViewAllHotels ? null : ctx.hotelId) : hotelFilter;

      const [data, pool] = await Promise.all([
        fetchKbsBrowseDocuments(authId, {
          hotelId: fetchHotelId,
          limit: ctx.canViewAllHotels && hotelFilter === 'all' ? 500 : 400,
        }),
        fetchKbsPhonePool({
          hotelId: fetchHotelId,
          hotelIds:
            !fetchHotelId && ctx.canViewAllHotels ? hotelList.map((h) => h.id) : undefined,
          limit: 500,
        }).catch(() => []),
      ]);
      if (seq !== reloadSeqRef.current) return;

      const scoped = filterKbsCapturesForViewer(data, staff, authId);
      const fromCaptures = buildKbsPhoneContacts(scoped);
      setContacts(mergeKbsPhonePoolIntoContacts(fromCaptures, pool));
    } catch (e) {
      if (seq !== reloadSeqRef.current) return;
      if (isAbortLikeError(e) && contacts.length > 0) return;
      setError(toSupabaseUserMessage(e, 'Rehber yüklenemedi'));
    } finally {
      if (seq !== reloadSeqRef.current) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, [authId, contacts.length, hotelFilter, staff]);

  useFocusEffect(
    useCallback(() => {
      void reload();
      return () => {
        reloadSeqRef.current += 1;
      };
    }, [reload])
  );

  useEffect(() => {
    if (!authId) return;
    setRefreshing(true);
    void reload();
  }, [hotelFilter, authId]);

  const filtered = useMemo(() => filterKbsPhoneContacts(contacts, query), [contacts, query]);
  const sections = useMemo(() => groupKbsPhoneContactsByLetter(filtered), [filtered]);
  const poolCount = useMemo(() => contacts.filter((c) => c.source === 'pool').length, [contacts]);

  const openAdd = () => {
    setAddPhone('');
    setAddName('');
    setAddNote('');
    setAddOpen(true);
  };

  const saveAdd = async (opts?: { force?: boolean }) => {
    if (saving) return;
    setSaving(true);
    try {
      const targetHotel =
        hotelFilter !== 'all' ? hotelFilter : hotelIdRef.current;

      if (!opts?.force) {
        const hits = await findKbsDuplicatePhoneHits({
          phone: addPhone,
          hotelId: targetHotel,
        });
        const hit = pickPrimaryKbsDuplicatePhoneHit(hits);
        if (hit) {
          setSaving(false);
          const buttons: Array<{
            text: string;
            style?: 'cancel' | 'default' | 'destructive';
            onPress?: () => void;
          }> = [
            { text: 'İptal', style: 'cancel' },
            {
              text: 'Yine de kaydet',
              onPress: () => {
                void saveAdd({ force: true });
              },
            },
          ];
          if (hit.documentId) {
            buttons.splice(1, 0, {
              text: 'Önceki kaydı aç',
              onPress: () => {
                router.push(detailRoute(hit.documentId!));
              },
            });
          }
          Alert.alert('✓ Daha önce eklendi', formatKbsDuplicatePhoneWarning(hit), buttons);
          return;
        }
      }

      const res = await createKbsPhonePoolEntry({
        phone: addPhone,
        displayName: addName.trim() || null,
        note: addNote.trim() || null,
        hotelId: targetHotel,
        createdByAuthId: authId,
        createdByStaffName: staff?.full_name ?? null,
      });
      if (!res.ok) {
        Alert.alert('Kaydedilemedi', res.message);
        return;
      }
      setAddOpen(false);
      setRefreshing(true);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const confirmDeletePool = (item: KbsPhoneContact) => {
    const pid = poolIdFromContact(item);
    if (!pid) return;
    Alert.alert('Numarayı sil', `${item.phone} rehberden kaldırılsın mı?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await deleteKbsPhonePoolEntry(pid);
            if (!res.ok) {
              Alert.alert('Silinemedi', res.message);
              return;
            }
            setContacts((prev) => prev.filter((c) => c.id !== item.id));
          })();
        },
      },
    ]);
  };

  const onRowOpen = (item: KbsPhoneContact) => {
    if (item.source === 'pool') {
      Alert.alert(
        item.nameless ? item.phone : item.fullName,
        [
          item.phone,
          item.note ? `Not: ${item.note}` : null,
          'Uzun basarak silebilirsin.',
        ]
          .filter(Boolean)
          .join('\n'),
        [
          { text: 'Ara', onPress: () => void callKbsGuestPhone(item.phone) },
          {
            text: 'WhatsApp',
            onPress: () => void openKbsGuestWhatsApp(item.phone, item.countryCode),
          },
          { text: 'Sil', style: 'destructive', onPress: () => confirmDeletePool(item) },
          { text: 'Kapat', style: 'cancel' },
        ]
      );
      return;
    }
    router.push(detailRoute(item.id));
  };

  if (loading && contacts.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Rehber yükleniyor…</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <KbsBrowseTabBar active="phonebook" />

      <KbsHotelFilterBar
        hotels={hotels}
        canViewAll={canViewAllHotels}
        value={hotelFilter}
        onChange={setHotelFilter}
      />

      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="İsim, telefon, pasaport, isimsiz…"
            placeholderTextColor={theme.colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd} activeOpacity={0.88}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <Text style={styles.countLine}>
        {filtered.length} kayıt
        {poolCount > 0 ? ` · ${poolCount} havuz` : ''}
        {query.trim() ? ` · “${query.trim()}”` : ''}
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void reload();
            }}
            tintColor={theme.colors.primary}
          />
        }
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
          </View>
        )}
        renderItem={({ item }) => (
          <ContactRow
            item={item}
            onOpen={() => onRowOpen(item)}
            onDeletePool={item.source === 'pool' ? () => confirmDeletePool(item) : undefined}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={36} color={theme.colors.textMuted} />
            <Text style={styles.emptyTitle}>Rehber boş</Text>
            <Text style={styles.emptyBody}>
              + ile telefon ekle (isim isteğe bağlı) veya kimlik çekerken numara kaydet.
            </Text>
            <TouchableOpacity style={styles.emptyAdd} onPress={openAdd}>
              <Text style={styles.emptyAddText}>Numara ekle</Text>
            </TouchableOpacity>
          </View>
        }
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
      />

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalDismiss} onPress={() => !saving && setAddOpen(false)} />
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Telefon havuzuna ekle</Text>
            <Text style={styles.modalHint}>İsim boş bırakılabilir — sadece numara kaydedilir.</Text>

            <Text style={styles.fieldLabel}>Telefon *</Text>
            <TextInput
              style={styles.fieldInput}
              value={addPhone}
              onChangeText={(t) => setAddPhone(t.replace(/[^\d+()\s-]/g, '').slice(0, 24))}
              placeholder="Örn. 0555 123 45 67"
              placeholderTextColor="#94a3b8"
              keyboardType="phone-pad"
              autoFocus
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>İsim / soyisim (isteğe bağlı)</Text>
            <TextInput
              style={styles.fieldInput}
              value={addName}
              onChangeText={setAddName}
              placeholder="Boş = isimsiz numara"
              placeholderTextColor="#94a3b8"
              autoCapitalize="words"
              editable={!saving}
            />

            <Text style={styles.fieldLabel}>Not (isteğe bağlı)</Text>
            <TextInput
              style={[styles.fieldInput, styles.fieldNote]}
              value={addNote}
              onChangeText={setAddNote}
              placeholder="Örn. tedarikçi, rezervasyon…"
              placeholderTextColor="#94a3b8"
              multiline
              editable={!saving}
            />

            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={() => void saveAdd()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Rehbere kaydet</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9', paddingHorizontal: 12, paddingTop: 8 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: '#f1f5f9' },
  loadingText: { fontSize: 14, fontWeight: '600', color: theme.colors.textMuted },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text, paddingVertical: 0 },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countLine: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  error: { color: '#b91c1c', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  listContent: { paddingBottom: 24 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center' },
  sectionHeader: {
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginTop: 4,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#475569' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 10,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowPool: { borderColor: '#99f6e4', backgroundColor: '#f0fdfa' },
  rowBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  nameNameless: { fontStyle: 'italic', color: '#64748b' },
  nameSub: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginTop: 1 },
  phone: { fontSize: 14, fontWeight: '700', color: '#0f766e', marginTop: 2 },
  meta: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginTop: 2 },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callBtn: { backgroundColor: theme.colors.primary },
  waBtn: { backgroundColor: '#25D366' },
  empty: { alignItems: 'center', paddingHorizontal: 28, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  emptyBody: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyAdd: {
    marginTop: 8,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyAddText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.45)' },
  modalDismiss: { flex: 1 },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 8,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 6,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: theme.colors.text },
  modalHint: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 4 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginTop: 4 },
  fieldInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: theme.colors.text,
    backgroundColor: '#f8fafc',
  },
  fieldNote: { minHeight: 64, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: 8,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.65 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
