/** Doküman yönetimi — ortak görsel dil */
export const docTheme = {
  bg: '#F4F6F9',
  card: '#FFFFFF',
  cardMuted: '#F8FAFC',
  border: '#E2E8F0',
  accent: '#2563EB',
  accentDark: '#1D4ED8',
  accentSoft: '#EFF6FF',
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textSoft: '#94A3B8',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  rose: '#E11D48',
  roseSoft: '#FFF1F2',
  teal: '#0D9488',
  tealSoft: '#F0FDFA',
  slate: '#475569',
  slateSoft: '#F1F5F9',
} as const;

export const DOC_ACCENT_STYLES = {
  amber: { bg: docTheme.amberSoft, fg: docTheme.amber, badge: docTheme.amber },
  rose: { bg: docTheme.roseSoft, fg: docTheme.rose, badge: docTheme.rose },
  slate: { bg: docTheme.slateSoft, fg: docTheme.slate, badge: docTheme.slate },
  teal: { bg: docTheme.tealSoft, fg: docTheme.teal, badge: docTheme.teal },
  indigo: { bg: docTheme.accentSoft, fg: docTheme.accentDark, badge: docTheme.accentDark },
} as const;
