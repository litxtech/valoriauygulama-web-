export type ModernGuestProfileInput = {
  fullName: string | null;
  bio?: string | null;
  jobTitle?: string | null;
  contactEmail?: string | null;
  profileImage?: string | null;
  coverImage?: string | null;
  organizationName?: string | null;
  postCount?: number;
  verificationBadge?: 'blue' | 'yellow' | null;
};
