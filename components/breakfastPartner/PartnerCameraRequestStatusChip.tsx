import { Text, View, StyleSheet } from 'react-native';
import {
  CAMERA_REQUEST_STATUS_LABELS,
  cameraRequestStatusTone,
  type CameraRequestStatus,
} from '@/lib/breakfastPartnerCameraRequests';
import { partnerRadii, partnerTheme } from '@/lib/breakfastPartnerTheme';

const TONE_COLORS = {
  muted: { bg: partnerTheme.cardElevated, text: partnerTheme.muted },
  accent: { bg: partnerTheme.accentSoft, text: partnerTheme.accentDark },
  success: { bg: 'rgba(34,197,94,0.14)', text: partnerTheme.success },
  danger: { bg: 'rgba(239,68,68,0.14)', text: partnerTheme.danger },
  info: { bg: 'rgba(59,130,246,0.14)', text: partnerTheme.info },
} as const;

export function PartnerCameraRequestStatusChip({ status }: { status: CameraRequestStatus }) {
  const tone = cameraRequestStatusTone(status);
  const colors = TONE_COLORS[tone];
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{CAMERA_REQUEST_STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: partnerRadii.pill,
  },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
});
