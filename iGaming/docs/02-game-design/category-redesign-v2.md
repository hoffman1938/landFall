# LANDFALL Category Redesign v2

**Prepared by:** Principal Game Designer  
**Purpose:** Redesign the existing LANDFALL game so it can compete emotionally and socially with
Aviator/JetX-scale instant games without replacing its core identity.  
**Status:** Target design. Current runnable MVP implements the v1 core plus Storm Power and
Storm Surge; this document specifies the v2 product direction and migration roadmap.

---

## 0. Non-Negotiable Identity

The redesign preserves these systems exactly:

1. Six harbors.
2. The storm destroys exactly one harbor.
3. Pari-mutuel economy: the struck harbor's value funds the survivors, minus rake.
4. Players compete against players through crowd distribution and stake placement.
5. Provably fair RNG: the struck harbor and any seed-derived spectacle are verifiable.
6. Fixed 20-second rounds.

The redesign does **not** preserve one v1 assumption: "one visible live EV calculation should be
the whole game." That assumption creates the obvious strategy and bot problem. v2 keeps the
same economic core but changes the information, commitment, decision, and spectacle layers.

## 1. Product Thesis

LANDFALL v1 is a clean pari-mutuel survivor game. LANDFALL v2 should be a 20-second social
pressure game:

> Read imperfect tide reports, place your fleet, signal or bluff, survive the storm, and watch
> the crowd discover who outguessed whom when the fog clears.

The player-facing rule remains teachable in under 15 seconds:

> Pick one or two harbors before the timer ends. The last seconds are foggy, so final moves are
> revealed together. One harbor is wrecked. Everyone else splits its cargo.

## 2. Problems Diagnosed From the Current Project

| Problem | Current cause | v2 design answer |
|---|---|---|
| Obvious optimal strategy | Exact live pools plus free final re-anchor make "jump to the emptiest harbor late" dominant. | Public Tide Reports, Blind Fog Lock, and one Final Order remove exact last-tick EV. |
| Bot solvability | A script can read final pool totals and submit a deterministic move near lock. | Delayed/banded public information, hidden simultaneous final orders, no live exact pool API, and action receipts. |
| Pro extraction of casuals | Skilled players can identify whales/casual herds and harvest them with precision. | Stake banding, live anonymity, stake-tier rooms, split orders, and casual-facing compass cues. |
| Low emotional tension | v1 has choose -> wait -> explosion. | Rising pressure phases, fog, simultaneous reveal, near-miss storm path, and post-round replay. |
| Weak spectacle | Most drama is numeric bar movement. | Seed-derived storm choreography, fleet movement, signal flags, impact cinematics, salvage arcs, and clip cards. |
| Repetition | Same EV calculation each round. | Variable weather patterns, bluff signals, split/focus decisions, Surge/Power pressure, and crowd replay. |
| One meaningful click | One harbor selection carries the whole round. | Stake plan, focus/split, early signal, final order, hold/move decision, and social baiting. |

## 3. Redesigned 20-Second Round

| Time | Phase | Player decisions | Public information | Emotion |
|---|---|---|---|---|
| 0.0-2.0s | Round Header | Set stake preset; read Surge/Weather/house seed. | Previous round card, chain position, Surge pot, weather pattern. | Reset and intent. |
| 2.0-9.0s | Open Tide | Anchor, adjust stake, choose Focus or Split, place one signal flag. | Tide Reports update in bands/trends, not exact real-time totals. | Scouting and baiting. |
| 9.0-12.0s | Blind Fog | Submit one Final Order: hold, move, or split adjustment. | Public pool display freezes; signals and chat remain visible. | Pressure, doubt, simultaneous mind game. |
| 12.0-16.0s | Storm Approach | No actions. | Lock snapshot reveal, fleet snap, seed-derived feints, threat cone. | Anticipation climbs like Crash without a cash-out clone. |
| 16.0-19.0s | Landfall | No actions. | One harbor is destroyed, Storm Power revealed, salvage and Surge resolve. | Impact, relief, regret, celebration. |
| 19.0-20.0s | Replay Card | Rebet/sit-out preparation. | "What changed in the fog" summary and next commitment. | Social proof and clip moment. |

