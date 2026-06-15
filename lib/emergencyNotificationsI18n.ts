import { EMERGENCY_TYPES } from '@/lib/notificationTypes';
import { resolveAppLang, type AppLang } from '@/lib/appLang';

export type EmergencyNotifType = (typeof EMERGENCY_TYPES)[keyof typeof EMERGENCY_TYPES];

type EmergencyCopy = { title: string; body: string };

const PACKS: Record<AppLang, Record<EmergencyNotifType, EmergencyCopy>> = {
  tr: {
    [EMERGENCY_TYPES.fire_drill]: {
      title: 'Yangın Tatbikatı',
      body: "🚨 Yangın tatbikatı 15:00'te başlayacak. Lütfen açıklamaları takip edin.",
    },
    [EMERGENCY_TYPES.water_outage]: {
      title: 'Su Kesintisi',
      body: '💧 14:00-16:00 arası su kesintisi olacaktır. Anlayışınız için teşekkürler.',
    },
    [EMERGENCY_TYPES.power_outage]: {
      title: 'Elektrik Kesintisi',
      body: '⚡ 10:00-11:00 arası elektrik bakımı yapılacaktır. Jeneratör devrede olacak.',
    },
    [EMERGENCY_TYPES.emergency_evacuate]: {
      title: 'Acil Durum',
      body: '🚨 Lütfen binayı boşaltın! Yangın merdivenlerini kullanın.',
    },
  },
  en: {
    [EMERGENCY_TYPES.fire_drill]: {
      title: 'Fire drill',
      body: '🚨 Fire drill starts at 3:00 PM. Please follow the instructions.',
    },
    [EMERGENCY_TYPES.water_outage]: {
      title: 'Water outage',
      body: '💧 Water will be off from 2:00 PM to 4:00 PM. Thank you for your understanding.',
    },
    [EMERGENCY_TYPES.power_outage]: {
      title: 'Power outage',
      body: '⚡ Power maintenance from 10:00 AM to 11:00 AM. The generator will be active.',
    },
    [EMERGENCY_TYPES.emergency_evacuate]: {
      title: 'Emergency',
      body: '🚨 Please evacuate the building! Use the fire stairs.',
    },
  },
  ar: {
    [EMERGENCY_TYPES.fire_drill]: {
      title: 'تمرين إطفاء',
      body: '🚨 يبدأ تمرين الإطفاء الساعة 15:00. يرجى اتباع التعليمات.',
    },
    [EMERGENCY_TYPES.water_outage]: {
      title: 'انقطاع المياه',
      body: '💧 انقطاع المياه من 14:00 إلى 16:00. شكراً لتفهمكم.',
    },
    [EMERGENCY_TYPES.power_outage]: {
      title: 'انقطاع الكهرباء',
      body: '⚡ صيانة الكهرباء من 10:00 إلى 11:00. المولد سيعمل.',
    },
    [EMERGENCY_TYPES.emergency_evacuate]: {
      title: 'حالة طوارئ',
      body: '🚨 يرجى إخلاء المبنى! استخدم سلالم الطوارئ.',
    },
  },
  de: {
    [EMERGENCY_TYPES.fire_drill]: {
      title: 'Feuerübung',
      body: '🚨 Feuerübung um 15:00 Uhr. Bitte folgen Sie den Anweisungen.',
    },
    [EMERGENCY_TYPES.water_outage]: {
      title: 'Wasserausfall',
      body: '💧 Wasser von 14:00 bis 16:00 Uhr abgestellt. Vielen Dank für Ihr Verständnis.',
    },
    [EMERGENCY_TYPES.power_outage]: {
      title: 'Stromausfall',
      body: '⚡ Stromwartung von 10:00 bis 11:00 Uhr. Generator ist aktiv.',
    },
    [EMERGENCY_TYPES.emergency_evacuate]: {
      title: 'Notfall',
      body: '🚨 Bitte das Gebäude verlassen! Nutzen Sie die Notfalltreppen.',
    },
  },
  fr: {
    [EMERGENCY_TYPES.fire_drill]: {
      title: 'Exercice incendie',
      body: '🚨 Exercice incendie à 15h00. Veuillez suivre les consignes.',
    },
    [EMERGENCY_TYPES.water_outage]: {
      title: 'Coupure d’eau',
      body: '💧 Coupure d’eau de 14h00 à 16h00. Merci de votre compréhension.',
    },
    [EMERGENCY_TYPES.power_outage]: {
      title: 'Coupure de courant',
      body: '⚡ Maintenance électrique de 10h00 à 11h00. Groupe électrogène actif.',
    },
    [EMERGENCY_TYPES.emergency_evacuate]: {
      title: 'Urgence',
      body: '🚨 Veuillez évacuer le bâtiment ! Utilisez les escaliers de secours.',
    },
  },
  ru: {
    [EMERGENCY_TYPES.fire_drill]: {
      title: 'Пожарная тревога',
      body: '🚨 Учения начнутся в 15:00. Следуйте инструкциям.',
    },
    [EMERGENCY_TYPES.water_outage]: {
      title: 'Отключение воды',
      body: '💧 Вода будет отключена с 14:00 до 16:00. Спасибо за понимание.',
    },
    [EMERGENCY_TYPES.power_outage]: {
      title: 'Отключение электричества',
      body: '⚡ Работы с 10:00 до 11:00. Генератор будет работать.',
    },
    [EMERGENCY_TYPES.emergency_evacuate]: {
      title: 'Чрезвычайная ситуация',
      body: '🚨 Покиньте здание! Используйте пожарные лестницы.',
    },
  },
  es: {
    [EMERGENCY_TYPES.fire_drill]: {
      title: 'Simulacro de incendio',
      body: '🚨 Simulacro a las 15:00. Siga las instrucciones.',
    },
    [EMERGENCY_TYPES.water_outage]: {
      title: 'Corte de agua',
      body: '💧 Sin agua de 14:00 a 16:00. Gracias por su comprensión.',
    },
    [EMERGENCY_TYPES.power_outage]: {
      title: 'Corte de luz',
      body: '⚡ Mantenimiento eléctrico de 10:00 a 11:00. Generador activo.',
    },
    [EMERGENCY_TYPES.emergency_evacuate]: {
      title: 'Emergencia',
      body: '🚨 ¡Evacúe el edificio! Use las escaleras de emergencia.',
    },
  },
};

