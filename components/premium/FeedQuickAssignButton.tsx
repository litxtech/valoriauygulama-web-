import { useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { PressableScale } from '@/components/premium/PressableScale';
import { GlassSurface } from '@/components/premium/GlassSurface';
import { QuickAssignTaskSheet } from '@/components/tasks/QuickAssignTaskSheet';
import { useAuthStore } from '@/stores/authStore';
import { canStaffCreateAssignments } from '@/lib/staffPermissions';
import { pds } from '@/constants/personelDesignSystem';
import { usePremiumTheme } from '@/contexts/PremiumThemeContext';

type Props = { variant?: 'row' | 'icon' };

/** Feed üst şeridi: yetkili personele hızlı görev atama kısayolu. */
export function FeedQuickAssignButton({ variant = 'row' }: Props) {
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  const { colors } = usePremiumTheme();
  const [open, setOpen] = useState(false);

  if (!canStaffCreateAssignments(staff)) return null;

  return (
    <>
      {variant === 'icon' ? (
        <PressableScale
          style={[styles.iconWrap, styles.iconBtn, { backgroundColor: pds.purple + '18' }]}
          onPress={() => setOpen(true)}
          scaleTo={0.92}
        >
          <Ionicons name="clipboard-outline" size={17} color={pds.purple} />
        </PressableScale>
      ) : (
        <PressableScale style={styles.wrap} onPress={() => setOpen(true)} scaleTo={0.98}>
          <GlassSurface style={styles.btn} borderRadius={14} intensity={44} blur={false}>
            <Ionicons name="clipboard-outline" size={20} color={pds.purple} />
            <Text style={[styles.label, { color: colors.text }]}>{t('quickAssign_feedBtn')}</Text>
            <Ionicons name="chevron-forward" size={18} color={colors.subtext} />
          </GlassSurface>
        </PressableScale>
      )}
      <QuickAssignTaskSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  iconWrap: { marginHorizontal: 0 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wrap: { paddingHorizontal: 12, marginBottom: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  label: { flex: 1, fontSize: 15, fontWeight: '800' },
});