The final 3 seconds still accept player decisions, but they are not a live public EV auction.
That is the key category shift.

## 4. Complete Redesigned Feature List

### Core Gameplay Features

- **Public Tide Reports:** live pools are shown as delayed, rounded, shared reports rather than
  exact telemetry.
- **Blind Fog Lock:** the final 3 seconds hide incoming movement; all final orders reveal
  simultaneously at lock.
- **Final Order:** each player gets one decisive late order: hold, move, or update split.
- **Fleet Orders:** players may play Focus (100% one harbor) or Split (preset two-harbor
  allocation such as 70/30).
- **Signal Flags:** one public social signal per round, independent of the actual final order.
- **Stake Band Privacy:** live UI shows stake bands and crowd weight, not exact per-player
  exploitable amounts.
- **Harbor Compass:** optional casual-friendly hints that describe crowd risk in words, not EV
  numbers.
- **Stake-Tier Rooms and Whale Guardrails:** max stake scales with room tier and/or current
  public liquidity.
- **Weather Patterns:** seed-verifiable round modifiers that change information texture, not
  odds or payout math.

### Emotional and Spectator Features

- **Pressure Meter:** a rising storm bar that marks Open Tide -> Blind Fog -> Lock.
- **Seed-Derived Storm Choreography:** threat cone, fake landfall brushes, near misses, and
  final impact derived from digest spans disjoint from outcome-critical bits.
- **Fog Reveal Moment:** at lock, the game reveals where the crowd actually ended up.
- **Wreck Wake Replay:** one-second recap of major crowd shifts, biggest bait, and biggest
  survivor.
- **Clip Card:** post-round share/spectator card: "42% fled Harbor 3 in fog; Harbor 3 got hit."
- **Enhanced Surge/Storm Power Presentation:** pre-announced Surge tension plus hidden Storm
  Power category reveal.

### Fairness, Security, and Anti-Bot Features

- **Canonical Lock Snapshot:** exact stake entries remain public after lock for payout
  verification.
- **No Per-Player Differential Pool Feedback:** anchor ACKs confirm only the player's accepted
  order, not updated global totals.
- **Signed Action Receipts:** final orders receive server timestamp/sequence receipts to resolve
  lock-boundary disputes.
- **Human-Scale Action Caps:** one signal, one final order, and conservative re-anchor cadence.
- **Bot Telemetry:** detect accounts with impossible reaction regularity, synchronized swarms,
  and repeated minimum-stake probing.
- **Public Verification Extension:** verification recomputes struck harbor, Storm Power, Surge,
  weather pattern, storm choreography, and payout arithmetic.

## 5. New Gameplay Mechanics

### Mechanic 1: Public Tide Reports

Current v1 exact live bars are replaced by public reports that update on a cadence and round
values into bands. Example display:

```
Harbor 1: Heavy + rising
Harbor 2: Light + stable
Harbor 3: Medium + falling
```

Exact totals are still published in the lock snapshot and used for settlement. The uncertainty
exists only during decision-making and is identical for everyone in the room.

### Mechanic 2: Blind Fog Lock

At the final 3 seconds, public pool movement freezes. Players may submit one Final Order, but
the room does not see those final moves until lock. At lock, the fleet snaps into the true final
distribution and the storm approach begins.

This turns the endgame from a reaction-speed auction into a simultaneous prediction game.

### Mechanic 3: Final Order

Each player has one late order:

- **Hold:** keep the current fleet plan.
- **Move:** move a Focus anchor to a different harbor.
- **Adjust Split:** keep Split mode but change the secondary harbor or swap 70/30 direction.

The one-order limit is easy to understand, mobile-friendly, and prevents scripts from spamming
micro-adjustments.

### Mechanic 4: Fleet Orders - Focus or Split

Players choose one of two simple stake shapes:

