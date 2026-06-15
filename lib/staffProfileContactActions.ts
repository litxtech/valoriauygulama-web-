import { Linking } from 'react-native';
import type { TFunction } from 'i18next';
import type { ProfileContactAction } from '@/components/modernProfile/ProfileContactActionsBar';
import { staffTipText } from '@/lib/staffTipsI18n';

const TINT = {
  call: '#2563eb',
  message: '#0ea5e9',
  email: '#7c3aed',
  whatsapp: '#25D366',
  tips: '#b8860b',
  edit: '#6366f1',
  tasks: '#0f766e',
} as const;

function openTel(phone: string) {
  void Linking.openURL(`tel:${phone.trim()}`);
}

function openMail(email: string) {
  void Linking.openURL(`mailto:${email.trim()}`);
}

function openWhatsApp(whatsapp: string) {
  const digits = whatsapp.trim().replace(/\D/g, '');
  if (!digits) return;
  void Linking.openURL(`https://wa.me/${digits}`);
}

export type BuildStaffProfileContactActionsParams = {
  t: TFunction;
  mode: 'self' | 'staff_peer' | 'guest';
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  showPhone?: boolean;
  showEmail?: boolean;
  showWhatsApp?: boolean;
  onMessage: () => void;
  messageLoading?: boolean;
  onTips?: () => void;
  onEdit?: () => void;
  onTasks?: () => void;
};

/** Personel profil ekranları için mesaj / ara / e-posta / WhatsApp / bahşiş kısayolları */
export function buildStaffProfileContactActions(
  params: BuildStaffProfileContactActionsParams
): ProfileContactAction[] {
  const {
    t,
    mode,
    phone,
    email,
    whatsapp,
    showPhone = true,
    showEmail = true,
    showWhatsApp = true,
    onMessage,
    messageLoading,
    onTips,
    onEdit,
    onTasks,
  } = params;

  const actions: ProfileContactAction[] = [];

  const canPhone = showPhone && !!phone?.trim();
  const canEmail = showEmail && !!email?.trim();
  const canWhatsApp = showWhatsApp && !!whatsapp?.trim();

  if (canPhone) {
    actions.push({
      id: 'call',
      icon: 'call-outline',
      label: t('modernProfileQuickCall'),
      tint: TINT.call,
      onPress: () => openTel(phone!),
    });
  }

  actions.push({
    id: 'message',
    icon: 'chatbubble-outline',
    label: t('modernProfileQuickMessage'),
    tint: TINT.message,
    onPress: onMessage,
    loading: messageLoading,
  });

  if (canEmail) {
    actions.push({
      id: 'email',
      icon: 'mail-outline',
      label: t('modernProfileQuickEmail'),
      tint: TINT.email,
      onPress: () => openMail(email!),
    });
  }

  if (canWhatsApp) {
    actions.push({
      id: 'whatsapp',
      icon: 'logo-whatsapp',
      label: t('modernProfileQuickWhatsApp'),
      tint: TINT.whatsapp,
      onPress: () => openWhatsApp(whatsapp!),
    });
  }

  if (mode === 'self' && onTips) {
    actions.push({
      id: 'tips',
      icon: 'gift-outline',
      label: staffTipText('tipStaffTipsMenuTitle'),
      tint: TINT.tips,
      onPress: onTips,
    });
  }

  if (mode === 'guest' && onTips) {
    actions.push({
      id: 'tips',
      icon: 'gift-outline',
      label: staffTipText('tipButton'),
      tint: TINT.tips,
      onPress: onTips,
    });
  }

  if (mode === 'self' && onEdit) {
    actions.push({
      id: 'edit',
      icon: 'create-outline',
      label: t('editProfileInfo'),
      tint: TINT.edit,
      onPress: onEdit,
    });
  }

  if (mode === 'staff_peer' && onTasks) {
    actions.push({
      id: 'tasks',
      icon: 'checkbox-outline',
      label: t('modernProfileQuickTasks'),
      tint: TINT.tasks,
      onPress: onTasks,
    });
  }

  return actions;
}
