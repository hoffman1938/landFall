import { lazy, Suspense, useState } from 'react';
import { GameDashboard } from './components/dashboard/GameDashboard';
import { getUiMode, setUiMode, withMode } from './uiMode';

const AdvancedGame = lazy(() => import('./AdvancedGame'));

/** A fresh, simple dashboard is the entry point, including for existing profiles. */
export default function App() {
  const [advanced, setAdvanced] = useState(false);
  if (advanced) {
    return (
      <Suspense fallback={<div className="gd-loading">Loading advanced controls…</div>}>
        <AdvancedGame onSimple={() => setAdvanced(false)} />
      </Suspense>
    );
  }
  return (
    <GameDashboard
      onAdvanced={() => {
        setUiMode(withMode(getUiMode(), 'advanced'));
        setAdvanced(true);
      }}
    />
  );
}
