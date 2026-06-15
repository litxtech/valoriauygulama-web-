import { View, Text, StyleSheet, Modal, Pressable, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { profileScreenTheme as P } from '@/constants/profileScreenTheme';
import type { ProfileBadge } from '@/lib/modernProfileModel';

type Props = {
  visible: boolean;
  onClose: () => void;
  badges: ProfileBadge[];
  yearsExperience?: number;
};

const TIER_COLORS: Record<string, string> = {
  bronze: '#b45309',
  silver: '#64748b',
  gold: '#ca8a04',
  platinum: '#6366f1',
  diamond: '#0ea5e9',
};

export function ProfileBadgesSheet({ visible, onClose, badges, yearsExperience = 0 }: Props) {
  const { t } = useTranslation();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('modernProfileMenuBadges')}</Text>
          <Text style={styles.sub}>{t('modernProfileBadgesSub')}</Text>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {badges.length === 0 ? (
              <Text style={styles.empty}>{t('modernProfileBadgesEmpty')}</Text>
            ) : (
              badges.map((b) => (
                <View
                  key={b.id}
                  style={[
                    styles.row,
                    b.tier ? { borderLeftColor: TIER_COLORS[b.tier] ?? P.border } : null,
                  ]}
                >
                  <Text style={styles.emoji}>{b.emoji}</Text>
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{t(b.labelKey, { years: yearsExperience })}</Text>
                    {b.tier ? (
                      <Text style={styles.tier}>{b.tier.toUpperCase()}</Text>
                    ) : null}
                  </View>
                </View>
              ))
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: P.card,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxHeight: '70%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: P.border,
    marginTop: 10,
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: '800', color: P.text },
  sub: { fontSize: 13, color: P.subtext, marginTop: 4, marginBottom: 12 },
  list: { maxHeight: 360 },
  empty: { fontSize: 14, color: P.subtext, paddingVertical: 24, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 8,
    borderRadius: 14,
    backgroundColor: P.cardMuted,
    borderLeftWidth: 4,
    borderLeftColor: P.border,
  },
  emoji: { fontSize: 28 },
  rowText: { flex: 1 },
  label: { fontSize: 15, fontWeight: '700', color: P.text },
  tier: { fontSize: 10, fontWeight: '800', color: P.subtext, marginTop: 4, letterSpacing: 0.8 },
});
