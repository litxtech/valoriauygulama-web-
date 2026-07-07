import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';

/**
 * Sayfa erişim parolası — admin, mobil uygulamadan (KBS Ayarları) belirler/değiştirir.
 * Parola Supabase'de salt'lı hash olarak saklanır; burada RPC ile doğrulanır.
 * Doğru girilince cihazda (parola sürümüne bağlı) hatırlanır; personel bir daha sorulmaz.
 * Admin parolayı değiştirince sürüm değişir → tüm cihazlar bir kez daha sorar.
 * Parola tanımlı değilse kapı hiç gösterilmez.
 */
type Status = { required: boolean; version: string | null };

const STORAGE_PREFIX = 'valoria_kbs_access_';

async function fetchStatus(): Promise<Status> {
  try {
    const { data, error } = await supabase.rpc('kbs_web_access_status');
    if (error) return { required: false, version: null }; // RPC yoksa/erişilemezse serbest
    const row = (data ?? {}) as { required?: boolean; version?: string | null };
    return { required: !!row.required, version: row.version ?? null };
  } catch {
    return { required: false, version: null };
  }
}

export function AccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const storageKey = useMemo(
    () => (status?.version ? `${STORAGE_PREFIX}${status.version}` : ''),
    [status?.version]
  );

  useEffect(() => {
    let active = true;
    void fetchStatus().then((s) => {
      if (!active) return;
      setStatus(s);
      if (!s.required) {
        setUnlocked(true);
        return;
      }
      try {
        if (s.version && localStorage.getItem(`${STORAGE_PREFIX}${s.version}`) === '1') {
          setUnlocked(true);
        }
      } catch {
        /* ignore */
      }
    });
    return () => {
      active = false;
    };
  }, []);

  if (status === null) {
    return <div className="state-box fullscreen">Yükleniyor…</div>;
  }

  if (unlocked) return <>{children}</>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('verify_kbs_access_code', {
      code: value.trim(),
    });
    setBusy(false);
    if (rpcError) {
      setError('Doğrulama yapılamadı. Bağlantınızı kontrol edin.');
      return;
    }
    if (data === true) {
      try {
        if (storageKey) localStorage.setItem(storageKey, '1');
      } catch {
        /* ignore */
      }
      setUnlocked(true);
    } else {
      setError('Parola hatalı.');
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <span className="login-logo">V</span>
          <div>
            <h1>Valoria</h1>
            <p>Sayfa Erişim Parolası</p>
          </div>
        </div>
        <label className="field">
          <span>Parola</span>
          <input
            type="password"
            autoFocus
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            required
          />
        </label>
        {error ? <div className="login-error">{error}</div> : null}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Kontrol ediliyor…' : 'Devam et'}
        </button>
        <p className="login-hint">Bu parola bu cihazda bir kez sorulur.</p>
      </form>
    </div>
  );
}
