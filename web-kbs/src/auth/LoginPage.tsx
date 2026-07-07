import { useState, type FormEvent } from 'react';
import { useAuth } from './AuthContext';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error } = await signIn(email, password);
    if (error) setError(error);
    setBusy(false);
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="login-logo">V</span>
          <div>
            <h1>Valoria</h1>
            <p>Çekilen Kimlikler Paneli</p>
          </div>
        </div>

        <label className="field">
          <span>E-posta</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>

        <label className="field">
          <span>Şifre</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>

        {error ? <div className="login-error">{error}</div> : null}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Giriş yapılıyor…' : 'Giriş yap'}
        </button>

        <p className="login-hint">
          Personel uygulamasıyla aynı hesap bilgileriyle giriş yapın.
        </p>
      </form>
    </div>
  );
}