/** Admin UI — şablon seçenek etiketleri */
const OPTION_LABELS: Record<AppLang, Record<EmergencyNotifType, string>> = {
  tr: {
    [EMERGENCY_TYPES.fire_drill]: 'Yangın Tatbikatı',
    [EMERGENCY_TYPES.water_outage]: 'Su Kesintisi',
    [EMERGENCY_TYPES.power_outage]: 'Elektrik Kesintisi',
    [EMERGENCY_TYPES.emergency_evacuate]: 'Acil Tahliye',
  },
  en: {
    [EMERGENCY_TYPES.fire_drill]: 'Fire drill',
    [EMERGENCY_TYPES.water_outage]: 'Water outage',
    [EMERGENCY_TYPES.power_outage]: 'Power outage',
    [EMERGENCY_TYPES.emergency_evacuate]: 'Emergency evacuation',
  },
  ar: {
    [EMERGENCY_TYPES.fire_drill]: 'تمرين إطفاء',
    [EMERGENCY_TYPES.water_outage]: 'انقطاع المياه',
    [EMERGENCY_TYPES.power_outage]: 'انقطاع الكهرباء',
    [EMERGENCY_TYPES.emergency_evacuate]: 'إخلاء طارئ',
  },
  de: {
    [EMERGENCY_TYPES.fire_drill]: 'Feuerübung',
    [EMERGENCY_TYPES.water_outage]: 'Wasserausfall',
    [EMERGENCY_TYPES.power_outage]: 'Stromausfall',
    [EMERGENCY_TYPES.emergency_evacuate]: 'Notfall-Evakuierung',
  },
  fr: {
    [EMERGENCY_TYPES.fire_drill]: 'Exercice incendie',
    [EMERGENCY_TYPES.water_outage]: 'Coupure d’eau',
    [EMERGENCY_TYPES.power_outage]: 'Coupure de courant',
    [EMERGENCY_TYPES.emergency_evacuate]: 'Évacuation d’urgence',
  },
  ru: {
    [EMERGENCY_TYPES.fire_drill]: 'Пожарная тревога',
    [EMERGENCY_TYPES.water_outage]: 'Отключение воды',
    [EMERGENCY_TYPES.power_outage]: 'Отключение электричества',
    [EMERGENCY_TYPES.emergency_evacuate]: 'Эвакуация',
  },
  es: {
    [EMERGENCY_TYPES.fire_drill]: 'Simulacro de incendio',
    [EMERGENCY_TYPES.water_outage]: 'Corte de agua',
    [EMERGENCY_TYPES.power_outage]: 'Corte de luz',
    [EMERGENCY_TYPES.emergency_evacuate]: 'Evacuación de emergencia',
  },
};

export function emergencyNotificationCopy(
  type: string,
  lang?: string | null
): EmergencyCopy {
  const l = resolveAppLang(lang);
  const pack = PACKS[l][type as EmergencyNotifType] ?? PACKS.en[type as EmergencyNotifType] ?? PACKS.tr[type as EmergencyNotifType];
  if (pack) return pack;
  return { title: type, body: '' };
}

export function emergencyOptionLabel(type: EmergencyNotifType, lang?: string | null): string {
  const l = resolveAppLang(lang);
  return OPTION_LABELS[l][type] ?? OPTION_LABELS.en[type] ?? type;
}

export const EMERGENCY_OPTION_TYPES = Object.values(EMERGENCY_TYPES) as EmergencyNotifType[];
