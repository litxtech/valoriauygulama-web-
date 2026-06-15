/** Harita avatarına tıklanınca açılacak profil rotası. */
export function mapUserProfileHref(opts: {
  userId: string;
  userType: 'guest' | 'staff';
  pathname?: string | null;
}): string {
  const { userId, userType, pathname } = opts;
  if (pathname?.startsWith('/admin')) {
    return userType === 'staff' ? `/admin/staff/${userId}` : `/admin/guests/${userId}`;
  }
  if (pathname?.startsWith('/staff')) {
    return userType === 'staff' ? `/staff/profile/${userId}` : `/staff/guests/${userId}`;
  }
  return userType === 'staff' ? `/customer/staff/${userId}` : `/customer/guest/${userId}`;
}
