/**
 * Pasaport/ID MRZ — KBS UI kapalı olsa da erişilir (staff stack, kbs/_layout dışında).
 */
import { KbsGuestScanScreen } from '@/components/kbs/KbsGuestScanScreen';

export default function StaffMrzScanScreen() {
  return <KbsGuestScanScreen deniedFallback="/staff" />;
}
