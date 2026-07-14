import { Redirect, type Href } from 'expo-router';

/** Eski «Başarısız» ekranı → birleşik bildirme durumu. */
export default function FailedTransactionsScreen() {
  return <Redirect href={'/staff/kbs/status-board' as Href} />;
}
