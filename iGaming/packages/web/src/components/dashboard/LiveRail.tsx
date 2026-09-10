import { useEffect, useRef, useState } from 'react';
import { CHAT_MAX_LEN } from '@landfall/core';
import { audio } from '../../audio/engine';
import { fmt, useStore } from '../../store';
import type { FeedRound } from '../../liveFeed';

type Tab = 'live' | 'chat' | 'rounds';

const TABS: { id: Tab; label: string }[] = [
  { id: 'live', label: 'Live' },
  { id: 'chat', label: 'Chat' },
  { id: 'rounds', label: 'Rounds' },
];

/**
 * The side of the screen where other people exist.
 *
 * An instant game with no visible table is a slot machine with extra steps, and
 * LANDFALL's payouts are literally made of other players' money — a room you
 * cannot see is a rule you cannot feel. Three tabs, one at a time, so the
 * social layer is always one click away and never in front of the board:
 *
 *   Live    every fleet that settled, round by round — wins AND losses, with
 *           practice fleets labelled (see ../../liveFeed.ts).
 *   Chat    the table's conversation, already server-rate-limited.
 *   Rounds  which harbor was hit recently, and one click to verify any of them.
 *
 * It sits beside the board on desktop and below it on phones, where the game
 * itself takes the fold. Nothing here ever overlays the harbors or the dock.
 */
