import { useEffect } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { HarborMap } from './components/HarborMap';
import { ResultBanner } from './components/ResultBanner';
import { RulesModal } from './components/RulesModal';
import { SalvageLog } from './components/SalvageLog';
import { StakeBar } from './components/StakeBar';
import { TopBar } from './components/TopBar';
import { VerifyModal } from './components/VerifyModal';
import { WreckLog } from './components/WreckLog';
import { useStore } from './store';

export default function App() {
  const toast = useStore((s) => s.toast);
  const dismissToast = useStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(dismissToast, 3500);
    return () => clearTimeout(t);
  }, [toast, dismissToast]);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1 p-3">
          <ResultBanner />
          <HarborMap />
        </main>
        <aside className="hidden w-80 shrink-0 flex-col border-l border-[var(--lf-line)] md:flex">
          <div className="h-2/5 min-h-0 border-b border-[var(--lf-line)]">
            <SalvageLog />
          </div>
          <div className="min-h-0 flex-1">
            <ChatPanel />
          </div>
        </aside>
      </div>
      <WreckLog />
      <StakeBar />
      <VerifyModal />
      <RulesModal />
      {toast && (
        <div className="fixed bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-md bg-[var(--lf-danger)]/95 px-4 py-2 text-sm font-semibold text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
