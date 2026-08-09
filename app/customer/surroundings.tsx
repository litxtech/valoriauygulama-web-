import { Redirect } from 'expo-router';

/** Eski POI rehberi — tek bölge rehberine yönlendirilir. */
export default function SurroundingsRedirect() {
  return <Redirect href="/customer/local-area-guide" />;
}
