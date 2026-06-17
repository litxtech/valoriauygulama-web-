import { Ionicons } from '@expo/vector-icons';

export type StaffHamburgerMenuItem = {
  id: string;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

export type StaffHamburgerMenuSectionId =
  | 'fnb'
  | 'kitchen'
  | 'nav'
  | 'staff'
  | 'hotel'
  | 'payments'
  | 'ops'
  | 'admin';

export type StaffHamburgerMenuSection = {
  id: StaffHamburgerMenuSectionId;
  title: string;
  items: StaffHamburgerMenuItem[];
};

/** Hamburger üstünde kart olarak gösterilen hub girişleri */
export const STAFF_HAMBURGER_HUB_ITEM_IDS = ['admin_notes', 'payments_hub', 'fnb_hub', 'admin_tab', 'kitchen_ops'] as const;

export type StaffHamburgerHubItemId = (typeof STAFF_HAMBURGER_HUB_ITEM_IDS)[number];

export type StaffHamburgerMenuLayout = {
  primary: StaffHamburgerMenuItem | null;
  hubs: StaffHamburgerMenuItem[];
  sections: StaffHamburgerMenuSection[];
};

export const DEFAULT_HAMBURGER_SECTION_ORDER: StaffHamburgerMenuSectionId[] = [
  'fnb',
  'kitchen',
  'nav',
  'staff',
  'hotel',
  'payments',
  'ops',
  'admin',
];
