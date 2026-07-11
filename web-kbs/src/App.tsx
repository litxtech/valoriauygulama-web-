import { AccessGate } from './auth/AccessGate';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { KbsAppShell } from './components/KbsAppShell';

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="state-box fullscreen">Yükleniyor…</div>;
  if (!session) return <LoginPage />;
  return <KbsAppShell />;
}

export default function App() {
  return (
    <AccessGate>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </AccessGate>
  );
}