- **Focus:** 100% of stake in one harbor. Highest emotional risk, highest upside when large
  enemy pools are wrecked.
- **Split:** stake becomes two stake entries, e.g. 70% primary and 30% secondary. If one of the
  player's harbors is struck, only that portion is lost; surviving portions still receive
  salvage pro-rata like any other survivor.

This preserves pari-mutuel settlement because Split is just multiple stake entries in the
existing settlement model. It adds risk control without insurance, side bets, or a paytable.

### Mechanic 5: Signal Flags

Once per round, a player may place a public signal on a harbor:

- **Rally:** "I want people here."
- **Flee:** "This harbor is dangerous."
- **Hold:** "I am staying."

Signals have no payout effect. They create social bait, reputation, coordination, and
spectator-readable mind games. The UI must label them clearly as signals, not confirmed
positions.

### Mechanic 6: Stake Band Privacy

During the decision window, individual stakes are displayed as bands such as Small, Medium,
Large, and Heavy. Exact player stake amounts appear only in the canonical lock snapshot and
verification modal.

This prevents exact whale tracking while preserving enough public information for skillful
crowd reading.

### Mechanic 7: Harbor Compass

A lightweight UI assistant translates tide reports into plain-language risk labels:

- "Crowded but falling"
- "Light, likely to attract late moves"
- "Stable medium"
- "Whale pressure detected"

It never recommends a single mathematically optimal harbor and never shows exact EV. Its job is
to keep casual players in the strategic conversation.

### Mechanic 8: Weather Patterns

Each round has a public weather pattern derived from a non-outcome digest span and announced in
the header. Weather changes only information presentation and spectacle.

Initial set:

| Weather | Effect | Why it exists |
|---|---|---|
| Clear Tide | Standard report cadence and 3s Blind Fog. | Baseline readability. |
| Heavy Fog | Blind Fog begins 1s earlier; reports become broader bands. | Higher bluff value and bot resistance. |
| Crosswind | Signal flags reveal with a short delay. | More social misdirection. |
| High Swell | Storm approach has stronger near-miss choreography. | Spectacle round with no payout change. |

Weather never changes strike odds, number of harbors, rake, or settlement.

### Mechanic 9: Wreck Wake Replay and Clip Card

After payout, the UI shows a short replay card:

- biggest fog movement;
- most crowded safe harbor;
- struck harbor value;
- biggest salvage;
- whether a signal was honest or a bluff;
- Surge/Storm Power headline when relevant.

This makes the "why this round mattered" obvious to players and spectators.

## 6. Mechanic Impact Matrix

