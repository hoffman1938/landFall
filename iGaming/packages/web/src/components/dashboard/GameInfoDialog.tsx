/**
 * GAME INFORMATION — the mandated disclosure surface.
 *
 * Every panel in this file exists because a clause requires it, and the reason
 * they are HERE rather than spread through the UI is that the gap register's
 * findings all failed the same way: the correct number lived in `constants.ts`
 * and in the math model, and nothing rendered it. So this component renders the
 * artefact directly — `stormPowerPaytable()`, `economyDisclosure()` and the
 * disclosure strings all come from @landfall/core, which is the same source the
 * server stamps onto rounds and serves at /api/rules. A number shown here cannot
 * drift from the certified one without the build failing.
 *
 *   GLI-19 §4.7.3   the ACTUAL ODDS of the highest advertised award (G9)
 *   GLI-19 §4.8.6   a mystery award's minimum and maximum (G9)
 *   GLI-19 §4.7.4   limitations on award amounts, explained (G9)
 *   GLI-19 §4.4.1(k) what the multiplier applies to (G41)
 *   GLI-19 §4.4.1(d) all winning outcomes — as a formula, this game has no paytable (G41)
 *   GLI-19 §4.7.2   how the RTP figure was determined, with its breakdown (G24)
 *   GLI-19 §4.11.1(c) house money in the pools, indicated to players (G8)
 *   GLI-19 §4.11.1(b) the table-placement rule, since it is not random (G43)
 *   GLI-19 §4.6.1(a) the perception of control the skill layer creates (G41)
 *   GLI-19 §A.4.5   player protection information (G36)
 *   GLI-19 §A.7.3   a way to report suspected cheating or collusion (G46)
 *   GLI-19 §2.6.2   identifiable software and version information (G34)
 *   GLI-19 §A.5.2   malfunction, disconnection and interrupted-game rules (G45)
 *   Order 222 Art. 8.1(b)  "Malfunction Voids All Pays", clearly and legibly (G12)
 *   Order 239 Art. 9.2     a place for the state Digital Seal (G13)
 *   GLI-19 §A.2.5   test accounts — the demo track, disclosed as what it is (G25)
 */
import {
  HOUSE_SEED_DISCLOSURE,
  INTERRUPTION_RULES,
  MALFUNCTION_NOTICE,
  RULES_CHANGELOG,
  RULES_VERSION,
  SKILL_DISCLOSURE,
  STORM_POWER_APPLIES_TO,
  STORM_POWER_MAX_PAYOUT_MULTIPLE,
  TABLE_ROUTING_DISCLOSURE,
  TIMING_DISCLOSURE,
  ZONE_COUNT,
  economyDisclosure,
  settlementFormulaDisclosure,
  stormPowerPaytable,
  stormPowerRange,
} from '@landfall/core';
import { BUILD_ID, BUILD_VERSION } from '../../buildInfo';
import { GameDialog } from './GameDialogs';

/** "1 in 1,048,576" — the form §4.7.3 asks for. */
function oddsLabel(oneIn: number): string {
  if (oneIn < 1.2) return 'most rounds';
  return `1 in ${Math.round(oneIn).toLocaleString('en-US')}`;
}

