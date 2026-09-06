import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { audio } from '../audio/engine';
import { useStore } from '../store';
import { ChatPanel } from './ChatPanel';
import { ChatIcon, XIcon } from './icons';
import { SalvageLog } from './SalvageLog';

/**
 * Missions were removed from the product (remediation D7): they shipped without
 * design/RG review. If they ever return, they re-enter via the five-question
 * feature gate and an RG review — do not re-add a tab here before that.
 */
type PanelTab = 'chat' | 'activity';
type PanelMode = 'docked' | 'drawer' | 'sheet';

interface PanelPreferences {
  version: 1;
  desktopOpen: boolean;
  activeTab: PanelTab;
  lastSeenChatAt: number;
}

const STORAGE_KEY = 'landfall.secondary-panel.v1';
const TABS: readonly PanelTab[] = ['chat', 'activity'];
const TAB_LABELS: Record<PanelTab, string> = {
  chat: 'Chat',
  activity: 'Activity',
};
const DEFAULT_PREFERENCES: PanelPreferences = {
  version: 1,
  desktopOpen: false,
  activeTab: 'chat',
  lastSeenChatAt: 0,
};
const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** A persisted 'mission' preference from older builds fails this guard and falls back to chat. */
function isPanelTab(value: unknown): value is PanelTab {
  return value === 'chat' || value === 'activity';
}

