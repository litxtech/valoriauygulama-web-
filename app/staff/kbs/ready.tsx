import { Redirect, type Href } from 'expo-router';

/** Eski «Hazır» ekranı → birleşik bildirme durumu (Kuyruk sekmesi). */
export default function ReadyToSubmitScreen() {
  return <Redirect href={'/staff/kbs/status-board' as Href} />;
}