export function LiveRail() {
  const [tab, setTab] = useState<Tab>('live');
  const feed = useStore((s) => s.liveFeed);
  const chat = useStore((s) => s.chat);
  const connected = useStore((s) => s.connected);
  // A quiet badge, not a notification: it says the table has been talking while
  // you were reading results, and clears the moment you open the tab.
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (tab === 'chat') setSeen(chat.length);
  }, [tab, chat.length]);
  const unread = tab === 'chat' ? 0 : Math.max(0, chat.length - seen);

  return (
    <aside className="gd-rail gd-live-rail" aria-label="Table activity">
      <div className="gd-tabs" role="tablist" aria-label="Table activity">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`gd-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`gd-panel-${t.id}`}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'chat' && unread > 0 ? <em aria-label={`${unread} new`}>{unread}</em> : null}
          </button>
        ))}
      </div>

      {tab === 'live' && <LiveResults feed={feed} />}
      {tab === 'chat' && <TableChat />}
      {tab === 'rounds' && <RecentRounds />}

      <div className="gd-connection">
        <span className={connected ? 'is-online' : ''} />
        {connected ? 'Connected to table' : 'Reconnecting…'}
      </div>
    </aside>
  );
}

function LiveResults({ feed }: { feed: FeedRound[] }) {
  const anchors = useStore((s) => s.anchors);
  const hasPractice = feed.some((r) => r.rows.some((row) => row.bot));

  return (
    <div
      className="gd-panel gd-feed"
      role="tabpanel"
      id="gd-panel-live"
      aria-labelledby="gd-tab-live"
    >
      <p className="gd-panel-lede">
        {anchors.length > 0
          ? `${anchors.length} ${anchors.length === 1 ? 'fleet is' : 'fleets are'} in this round.`
          : 'Settled results appear here as each round ends.'}
      </p>
      {/*
        Not a live region. Seven settled rows arrive every twenty seconds, and
        announcing all of them turns a screen reader into a firehose that talks
        over the thing the player is actually doing. It stays a labelled log
        that can be read on purpose.
      */}
      <div className="gd-feed-scroll" role="log" aria-label="Live results" aria-live="off">
        {feed.length === 0 ? (
          <p className="gd-empty">The first result will appear here.</p>
        ) : (
          feed.map((round) => (
            <section key={round.roundId} className="gd-feed-round">
              <h3>
                <span>#{round.roundId}</span>
                <b>Harbor {round.struckZone + 1} hit</b>
                {round.multiplier > 1 && <i>×{round.multiplier}</i>}
              </h3>
              <p className="gd-feed-tally">
                {round.wonCount} won · {round.lostCount} lost
              </p>
              <ul>
                {round.rows.map((row) => (
                  <li key={row.key} className={row.you ? 'is-you' : ''}>
                    <span className="gd-feed-name">
                      {/*
                        The nickname is the only part allowed to be truncated.
                        It used to be a bare text node in a flex row, so a long
                        one pushed the tags out of the box and the ellipsis ate
                        the "practice" label — cutting off precisely the word
                        that keeps the feed honest.
                      */}
                      <span className="gd-feed-nick">{row.name}</span>
                      {row.you && <em>you</em>}
                      {row.bot && !row.you && <i title="Demo practice fleet">practice</i>}
                      {row.jackpot && <b>jackpot</b>}
                    </span>
                    <span
                      className={`gd-feed-net ${row.netMinor > 0 ? 'is-win' : row.netMinor < 0 ? 'is-loss' : ''}`}
                    >
                      {row.netMinor >= 0 ? '+' : '−'}
                      {fmt(Math.abs(row.netMinor))}
                    </span>
                  </li>
                ))}
              </ul>
              {round.truncated && <p className="gd-feed-more">Top {round.rows.length} shown</p>}
            </section>
          ))
        )}
      </div>
      {hasPractice && (
        <p className="gd-panel-note">
          This demo table seats practice fleets. They are marked and play with virtual credits like
          everyone else.
        </p>
      )}
    </div>
  );
}

function TableChat() {
  const chat = useStore((s) => s.chat);
  const myName = useStore((s) => s.name);
  const connected = useStore((s) => s.connected);
  const sendChat = useStore((s) => s.sendChat);
  const [draft, setDraft] = useState('');
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [chat.length]);

  const text = draft.trim();
  const canSend = connected && text.length > 0;

  return (
    <div
      className="gd-panel gd-chat"
      role="tabpanel"
      id="gd-panel-chat"
      aria-labelledby="gd-tab-chat"
    >
      <div ref={scroller} className="gd-chat-scroll" role="log" aria-label="Table chat">
        {chat.length === 0 ? (
          <p className="gd-empty">No messages yet. Say hello.</p>
        ) : (
          chat.map((m, i) => (
            <p key={`${m.at}-${i}`} className={myName === m.name ? 'is-you' : ''}>
              <b>{m.name}</b>
              {m.text}
            </p>
          ))
        )}
      </div>
      <form
        className="gd-chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!canSend) return;
          audio.click('send');
          sendChat(text);
          setDraft('');
        }}
      >
        <label htmlFor="gd-chat-input" className="gd-label">
          MESSAGE
        </label>
        <div>
          <input
            id="gd-chat-input"
            value={draft}
            maxLength={CHAT_MAX_LEN}
            autoComplete="off"
            disabled={!connected}
            placeholder={connected ? 'Type a message…' : 'Reconnecting…'}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={!canSend}>
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function RecentRounds() {
  const cards = useStore((s) => s.replayCards);
  const wreckLog = useStore((s) => s.wreckLog);
  const openVerify = useStore((s) => s.openVerify);
  const setWreckLogOpen = useStore((s) => s.setWreckLogOpen);

  // Where the storm has landed lately. Shown as counts, not as a streak: six
  // bars that keep moving toward even is a truer picture of a 1/6 draw than a
  // list a player can read a pattern into.
  const recent = cards.length ? cards.map((c) => c.struckZone) : wreckLog;
  const counts = [0, 1, 2, 3, 4, 5].map(
    (zone) => recent.slice(-20).filter((z) => z === zone).length,
  );
  const peak = Math.max(1, ...counts);

  return (
    <div
      className="gd-panel gd-rounds"
      role="tabpanel"
      id="gd-panel-rounds"
      aria-labelledby="gd-tab-rounds"
    >
      <p className="gd-panel-lede">Harbors hit in the last {Math.min(recent.length, 20)} rounds.</p>
      <ul className="gd-hit-bars">
        {counts.map((count, zone) => (
          <li key={zone}>
            <span className="gd-hit-bar" aria-hidden="true">
              <span style={{ height: `${(count / peak) * 100}%` }} />
            </span>
            <b>{zone + 1}</b>
            <i>{count}</i>
          </li>
        ))}
      </ul>
      <p className="gd-panel-note">
        Every harbor stays at a 1-in-6 chance every round. Past results do not change the next one.
      </p>
      <ol className="gd-round-list">
        {cards
          .slice(-8)
          .reverse()
          .map((card) => (
            <li key={card.roundId}>
              <button
                type="button"
                onClick={() => openVerify(card.roundId)}
                aria-label={`Verify round ${card.roundId}, Harbor ${card.struckZone + 1} hit`}
              >
                <span>#{card.roundId}</span>
                <strong>Harbor {card.struckZone + 1}</strong>
                {card.stormPower && card.stormPower.mNum > card.stormPower.mDen && (
                  <small>×{card.stormPower.mNum / card.stormPower.mDen}</small>
                )}
              </button>
            </li>
          ))}
      </ol>
      <button type="button" className="gd-text-button" onClick={() => setWreckLogOpen(true)}>
        View all rounds
      </button>
    </div>
  );
}