| Mechanic | Why it exists | Fixes problems | Player psychology | Retention | Monetization | Spectator value | Possible exploits | Countermeasures | Balance impact | Complexity | Dev difficulty | Risk | Long-term engagement |
|---|---|---|---|---|---|---|---|---|---|---:|---|---|---|
| Public Tide Reports | Remove exact solvability while preserving crowd reading. | #1, #2, #3, #6 | Players infer, doubt, and anticipate instead of compute. | More varied rounds; fewer "solved" sessions. | Higher session length and healthier liquidity. | Viewers can read trends without spreadsheets. | Multi-account probing to infer hidden totals. | No global totals in ACKs, min stake, session caps, telemetry. | EV unchanged; information edge reduced. | 3 | Medium | Players may distrust hidden live data. | High if verification copy is strong. |
| Blind Fog Lock | Make final decisions simultaneous. | #1, #2, #4, #7 | Last seconds become pressure and regret. | Strong "one more round" trigger. | More rounds per session without raising edge. | The fog reveal is a clip moment. | Network-latency complaints near lock. | Server timestamp receipts, clear cutoff, mobile haptics/audio. | EV unchanged; variance of prediction increases. | 4 | Medium | Needs excellent UX clarity. | Very high; this is the signature v2 mechanic. |
| Final Order | Give one decisive late choice without spam. | #2, #7 | Players feel agency under pressure. | Creates micro-goals each round. | Better engagement from active decision-making. | Easy for commentators to explain. | Automated last-order submission. | Still allowed, but no exact final info; one-order cap. | No economy change. | 2 | Low-Medium | Too restrictive for v1 power users. | Medium-high. |
| Fleet Orders | Add risk posture: focus vs defend. | #3, #6, #7 | "Do I go for the clean hit or protect myself?" | Supports different player personalities. | Broadens appeal to casual and high-risk players. | Split survival creates visible near-misses. | Splitting could become default if UI over-rewards safety. | Preset ratios, no insurance, analytics on focus/split EV by population. | Linear pari-mutuel EV; volatility control only. | 5 | Medium-High | More math to explain. | High if onboarding stays simple. |
| Signal Flags | Add bluffing and social play. | #4, #6, #7 | Players can lie, bait, rally, and build reputation. | Social memory drives repeat play. | Strong chat retention without pay-to-win. | Signals make intent visible on Twitch. | Spam, collusion, fake authority. | One signal per round, system styling, mute/report tools. | No payout impact. | 3 | Medium | Could become noise if costless. | Medium; best with enough population. |
| Stake Band Privacy | Reduce predatory whale hunting. | #2, #3 | Casuals feel less exposed. | Protects new users from immediate exploitation. | Healthier ecosystem and lower churn. | Cleaner UI at scale. | Players infer whales by names/history. | Optional anonymity, rotating display names in high-stakes rooms, exact data only post-lock. | No settlement change; reduces precision edge. | 3 | Medium | Transparency concerns. | High for ecosystem health. |
| Harbor Compass | Help casuals reason without giving bots an EV API. | #3, #6 | Players feel competent quickly. | Better day-1 retention. | Converts spectators into players. | Makes decisions legible to viewers. | Reverse-engineering labels into EV. | Coarse labels, no exact formula display, server-side label generation from public reports. | No economy change. | 4 | Medium | Bad labels can feel patronizing. | Medium-high. |
| Weather Patterns | Prevent identical rounds. | #2, #4, #6 | Players adapt instead of repeat. | Long-run variety without progression clutter. | More durable content from same core. | Each round has a headline texture. | Pattern-specific solved scripts. | Rotate small set, tune cadence, all patterns preserve hidden final info. | No odds/payout change. | 4 | Medium | Too many patterns could confuse users. | High if limited to 3-4 patterns. |
| Wreck Wake Replay | Turn outcomes into stories. | #4, #5, #6 | Players understand why they won/lost and want revenge. | Strong memory hooks and social sharing. | Organic acquisition and longer sessions. | Direct viral clip artifact. | Replay accusations if numbers differ from verification. | Replay uses lock snapshot and event log only. | No balance impact. | 3 | Medium | Needs polished visuals. | Very high. |
| Enhanced Storm Choreography | Make waiting emotionally active. | #4, #5 | The storm feels like a rising threat. | Increases perceived drama per round. | Better streaming appeal and brand recall. | Core Twitch surface. | Players think feints imply outcome bias. | Verifiable digest-derived cosmetics and clear copy. | No economy change. | 4 | High | Must avoid misleading near-misses. | High. |

Complexity score: 1 = almost invisible to players, 10 = too complex for this product. Anything
above 6 should be rejected or split into a later experiment.

## 7. Strategy Space After Redesign

v2 should support multiple viable strategies without guaranteeing profit:

| Strategy | How it plays | Strength | Weakness | Why it is not dominant |
|---|---|---|---|---|
| Fog Ambusher | Waits for reports, submits one hidden final move. | Good against obvious herds. | Predicts without exact final data. | Other ambushers can pile into the same harbor unseen. |
| Early Baiter | Anchors visibly and signals to shape crowd behavior. | Creates false narratives. | May become trapped if others call the bluff. | Signals do not force anyone and final moves are hidden. |
| Steady Splitter | Uses 70/30 Split to reduce variance. | Lower emotional downside. | Dilutes exposure to the best single EV spot. | EV is linear across stake entries; no free insurance. |
| Focus Hunter | Concentrates stake on a predicted undercrowded harbor. | Highest upside and best Surge lottery leverage per position. | Full loss if struck. | Hidden final crowd can erase the perceived edge. |
| Social Captain | Uses chat and signals to coordinate moves. | Can move casual groups. | Reputation can be exploited by rivals. | Coordination is public and can be counter-baited. |
| Contrarian Holder | Stays when everyone expects a late flee. | Wins when fog panic overcorrects. | Looks wrong for most of the round. | Only works if others actually flee. |

