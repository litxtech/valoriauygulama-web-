import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { CachedImage } from '@/components/CachedImage';
import type { PersonelDesignPalette } from '@/constants/personelDesignSystem';
import type { PttStaffPreview } from '@/lib/ptt/rooms';

type Props = {
  visible: boolean;
  onClose: () => void;
  palette: PersonelDesignPalette;
  roomName: string;
  members: PttStaffPreview[];
  roster: PttStaffPreview[];
  myStaffId: string | null;
  canManage: boolean;
  onlineIds: Set<string>;
  speakingIds: Set<string>;
  adding: boolean;
  startInAdd?: boolean;
  onAdd: (staffIds: string[]) => Promise<void>;
  onRemove: (staffId: string, name: string | null) => void;
  onOpenProfile?: (staffId: string) => void;
};

function initials(name: string | null | undefined): string {
  const s = (name || '').trim();
  if (!s) return '?';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
}

export function PttMembersSheet({
  visible,
  onClose,
  palette,
  roomName,
  members,
  roster,
  myStaffId,
  canManage,
  onlineIds,
  speakingIds,
  adding,
  startInAdd = false,
  onAdd,
  onRemove,
  onOpenProfile,
}: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'list' | 'add'>('list');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) {
      setMode('list');
      setQuery('');
      setSelected(new Set());
      return;
    }
    setMode(startInAdd ? 'add' : 'list');
  }, [visible, startInAdd]);

  const memberIds = useMemo(() => new Set(members.map((m) => m.id)), [members]);
  const candidates = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    return roster
      .filter((s) => !memberIds.has(s.id))
      .filter((s) => !q || (s.full_name || '').toLocaleLowerCase('tr').includes(q));
  }, [roster, memberIds, query]);

  const filteredMembers = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr');
    if (!q) return members;
    return members.filter((s) => (s.full_name || '').toLocaleLowerCase('tr').includes(q));
  }, [members, query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submitAdd = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    try {
      await onAdd(ids);
      setSelected(new Set());
      setMode('list');
      setQuery('');
    } catch (e) {
      Alert.alert(t('error'), e instanceof Error ? e.message : t('pttMemberAddFailed'));
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: palette.cardBg, borderColor: palette.cardBorder }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.grab} />
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: palette.text }]} numberOfLines={1}>
                {mode === 'add' ? t('pttAddMember') : t('pttMembersTitle')}
              </Text>
              <Text style={[styles.sub, { color: palette.subtext }]} numberOfLines={1}>
                {roomName}
                {mode === 'list' ? ` · ${t('pttMemberCount', { count: members.length })}` : ''}
              </Text>
            </View>
            {canManage && mode === 'list' ? (
              <Pressable
                onPress={() => {
                  setQuery('');
                  setMode('add');
                }}
                style={[styles.headBtn, { backgroundColor: palette.accentSoft }]}
                accessibilityRole="button"
                accessibilityLabel={t('pttAddMember')}
              >
                <Ionicons name="person-add" size={18} color={palette.accent} />
              </Pressable>
            ) : mode === 'add' ? (
              <Pressable
                onPress={() => {
                  setMode('list');
                  setQuery('');
                }}
                style={[styles.headBtn, { backgroundColor: palette.accentSoft }]}
              >
                <Ionicons name="arrow-back" size={18} color={palette.accent} />
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} hitSlop={8} style={styles.close}>
              <Ionicons name="close" size={22} color={palette.subtext} />
            </Pressable>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('pttSearchStaff')}
            placeholderTextColor={palette.muted}
            style={[
              styles.search,
              { color: palette.text, borderColor: palette.cardBorder, backgroundColor: palette.pageBg },
            ]}
          />

          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {mode === 'add' ? (
              candidates.length === 0 ? (
                <Text style={[styles.empty, { color: palette.subtext }]}>{t('pttAddMemberEmpty')}</Text>
              ) : (
                candidates.map((p) => {
                  const on = selected.has(p.id);
                  return (
                    <Pressable key={p.id} style={styles.row} onPress={() => toggle(p.id)}>
                      <MemberAvatar person={p} palette={palette} />
                      <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
                        {p.full_name || t('pttPeopleSection')}
                      </Text>
                      <Ionicons
                        name={on ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={on ? palette.accent : palette.muted}
                      />
                    </Pressable>
                  );
                })
              )
            ) : filteredMembers.length === 0 ? (
              <Text style={[styles.empty, { color: palette.subtext }]}>{t('pttPeopleEmpty')}</Text>
            ) : (
              filteredMembers.map((p) => {
                const speaking = speakingIds.has(p.id);
                const online = onlineIds.has(p.id);
                return (
                  <Pressable
                    key={p.id}
                    style={styles.row}
                    onPress={() => onOpenProfile?.(p.id)}
                    disabled={!onOpenProfile}
                  >
                    <MemberAvatar person={p} palette={palette} speaking={speaking} online={online} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.name, { color: palette.text }]} numberOfLines={1}>
                        {p.id === myStaffId ? t('pttYou') : p.full_name || t('pttPeopleSection')}
                      </Text>
                      <Text style={[styles.meta, { color: speaking ? palette.online : palette.subtext }]}>
                        {speaking ? t('pttSpeakingShort') : online ? t('pttOnWalkieShort') : t('pttOfflineShort')}
                      </Text>
                    </View>
                    {canManage ? (
                      <Pressable
                        onPress={() => onRemove(p.id, p.full_name)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('pttRemoveMember')}
                      >
                        <Ionicons name="remove-circle-outline" size={22} color="#dc2626" />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {mode === 'add' ? (
            <Pressable
              onPress={() => void submitAdd()}
              disabled={selected.size === 0 || adding}
              style={[styles.addCta, { opacity: selected.size === 0 || adding ? 0.45 : 1 }]}
            >
              {adding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.addCtaText}>{t('pttAddSelected', { count: selected.size })}</Text>
              )}
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MemberAvatar({
  person,
  palette,
  speaking,
  online,
}: {
  person: PttStaffPreview;
  palette: PersonelDesignPalette;
  speaking?: boolean;
  online?: boolean;
}) {
  return (
    <View
      style={[
        styles.avWrap,
        { borderColor: speaking ? palette.online : online ? '#14b8a6' : palette.cardBorder },
      ]}
    >
      {person.profile_image ? (
        <CachedImage uri={person.profile_image} style={styles.avImg} contentFit="cover" />
      ) : (
        <View style={[styles.avFallback, { backgroundColor: palette.accentSoft }]}>
          <Text style={[styles.avInitials, { color: palette.text }]}>{initials(person.full_name)}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingBottom: 20,
    paddingTop: 8,
  },
  grab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(15,118,110,0.25)',
    marginBottom: 10,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  headBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: { padding: 4 },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 8,
  },
  list: { maxHeight: 420 },
  empty: { textAlign: 'center', paddingVertical: 28, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  name: { fontSize: 15, fontWeight: '700' },
  meta: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  avWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    overflow: 'hidden',
  },
  avImg: { width: '100%', height: '100%' },
  avFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avInitials: { fontWeight: '800', fontSize: 14 },
  addCta: {
    marginTop: 10,
    backgroundColor: '#0f766e',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  addCtaText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
