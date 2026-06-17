import { Redirect } from 'expo-router';

/** Kimlik çekim — alt tab orta kamera butonundan açılır. */
export default function StaffIdCaptureTabRedirect() {
  return <Redirect href="/staff/kbs/capture-id" />;
}
