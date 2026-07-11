import { useState } from 'react';
import { CapturesPage } from './CapturesPage';
import { PassportExplorePage } from './PassportExplorePage';

export type KbsTab = 'captures' | 'passports';

export function KbsAppShell() {
  const [tab, setTab] = useState<KbsTab>('captures');

  return (
    <div className="kbs-shell">
      <nav className="kbs-tab-bar" aria-label="KBS bölümleri">
        <button
          type="button"
          className={`kbs-tab${tab === 'captures' ? ' active' : ''}`}
          onClick={() => setTab('captures')}
        >
          Çekilen Kimlikler
        </button>
        <button
          type="button"
          className={`kbs-tab${tab === 'passports' ? ' active' : ''}`}
          onClick={() => setTab('passports')}
        >
          Pasaport Keşfeti
        </button>
      </nav>
      {tab === 'captures' ? <CapturesPage /> : <PassportExplorePage />}
    </div>
  );
}
