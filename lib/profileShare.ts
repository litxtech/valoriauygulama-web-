import { Share } from 'react-native';

/** Derin bağlantı — expo-router staff profil rotası. */
export function staffProfileDeepLink(staffId: string, viewer: 'staff' | 'customer' = 'staff'): string {
  const path = viewer === 'customer' ? `/customer/staff/${staffId}` : `/staff/profile/${staffId}`;
  return `valoria://${path.replace(/^\//, '')}`;
}

export async function shareStaffProfile(params: {
  staffId: string;
  fullName: string;
  organizationName?: string | null;
  viewer?: 'staff' | 'customer';
}): Promise<void> {
  const name = params.fullName.trim() || 'Valoria';
  const org = params.organizationName?.trim();
  const link = staffProfileDeepLink(params.staffId, params.viewer ?? 'staff');
  const lines = [name, org ? org : null, link].filter(Boolean);
  await Share.share({
    message: lines.join('\n'),
    title: `${name} — Valoria`,
  });
}