The goal is not perfect equality. The goal is that no strategy collapses into "calculate final
empty harbor and click at 199ms."

## 8. Anti-Bot Design

The anti-bot posture is product-native, not punitive:

1. **Do not publish exact final information.** If exact pool state is public until lock, a bot
   can solve the round faster than a human.
2. **Make the decisive moment simultaneous.** Blind Fog converts the endgame into prediction
   rather than reaction.
3. **Limit action surfaces.** One signal and one Final Order are enough for humans and deny
   scripts a high-frequency edge.
4. **Keep fairness auditable.** Hidden during play does not mean hidden after play: every final
   stake entry is revealed in the lock snapshot.
5. **Detect ecosystem abuse.** Look for swarm movement, repeated probe accounts, synchronized
   final orders, and reaction regularity impossible for humans.

Rejected anti-bot ideas:

- CAPTCHAs inside rounds: destroys flow and punishes humans.
- Randomly rejecting late orders: unfair and unverifiable.
- Secretly changing strike probabilities: violates the identity and provable fairness.
- Personalized pool displays: creates fairness suspicion and should not ship.

## 9. Skill Gap Policy

Skill should come from reading people, timing commitment, bluffing, and risk shaping. It should
not come from extracting exact arithmetic from casual players.

v2 reduces predatory optimization by:

- hiding exact live stake amounts until lock;
- giving casual players Harbor Compass language;
- letting risk-averse players Split;
- moving the decisive edge from reaction speed to prediction;
- separating high-stake rooms so whales do not become the whole game for low-stake players;
- tracking top-player extraction rates by cohort.

Professional players should still win more often than casuals over time. They should not be
able to drain a room by running a final-second EV bot.

## 10. Balance Notes

### Pari-Mutuel Settlement With Split

Split creates multiple normal stake entries. Example:

```
Player stake: 100 credits
Split: 70 on Harbor 2, 30 on Harbor 5
If Harbor 2 is struck: 70 loses, 30 survives and receives salvage.
If Harbor 5 is struck: 30 loses, 70 survives and receives salvage.
If any other harbor is struck: both entries survive and receive salvage.
```

Expected value remains the weighted sum of the selected harbors' EVs. Split changes volatility
and psychology, not the house edge or pari-mutuel identity.

### Information Reduction

Tide Reports do not change payouts. They change what players can know before lock. The exact
lock snapshot must remain complete enough for:

- per-zone pool verification;
- per-stake payout verification;
- Storm Surge winner verification;
- post-round replay reconstruction.

### House Edge

The existing rake model remains valid as long as:

- the struck zone stays uniform across six harbors;
- settlement uses the final lock snapshot;
- weather and signals do not alter payouts;
- any Split entry is treated like an ordinary stake entry.

Storm Power and Storm Surge keep their current documented math unless separately retuned.

## 11. Visual and Audio Direction

### Visual Systems

- Harbors are living boards with flags, fleet clusters, tide bands, and storm pressure.
- The final fog physically rolls over the map and freezes public pool motion.
- At lock, fleets snap into true positions with a satisfying reveal.
- The storm approach uses seed-derived feints, wave shadows, lighthouse sweeps, and near misses.
- The struck harbor has a unique impact variant per weather pattern.
- Salvage arcs fly from wreck to survivors, with beacon amber still reserved for payout.
- The replay card compresses the round into one readable social story.

### Audio Systems

