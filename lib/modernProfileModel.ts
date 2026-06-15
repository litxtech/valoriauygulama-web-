import type { StaffProfileExtendedStats } from '@/lib/staffProfileExtendedStats';
import { tenureBreakdown } from '@/lib/modernProfileTenure';

export type ProfileBadge = {
  id: string;
  emoji: string;
  labelKey: string;
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
};

export type ProfileCompletionField = {
  id: string;
  labelKey: string;
  done: boolean;
};

export type ModernProfileStaffInput = {
  fullName: string | null;
  role?: string | null;
  position?: string | null;
  department?: string | null;
  organizationName?: string | null;
  officeLocation?: string | null;
  hireDate?: string | null;
  createdAt?: string | null;
  bio?: string | null;
  profileImage?: string | null;
  coverImage?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  verificationBadge?: 'blue' | 'yellow' | null;
  achievements?: string[] | null;
  specialties?: string[] | null;
  languages?: string[] | null;
  isOnline?: boolean | null;
  shiftLabel?: string | null;
  workStatus?: string | null;
  daysWithUs?: number | null;
  stats?: StaffProfileExtendedStats | null;
};

const ADMIN_ROLES = new Set(['admin', 'owner', 'reception_chief']);

export function deriveProfileBadges(input: ModernProfileStaffInput): ProfileBadge[] {
  const badges: ProfileBadge[] = [];
  const role = (input.role ?? '').toLowerCase();
  const days = input.daysWithUs ?? 0;
  const { years } = tenureBreakdown(days);
  const visits = input.stats?.visits ?? 0;
  const tasks = input.stats?.tasksCompleted ?? 0;

  if (role === 'owner' || input.position?.toLowerCase().includes('kurucu')) {
    badges.push({ id: 'founder', emoji: '🏆', labelKey: 'modernProfileBadgeFounder', tier: 'diamond' });
  }
  if (ADMIN_ROLES.has(role) || input.position?.toLowerCase().includes('müdür')) {
    badges.push({ id: 'manager', emoji: '👑', labelKey: 'modernProfileBadgeManager', tier: 'platinum' });
  }
  if (years >= 16 || days >= 5840) {
    badges.push({ id: 'experience', emoji: '⭐', labelKey: 'modernProfileBadgeExperience', tier: 'gold' });
  } else if (years >= 5) {
    badges.push({ id: 'experience', emoji: '⭐', labelKey: 'modernProfileBadgeExperienceYears', tier: 'silver' });
  }
  if (visits >= 500 || tasks >= 500) {
    badges.push({ id: 'active', emoji: '🔥', labelKey: 'modernProfileBadgeActive', tier: 'gold' });
  }
  if (ADMIN_ROLES.has(role)) {
    badges.push({ id: 'vip', emoji: '💎', labelKey: 'modernProfileBadgeVip', tier: 'platinum' });
  }
  if (input.verificationBadge === 'blue' || input.verificationBadge === 'yellow') {
    badges.push({ id: 'trusted', emoji: '🛡', labelKey: 'modernProfileBadgeTrusted', tier: 'bronze' });
  }
  if (badges.length === 0 && days >= 30) {
    badges.push({ id: 'team', emoji: '✨', labelKey: 'modernProfileBadgeTeam', tier: 'bronze' });
  }
  return badges.slice(0, 6);
}

export function computeProfileCompletion(input: ModernProfileStaffInput): {
  percent: number;
  missing: ProfileCompletionField[];
} {
  const fields: ProfileCompletionField[] = [
    { id: 'avatar', labelKey: 'modernProfileMissingAvatar', done: !!input.profileImage?.trim() },
    { id: 'cover', labelKey: 'modernProfileMissingCover', done: !!input.coverImage?.trim() },
    { id: 'bio', labelKey: 'modernProfileMissingBio', done: !!input.bio?.trim() },
    { id: 'position', labelKey: 'modernProfileMissingPosition', done: !!(input.position?.trim() || input.department?.trim()) },
    { id: 'location', labelKey: 'modernProfileMissingLocation', done: !!input.officeLocation?.trim() },
    { id: 'phone', labelKey: 'modernProfileMissingPhone', done: !!input.phone?.trim() },
    { id: 'email', labelKey: 'modernProfileMissingEmail', done: !!input.email?.trim() },
    {
      id: 'achievements',
      labelKey: 'modernProfileMissingAchievements',
      done: (input.achievements?.length ?? 0) > 0,
    },
    { id: 'languages', labelKey: 'modernProfileMissingLanguages', done: (input.languages?.length ?? 0) > 0 },
  ];
  const done = fields.filter((f) => f.done).length;
  const percent = Math.round((done / fields.length) * 100);
  return { percent, missing: fields.filter((f) => !f.done) };
}

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export function achievementTierFromCount(count: number): AchievementTier {
  if (count >= 50) return 'diamond';
  if (count >= 25) return 'platinum';
  if (count >= 10) return 'gold';
  if (count >= 3) return 'silver';
  return 'bronze';
}
