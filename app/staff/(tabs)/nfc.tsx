import { Redirect } from 'expo-router';

/** Pasaport NFC — alt tabdan açılır. */
export default function StaffNfcTabRedirect() {
  return <Redirect href="/staff/kbs/capture-nfc" />;
}