- Open Tide: low harbor ambience and soft report ticks.
- Blind Fog: muffled wind, heartbeat-like buoy knocks, reduced high frequencies.
- Lock Reveal: rope snap or bell cluster as hidden final moves reveal.
- Storm Approach: rising wind and spatial thunder around threatened harbors.
- Landfall: one clear impact, scaled by Storm Power.
- Salvage: beacon bell and amber shimmer only for true positive outcomes.

No sound should imply a win before the struck harbor is known.

## 12. Prioritized Roadmap

### P0 - Design Lock and Instrumentation

| Item | Output | Why first |
|---|---|---|
| v2 rules spec | This document accepted as target. | Aligns product, math, security, and UI. |
| Analytics definitions | Herding index, fog movement, focus/split rate, pro extraction, bot regularity. | Needed to tune without guessing. |
| Verification requirements | Extend records for reports, weather, final orders, and replay. | Prevents fairness debt. |

### P1 - Anti-Bot Core

| Item | Output | Difficulty | Risk |
|---|---|---|---|
| Tide Reports | Replace exact live pool stream with shared report snapshots. | Medium | Transparency concerns. |
| Blind Fog Lock | Final 3s hidden movement and simultaneous reveal. | Medium | UX clarity and latency disputes. |
| Final Order receipts | Timestamped ACKs and lock-boundary copy. | Low-Medium | Edge-case disputes if copy is weak. |
| Updated Rules/Verify UI | Explain hidden-before-lock, public-after-lock. | Medium | Must be very plain. |

### P2 - Decision Depth

| Item | Output | Difficulty | Risk |
|---|---|---|---|
| Focus/Split Fleet Orders | Two stake-shape presets. | Medium-High | Onboarding/maths complexity. |
| Signal Flags | One public bluff/coordination action. | Medium | Spam or noise. |
| Stake Band Privacy | Live stake bands; exact post-lock snapshot. | Medium | Player trust if poorly messaged. |
| Harbor Compass | Casual risk labels. | Medium | Labels must avoid being an EV oracle. |

### P3 - Spectacle and Replayability

| Item | Output | Difficulty | Risk |
|---|---|---|---|
| Weather Patterns | 3-4 seed-verifiable info/spectacle patterns. | Medium | Too many variants confuse users. |
| Wreck Wake Replay | Post-round movement and bait summary. | Medium | Needs robust event log. |
| Clip Card | Shareable/spectator summary. | Low-Medium | Needs visual polish. |
| Enhanced storm choreography | Deterministic theater tied to seed. | High | Must never imply unfair steering. |

### P4 - Ecosystem Health and Monetization

| Item | Output | Difficulty | Risk |
|---|---|---|---|
| Stake-tier rooms | Low/mid/high rooms with max stake rules. | Medium | Liquidity fragmentation. |
| Whale guardrails | Max stake as a function of room liquidity. | Medium | High-roller dissatisfaction. |
| Cosmetic-only identity | Boats, flags, harbor skins, no odds impact. | Medium | Scope creep. |
| Spectator mode | Streamer-friendly delayed/aggregate view. | Medium | Data leakage if live exact state appears. |

## 13. Monetization Impact

For the current educational build, there is no real-money monetization. For a hypothetical
commercial descendant, v2 improves monetization without increasing hidden edge:

- more decisions per round increase session depth;
- Blind Fog creates "one more round" pressure comparable to Crash's rising multiplier without
  copying cash-out;
- Split lets risk-averse players participate longer;
- Signals and replay create social retention;
- Surge and Storm Power keep high-upside dreams visible;
- cosmetic-only flags, boats, harbor themes, and streamer overlays become sellable without
  affecting odds;
- healthier anti-bot design protects casual liquidity, which is the real long-term revenue
  base in a player-vs-player pari-mutuel game.

Do not monetize information advantages. Selling exact tide data, priority orders, better
signals, or improved odds would destroy the game.

## 14. Risk Assessment

