import { AccessGate } from './auth/AccessGate';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { LoginPage } from './auth/LoginPage';
import { CapturesPage } from './components/CapturesPage';

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <div className="state-box fullscreen">Yükleniyor…</div>;
  if (!session) return <LoginPage />;
  return <CapturesPage />;
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