function sharePercent(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

/**
 * §4.7.3 / §4.8.6 / §4.7.4 — the Storm Power table, with real odds, the stated
 * minimum and maximum, and the exact condition under which the round payout cap
 * limits a tier. This is the table whose absence was gap G9.
 */
export function StormPowerTable() {
  const rows = stormPowerPaytable();
  const range = stormPowerRange();
  return (
    <div className="gd-paytable">
      <div className="gd-paytable-range">
        <span>
          <small>MINIMUM</small>
          <strong>{range.minMultiplier}</strong>
        </span>
        <span>
          <small>MAXIMUM</small>
          <strong className="gd-jackpot-accent">{range.maxMultiplier}</strong>
        </span>
      </div>
      <p className="gd-paytable-applies">{STORM_POWER_APPLIES_TO}</p>
      <div className="gd-table-scroll">
        <table>
          <caption className="gd-sr-only">
            Storm category multipliers with their actual odds and payout limits
          </caption>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Multiplier</th>
              <th scope="col">Actual odds</th>
              <th scope="col">Payout cap applies</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className={row.cappedAboveShare !== null ? 'is-capped' : ''}>
                <th scope="row">{row.label}</th>
                <td>{row.multiplier}</td>
                <td>{oddsLabel(row.oddsOneIn)}</td>
                <td className="gd-cap-cell">
                  {row.cappedAboveShare === null
                    ? 'Never'
                    : `Hit harbour over ${sharePercent(row.cappedAboveShare)} of the table`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gd-fine-print">
        A round&apos;s total payout is capped at <b>{STORM_POWER_MAX_PAYOUT_MULTIPLE}×</b> everything
        staked in that round. The cap never reduces your normal share — it only limits the bonus part
        — and when it applies at all, the result card and the verification record both say so.
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="gd-info-panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

export function GameInfoDialog({ onClose }: { onClose(): void }) {
  const economy = economyDisclosure();
  const current = RULES_CHANGELOG.find((r) => r.version === RULES_VERSION);
  return (
    <GameDialog title="Game information" onClose={onClose}>
      {/* Order 222 Annex 1 Art. 8.1(b) — clearly and legibly (G12). */}
      <p className="gd-malfunction" role="note">
        {MALFUNCTION_NOTICE}
      </p>

      <Panel title="Storm category odds">
        <StormPowerTable />
      </Panel>

      <Panel title="How a payout is calculated">
        <p>{settlementFormulaDisclosure(ZONE_COUNT)}</p>
        <dl className="gd-info-rows">
          <dt>Safe players receive</dt>
          <dd>{economy.survivorShare} of the hit harbour&apos;s pot</dd>
          <dt>Long-run return to players</dt>
          <dd>{economy.longRunReturn}</dd>
          <dt>Jackpot round</dt>
          <dd>{economy.surgeFrequency}</dd>
        </dl>
        {/* §4.7.2(a) — a displayed RTP must explain how it was determined. */}
        <p className="gd-fine-print">{economy.derivation}</p>
      </Panel>

      <Panel title="House money on the table">
        <p>{HOUSE_SEED_DISCLOSURE}</p>
      </Panel>

      <Panel title="Skill, and what it does not change">
        <p>{SKILL_DISCLOSURE}</p>
      </Panel>

      <Panel title="How you are seated">
        <p>{TABLE_ROUTING_DISCLOSURE}</p>
      </Panel>

      {/*
        Order 243 Annex 1 Art. 13(c)–(d): the time a player has to act, and what
        happens if they do not act in time. Both stated, rather than left to be
        inferred from the countdown on the board.
      */}
      <Panel title="How long you have, and what happens if you do nothing">
        <p>{TIMING_DISCLOSURE}</p>
      </Panel>

      <Panel title="If something goes wrong">
        {INTERRUPTION_RULES.map((rule) => (
          <div key={rule.title} className="gd-info-rule">
            <b>{rule.title}</b>
            <p>{rule.body}</p>
          </div>
        ))}
      </Panel>

      {/* GLI §A.4.5 — player protection information (G36). */}
      <Panel title="Playing safely">
        <p>
          This game is for entertainment. It is not a way to make money, and no pattern, system or
          timing can change your odds — every harbour has the same 1-in-6 chance every round.
        </p>
        <p>
          You can set your own loss limits, a per-round bet cap, a reality-check reminder, or take a
          break that locks you out, from <b>Menu → Play limits</b>. Tightening a limit applies
          immediately; loosening one waits 24 hours.
        </p>
        <p>
          Nobody under the legal age for their country may play. If gambling stops feeling like a
          game, stop and talk to someone — an operator running this game will show local help lines
          alongside it.
        </p>
      </Panel>

      {/* GLI §A.7.3 — a way to report suspected cheating or collusion (G46). */}
      <Panel title="Report a concern">
        <p>
          If you think another player is colluding, cheating or using automated software, report the
          round. Every action in every round is recorded with a signed receipt, so a report can be
          checked against the exact record of what happened.
        </p>
        <p className="gd-fine-print">
          In this demo build there is no operator to route a report to; use{' '}
          <b>Menu → Round history → Verify</b> to recheck any round yourself, and note the round
          number.
        </p>
      </Panel>

      {/* GLI §A.2.5 — test accounts. The demo track, named as what it is (G25). */}
      <Panel title="This is a demo build">
        <p>
          Everything here is played with <b>virtual credits that have no cash value</b>. There are no
          deposits, no withdrawals and no payments of any kind, and nothing on this table can be
          bought or cashed out.
        </p>
        <p>
          Some tables are shared with <b>practice opponents</b> so a quiet table still plays like a
          full one. They are marked as practice everywhere they appear, they never win the jackpot,
          and they cannot exist outside a demo build — the server refuses to start if one is
          configured anywhere else.
        </p>
      </Panel>

      <Panel title="Version and rules">
        <dl className="gd-info-rows">
          <dt>Game rules version</dt>
          <dd>
            v{RULES_VERSION}
            {current ? ` · in force from ${current.effective}` : ''}
          </dd>
          <dt>Software version</dt>
          <dd>
            {BUILD_VERSION} · {BUILD_ID}
          </dd>
        </dl>
        <p className="gd-fine-print">
          The rules version is recorded on every round as it opens, so a round is always settled and
          checked against the rules that were in force when your bet was accepted.
        </p>
        {/*
          Order 239 Art. 9.2 — the state Digital Seal belongs on a licensed
          operator's surface, proving live integration with the control system.
          The slot exists so the client has somewhere to render one; in a demo
          build there is nothing to render and saying so is more honest than
          drawing a decorative badge that resembles a regulatory mark.
        */}
        <div className="gd-seal-slot" aria-label="Regulatory seal area">
          <span>REGULATORY SEAL</span>
          <small>No licence — demo build. A licensed operator&apos;s seal appears here.</small>
        </div>
      </Panel>
    </GameDialog>
  );
}