| Risk | Severity | Mitigation |
|---|---:|---|
| Players think hidden final movement is unfair. | High | Repeat the rule: hidden before lock, public after lock. Show lock snapshot and receipts. |
| Split feels too complex. | Medium | Preset only: Focus or 70/30 Split. No free-form allocation in v2. |
| Signals become meaningless noise. | Medium | One signal per round, strong styling, post-round honesty reveal, reputation in chat. |
| Weather patterns overcomplicate the game. | Medium | Ship only Clear Tide and Heavy Fog first; add others by retention data. |
| Bots adapt with prediction models. | Medium | Accept prediction skill; deny exact deterministic last-tick data. Monitor extraction. |
| High rollers dislike stake privacy/guardrails. | Medium | Offer high-stake rooms with clear limits, not mixed rooms where whales farm casuals. |
| Spectacle implies outcome bias. | High | Derive theater from digest spans and verify it in the modal. |

## 15. Assumptions Challenged

1. **"Exact live bars are necessary for strategy."** False. Exact bars create deterministic
   exploitation. Coarse shared reports create a better strategy game.
2. **"Free unlimited re-anchor is the signature."** Partly false. The signature should be
   crowd movement under pressure, not spam at the lock boundary.
3. **"One anchor is simpler and therefore better."** False at scale. Focus/Split is still
   simple and creates crucial risk identity.
4. **"Bots are acceptable because they cannot beat the house."** False. In PvP games, bots can
   destroy the player ecosystem even if operator EV is safe.
5. **"Spectacle must affect payouts to matter."** False. In gambling products, verifiable
   theater around a fair outcome can create pressure without adding unfair complexity.
6. **"Casual protection lowers skill ceiling."** False. It moves skill from exact arithmetic
   extraction to prediction, bluffing, and risk management.

## 16. Success Metrics

| Metric | Desired movement |
|---|---|
| Re-anchor concentration in final 250ms | Down sharply. |
| Strategy diversity: Focus/Split/Hold/Move mix | No single action above 55% long-term. |
| Bot extraction rate vs human top decile | Lower gap than v1. |
| Casual 10-round retention | Up. |
| Average watched rounds before first stake | Down. |
| Chat messages tied to signals/fog | Up, but toxicity stable. |
| Clip-card shares or copied summaries | Up. |
| Verification modal usage after fog disputes | Initially up, then stabilizes. |
| Pool entropy at lock | Higher variety than v1 last-second smallest-pool convergence. |

## 17. Implementation Notes for Existing Codebase

- `packages/core/src/settlement.ts` already supports multiple `StakeEntry` rows, which makes
  Split compatible with the math engine if `RoundCoordinator` moves from one live anchor per
  player to one live fleet plan per player.
- `packages/core/src/messages.ts` needs new client messages for `FINAL_ORDER` and `SIGNAL`, and
  server messages for `TIDE_REPORT`, `FOG_STARTED`, and `REPLAY_CARD`.
- `packages/server/src/coordinator.ts` should stop broadcasting exact `POOL_UPDATE` telemetry
  as the primary strategic surface. It should publish report snapshots and keep the exact
  internal pool state private until `LOCK_SNAPSHOT`.
- `packages/web/src/pixi/HarborMapScene.ts` should render tide bands, fog, signal flags, fleet
  snap reveal, and replay cards as first-class spectacle.
- `docs/04-architecture/rng-provably-fair-spec.md` should reserve digest spans for weather and
  deterministic theater if Weather Patterns ship.
- `docs/05-security/security-review.md` should promote lock-jitter from "future option" to
  "superseded by Blind Fog Lock"; the anti-bot center is now information design, not timing
  randomness.

## 18. Final Design Statement

LANDFALL v2 is not a Crash clone and not a Wheel variant. It is a multiplayer pari-mutuel
survivor game where the outcome is simple, the economy is transparent, and the depth comes from
human prediction under imperfect shared information.

The category-defining moment is:

> The fog clears, the crowd is not where anyone thought it was, one harbor is destroyed, and the
> whole room instantly understands who baited whom.
