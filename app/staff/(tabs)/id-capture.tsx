import { Redirect } from 'expo-router';

/** Eski tab rotası — kimlik çekim header menüsünden açılır. */
export default function StaffIdCaptureTabRedirect() {
  return <Redirect href="/staff/kbs/capture-id" />;
}
