import { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import {
  listPresentGuestsForFacilityJournal,
  listStaffForFacilityJournalAccess,
  type PresentGuestForFacilityJournal,
} from '@/lib/facilityJournal';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { theme } from '@/constants/theme';

type StaffOption = { id: string; full_name: string | null };

type Props = {
  organizationId: string;
  creatorStaffId: string;
  selectedStaffIds: string[];
  selectedGuestIds: string[];
  onToggleStaff: (id: string) => void;
  onToggleGuest: (id: string) => void;
};

const GUEST_STATUS_LABEL: Record<string, string> = {
  checked_in: 'Konaklıyor',
  pending: 'Beklemede',
};

export function FacilityJournalViewerPicker({
  organizationId,
  creatorStaffId,
  selectedStaffIds,
  selectedGuestIds,
  onToggleStaff,
  onToggleGuest,
}: Props) {
  const [staffExpanded, setStaffExpanded] = useState(false);
  const [guestExpanded, setGuestExpanded] = useState(false);
  const [staffOptions, setStaffOptions] = useState<StaffOption[]>([]);
  const [guestOptions, setGuestOptions] = useState<PresentGuestForFacilityJournal[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const staffLoadedRef = useRef(false);

  const loadStaff = useCallback(async () => {
    if (!organizationId) return;
    setStaffLoading(true);
    try {
      const res = await listStaffForFacilityJournalAccess(organizationId);
      const rows = (res.data ?? []) as StaffOption[];
      setStaffOptions(rows.filter((r) => r.id !== creatorStaffId));
    } finally {
      setStaffLoading(false);
    }
  }, [organizationId, creatorStaffId]);

  const loadGuests = useCallback(async () => {
    if (!organizationId) return;
    setGuestLoading(true);
    try {
      const { data, error } = await listPresentGuestsForFacilityJournal(organizationId);
      if (!error && data) setGuestOptions(data);
    } finally {
      setGuestLoading(false);
    }
  }, [organizationId]);

  const openStaff = () => {
    setStaffExpanded(true);
    if (!staffLoadedRef.current) {
      staffLoadedRef.current = true;
      void loadStaff();
    }
  };

  const openGuests = () => {
    setGuestExpanded(true);
    void loadGuests();
  };

  useEffect(() => {
    if (!guestExpanded || !organizationId) return;
    void loadGuests();
    const channel = supabase
      .channel(`fj-present-guests-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'guests',
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          void loadGuests();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [guestExpanded, organizationId, loadGuests]);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.toggle} onPress={openStaff} activeOpacity={0.85}>
        <Text style={styles.label}>Personel ({selectedStaffIds.length} seçili)</Text>
        <Ionicons name={staffExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>
      {staffExpanded ? (
        staffLoading ? (
          <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
        ) : (
          <View style={styles.chipRow}>
            {staffOptions.map((s) => {
              const on = selectedStaffIds.includes(s.id);
              return (
                <TouchableOpacity
                  key={s.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => onToggleStaff(s.id)}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={16}
                    color={on ? '#fff' : theme.colors.textMuted}
                  />
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.full_name ?? 'Personel'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )
      ) : (
        <Text style={styles.hint}>İsteğe bağlı: ek personel bu kaydı görebilir.</Text>
      )}

      <TouchableOpacity style={[styles.toggle, styles.toggleGap]} onPress={openGuests} activeOpacity={0.85}>
        <Text style={styles.label}>Misafirler — otelde şu an ({selectedGuestIds.length} seçili)</Text>
        <Ionicons name={guestExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.textMuted} />
      </TouchableOpacity>
      {guestExpanded ? (
        <>
          <Text style={styles.hint}>
            Liste anlık güncellenir (konaklayan / onay bekleyen). Seçilen misafirler uygulamada bu kaydı görür.
          </Text>
          {guestLoading ? (
            <ActivityIndicator style={styles.loader} color={theme.colors.primary} />
          ) : guestOptions.length === 0 ? (
            <Text style={styles.empty}>Şu an listede misafir yok.</Text>
          ) : (
            <View style={styles.chipRow}>
              {guestOptions.map((g) => {
                const on = selectedGuestIds.includes(g.id);
                const name = guestDisplayName(g.full_name);
                const meta = [g.room_number ? `Oda ${g.room_number}` : null, g.status ? GUEST_STATUS_LABEL[g.status] ?? g.status : null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <TouchableOpacity
                    key={g.id}
                    style={[styles.chip, styles.guestChip, on && styles.chipOn]}
                    onPress={() => onToggleGuest(g.id)}
                  >
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={16}
                      color={on ? '#fff' : theme.colors.textMuted}
                    />
                    <View style={styles.guestChipText}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{name}</Text>
                      {meta ? (
                        <Text style={[styles.chipMeta, on && styles.chipMetaOn]} numberOfLines={1}>
                          {meta}
                        </Text>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <Text style={styles.hint}>Misafir listesini görmek için dokunun.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  toggleGap: { marginTop: 16 },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text, flex: 1 },
  hint: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 8, marginTop: 4 },
  empty: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic', marginBottom: 8 },
  loader: { marginVertical: 12, alignSelf: 'flex-start' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    maxWidth: '100%',
  },
  guestChip: { paddingVertical: 10 },
  chipOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  chipText: { fontSize: 13, color: theme.colors.text, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  guestChipText: { flexShrink: 1 },
  chipMeta: { fontSize: 11, color: theme.colors.textMuted, marginTop: 1 },
  chipMetaOn: { color: 'rgba(255,255,255,0.85)' },
});
