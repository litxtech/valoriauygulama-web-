import { useState } from 'react';
import { CapturesPage } from './CapturesPage';
import { PassportExplorePage } from './PassportExplorePage';
import { InHousePage } from './InHousePage';

export type KbsTab = 'captures' | 'inhouse' | 'passports';

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
          Çekilenler
        </button>
        <button
          type="button"
          className={`kbs-tab${tab === 'inhouse' ? ' active' : ''}`}
          onClick={() => setTab('inhouse')}
        >
          İçeride
        </button>
        <button
          type="button"
          className={`kbs-tab${tab === 'passports' ? ' active' : ''}`}
          onClick={() => setTab('passports')}
        >
          Pasaport Keşfeti
        </button>
      </nav>
      {tab === 'captures' ? <CapturesPage /> : null}
      {tab === 'inhouse' ? <InHousePage /> : null}
      {tab === 'passports' ? <PassportExplorePage /> : null}
    </div>
  );
}