function readPreferences(): PanelPreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed || typeof parsed !== 'object') return DEFAULT_PREFERENCES;
    const candidate = parsed as Partial<PanelPreferences>;
    if (candidate.version !== 1) return DEFAULT_PREFERENCES;

    return {
      version: 1,
      desktopOpen:
        typeof candidate.desktopOpen === 'boolean'
          ? candidate.desktopOpen
          : DEFAULT_PREFERENCES.desktopOpen,
      activeTab: isPanelTab(candidate.activeTab)
        ? candidate.activeTab
        : DEFAULT_PREFERENCES.activeTab,
      lastSeenChatAt:
        typeof candidate.lastSeenChatAt === 'number' &&
        Number.isFinite(candidate.lastSeenChatAt) &&
        candidate.lastSeenChatAt >= 0
          ? candidate.lastSeenChatAt
          : DEFAULT_PREFERENCES.lastSeenChatAt,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function currentPanelMode(): PanelMode {
  if (typeof window === 'undefined') return 'sheet';
  if (window.matchMedia('(min-width: 1280px)').matches) return 'docked';
  if (window.matchMedia('(min-width: 768px)').matches) return 'drawer';
  return 'sheet';
}

function usePanelMode(): PanelMode {
  const [mode, setMode] = useState<PanelMode>(currentPanelMode);

  useEffect(() => {
    const dockedQuery = window.matchMedia('(min-width: 1280px)');
    const drawerQuery = window.matchMedia('(min-width: 768px)');
    const update = () => {
      setMode(dockedQuery.matches ? 'docked' : drawerQuery.matches ? 'drawer' : 'sheet');
    };

    update();
    dockedQuery.addEventListener('change', update);
    drawerQuery.addEventListener('change', update);
    return () => {
      dockedQuery.removeEventListener('change', update);
      drawerQuery.removeEventListener('change', update);
    };
  }, []);

  return mode;
}

/**
 * Unified secondary surface. It owns its launcher, responsive presentation,
 * persisted desktop preference, tab state, and chat unread bookkeeping.
 */
export function SecondaryPanel() {
  const chat = useStore((state) => state.chat);
  const myName = useStore((state) => state.name);
  const connected = useStore((state) => state.connected);
  const mode = usePanelMode();
  const [preferences, setPreferences] = useState<PanelPreferences>(readPreferences);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const tabButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const focusPanelOnOpenRef = useRef(false);
  const hasInitialChatBaseline = useRef(preferences.lastSeenChatAt > 0);
  const titleId = useId();
  const panelId = `${titleId}-panel`;
  const open = mode === 'docked' ? preferences.desktopOpen : overlayOpen;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // Storage may be disabled; the panel still works for this session.
    }
  }, [preferences]);

  // Overlay state is never carried into a different breakpoint. In particular,
  // mobile always arrives closed rather than inheriting a desktop preference.
  useEffect(() => {
    if (mode !== 'docked') setOverlayOpen(false);
  }, [mode]);

  const chatSummary = useMemo(() => {
    let latestAt = 0;
    let unread = 0;

    for (const message of chat) {
      latestAt = Math.max(latestAt, message.at);
      if (
        message.at > preferences.lastSeenChatAt &&
        (myName === null || message.name !== myName)
      ) {
        unread += 1;
      }
    }

    return { latestAt, unread };
  }, [chat, myName, preferences.lastSeenChatAt]);

  const markChatSeen = useCallback((at: number) => {
    setPreferences((current) =>
      at > current.lastSeenChatAt ? { ...current, lastSeenChatAt: at } : current,
    );
  }, []);

  // WELCOME includes a chat tail. Treat that initial history as context, then
  // count only messages arriving after the first authoritative connection.
  useEffect(() => {
    if (hasInitialChatBaseline.current || !connected) return;
    hasInitialChatBaseline.current = true;
    if (chatSummary.latestAt > 0) markChatSeen(chatSummary.latestAt);
  }, [chatSummary.latestAt, connected, markChatSeen]);

  useEffect(() => {
    if (!open || preferences.activeTab !== 'chat' || chatSummary.latestAt === 0) return;
    markChatSeen(chatSummary.latestAt);
  }, [chatSummary.latestAt, markChatSeen, open, preferences.activeTab]);

  const unreadCount = hasInitialChatBaseline.current ? chatSummary.unread : 0;

  const restoreFocus = useCallback(() => {
    window.requestAnimationFrame(() => {
      const target = returnFocusRef.current;
      if (target?.isConnected) target.focus();
      else launcherRef.current?.focus();
    });
  }, []);

  const closePanel = useCallback(() => {
    if (mode === 'docked') {
      setPreferences((current) => ({ ...current, desktopOpen: false }));
    } else {
      setOverlayOpen(false);
    }
    restoreFocus();
  }, [mode, restoreFocus]);

  const openPanel = () => {
    const activeElement = document.activeElement;
    returnFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    focusPanelOnOpenRef.current = true;
    audio.click('nav');
    if (mode === 'docked') {
      setPreferences((current) => ({ ...current, desktopOpen: true }));
    } else {
      setOverlayOpen(true);
    }
  };

  const selectTab = (tab: PanelTab) => {
    audio.click('nav');
    setPreferences((current) =>
      current.activeTab === tab ? current : { ...current, activeTab: tab },
    );
  };

  useEffect(() => {
    if (!open || !focusPanelOnOpenRef.current) return;
    focusPanelOnOpenRef.current = false;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePanel();
        return;
      }

      if (event.key !== 'Tab' || mode === 'docked') return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [],
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closePanel, mode, open]);

  const onTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) => {
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextTab = TABS[nextIndex];
    if (!nextTab) return;
    selectTab(nextTab);
    tabButtonRefs.current[nextIndex]?.focus();
  };

  const panelClass =
    mode === 'docked'
      ? 'relative z-20 flex h-full w-72 shrink-0 flex-col overflow-hidden border-l border-[var(--lf-line)] bg-[var(--lf-surface)]'
      : mode === 'drawer'
        ? 'lf-sheet fixed bottom-0 right-0 top-10 z-50 flex w-[min(22rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-l-lg border border-r-0 border-[var(--lf-line)] bg-[var(--lf-surface)]'
        : 'lf-sheet fixed inset-x-0 bottom-0 z-50 flex h-[72dvh] max-h-[44rem] flex-col overflow-hidden rounded-t-lg border border-b-0 border-[var(--lf-line)] bg-[var(--lf-surface)] pb-[env(safe-area-inset-bottom)]';

  return (
    <>
      {!open ? (
        <button
          ref={launcherRef}
          type="button"
          onClick={openPanel}
          className="lf-surface absolute right-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-md text-[var(--lf-dim)] transition-colors hover:border-[var(--lf-line-2)] hover:text-[var(--lf-text)]"
          aria-label={`Open Chat and Activity${unreadCount > 0 ? `, ${unreadCount} unread chat messages` : ''}`}
          aria-controls={panelId}
          aria-expanded="false"
          aria-haspopup={mode === 'docked' ? undefined : 'dialog'}
          data-secondary-panel-launcher
        >
          <ChatIcon size={20} />
          {unreadCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-white px-1 text-[10px] font-extrabold text-black"
              aria-hidden="true"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </button>
      ) : null}

      {open && mode !== 'docked' ? (
        <div
          className={`fixed z-40 bg-black/80 ${mode === 'drawer' ? 'inset-x-0 bottom-0 top-10' : 'inset-0'}`}
          aria-hidden="true"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closePanel();
          }}
          data-secondary-panel-backdrop
        />
      ) : null}

      {open ? (
        <aside
          ref={panelRef}
          id={panelId}
          role={mode === 'docked' ? undefined : 'dialog'}
          aria-modal={mode === 'docked' ? undefined : true}
          aria-labelledby={titleId}
          className={panelClass}
          data-secondary-panel
          data-panel-mode={mode}
        >
          <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-[var(--lf-line)] px-3">
            <div className="flex min-w-0 items-center gap-2">
              <ChatIcon size={18} />
              <h2 id={titleId} className="lf-label truncate !text-[var(--lf-dim)]">
                Table
              </h2>
            </div>
            <span
              className={`ml-auto h-2 w-2 rounded-md ${connected ? 'bg-[var(--lf-safe)]' : 'bg-[var(--lf-danger)]'}`}
              aria-hidden="true"
            />
            <span className="sr-only">{connected ? 'Connected' : 'Disconnected'}</span>
            <button
              ref={closeRef}
              type="button"
              onClick={() => {
                audio.click('nav');
                closePanel();
              }}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[var(--lf-dim)] hover:bg-[var(--lf-panel)] hover:text-[var(--lf-text)]"
              aria-label={mode === 'docked' ? 'Collapse chat panel' : 'Close chat panel'}
            >
              <XIcon size={18} />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Chat and activity"
            className="grid shrink-0 grid-cols-2 border-b border-[var(--lf-line)] bg-[var(--lf-bg)]/45 p-1"
          >
            {TABS.map((tab, index) => {
              const active = preferences.activeTab === tab;
              const tabId = `${titleId}-tab-${tab}`;
              const tabPanelId = `${titleId}-tabpanel-${tab}`;

              return (
                <button
                  key={tab}
                  ref={(node) => {
                    tabButtonRefs.current[index] = node;
                  }}
                  id={tabId}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-controls={tabPanelId}
                  tabIndex={active ? 0 : -1}
                  onClick={() => selectTab(tab)}
                  onKeyDown={(event) => onTabKeyDown(event, index)}
                  className={`relative min-h-11 rounded-lg px-2 text-sm font-extrabold ${
                    active
                      ? 'bg-[var(--lf-focus)] text-black'
                      : 'text-[var(--lf-dim)] hover:bg-[var(--lf-panel)] hover:text-[var(--lf-text)]'
                  }`}
                >
                  {TAB_LABELS[tab]}
                  {tab === 'chat' && unreadCount > 0 ? (
                    <span
                      className={`ml-1 inline-flex min-w-4 items-center justify-center rounded-md px-1 text-[9px] font-extrabold ${
                        active
                          ? 'bg-black/20 text-black'
                          : 'bg-[var(--lf-focus)] text-black'
                      }`}
                      aria-label={`${unreadCount} unread`}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div
            id={`${titleId}-tabpanel-${preferences.activeTab}`}
            role="tabpanel"
            aria-labelledby={`${titleId}-tab-${preferences.activeTab}`}
            tabIndex={0}
            className="min-h-0 flex-1 overflow-hidden"
          >
            {preferences.activeTab === 'chat' ? (
              <ChatPanel showHeader={false} dense />
            ) : (
              <SalvageLog showHeader={false} dense />
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
