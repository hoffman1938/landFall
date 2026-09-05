# LANDFALL UX Simplification v3 — "Plain Words, One Button"

**Prepared by:** Multidisciplinary UX team (roles in §0.2)
**Phase:** UX Simplification and Player-Friendly Terminology Redesign
**Depends on:** [ux-redesign-v2.md](ux-redesign-v2.md) (presentation layer, partially superseded),
[chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md) (mechanics, frozen),
current client code (`packages/web/src`), `packages/core/src/constants.ts`.
**Status:** Approved design specification. Nothing in this document changes a wire message, a
payout, a probability, the rake, Storm Power/Surge math, the fairness scheme, or a phase duration.

**The product objective in one line:** a first-time player understands the loop in 10–15 seconds
and places a bet without reading anything longer than one sentence.

**The one sentence** (deliverable 5, final wording in §5):

> **Pick a zone. One of six is hit — everyone else splits its money.**

---

## 0. Scope, Roles, and Evidence Base

### 0.1 What is frozen (brief §3)

Six zones · exactly one hit per round · uniform 1/6 provably-fair draw · hit zone loses, survivors
share the distributable losing pool pro-rata (×(1−rake), × Storm Power) · ~20 s rounds
(10 s betting incl. 3 s blind phase, 5 s storm, 3 s result, 2 s cooldown) · blind-information
phase with one hidden final decision · Focus/Split 70/30 mechanic · signal flags · Storm
Surge/Golden Anchor progressive · server-authoritative money · every message in
`packages/core/src/messages.ts`. **Only names, layout, copy, and disclosure order change.**

### 0.2 Role assignments (brief §1)

| Role | Owns sections |
|---|---|
| 1 — Lead UX Architect | §6 hierarchy, §7 modes, §9–§10 wireframes, §8 state machine |
| 2 — Casino Game Product Designer | §1 diagnosis, §5 core sentence, §8 feedback rules, learning-curve comparisons |
| 3 — UX Writer & Terminology Specialist | §3 term audit, §4 terminology system, §12 microcopy, §13 messages, §14 How to Play |
| 4 — UI Visual Designer | visual-state rules inside §8–§10, §6 level styling |
| 5 — Accessibility & Mobile Specialist | §10 mobile wireframes, §15 accessibility checklist |
| 6 — Tutorial & Onboarding Designer | §11 first-session flow, §14 demo |
| 7 — UX Researcher | §16 usability-test plan, metrics in §18 |

### 0.3 Evidence base (what was actually audited)

All findings below come from the shipped client, not assumptions:
`ControlDeck.tsx`, `TopBar.tsx`, `ResultBanner.tsx`, `StormClock.tsx`, `RulesModal.tsx`,
`WreckLog.tsx`, `WreckLogSheet.tsx`, `SkipperCard.tsx`, `SecondaryPanel.tsx`, `deckState.ts`,
`deckProgress.ts`, and `core/constants.ts`. Credit where due: the v2 remediation already delivered
progressive disclosure (`deckProgress.ts`), ≥44 px targets, a never-destructive primary,
hold-to-confirm cancel, and a pictogram rules strip. **v3 does not re-litigate those wins.** It
fixes what v2 left in place: the vocabulary and the primary-action model.

---

## 1. Deliverable 1 — Executive Summary of the Main UX Problems

**Problem A — The primary action is not a button.** Betting happens by tapping the map canvas;
the large bottom "primary" is a *status display* (`SELECT A COVE`, `ANCHORED`, `FINAL ORDER SET`)
that is pressable only in its `REBET` state. A new player's strongest instinct — press the big
button — does nothing. Every comparable mainstream game (Aviator, JetX, Mines, Plinko, Lightning
Roulette) closes the loop with one labeled bet button. This is the single largest conversion trap
in the current build.

**Problem B — Three names for the same object, two names for the same action.** The betting unit
is called **Harbor** (rules text, `HARBOR_NAMES`), **Cove** (StormClock, ResultBanner, deck), and
a **proper name** — North Quay, Gullrock, Saltmere, Ketterly, Fogwatch, Brinehollow — in the same
session; the screen-reader label even says all of it at once ("Cove 3, Saltmere, was struck").
Repeating a bet is **REBET** on the primary and **RESTAKE** on the secondary. This directly
violates "never use two different terms for the same thing," and the six proper names are a
memorization tax with no functional payoff and near-zero translatability into Russian/Georgian.

**Problem C — The interface speaks sailor, not player.** Open Tide, Blind Fog, Final Order,
Fleet, Focus, Salvage, Wreck Log, Tide Report ("heaviest cove", "Frozen in fog"), Skipper Record,
Storm Power Category 4, Golden Anchor. Each term must be *learned before it informs*. The theme
should decorate the world; today it labels the controls.

**Problem D — Money communication is in percentages and jargon.** The expectation strip reads
"If another cove is hit: ≈ +8–15% · heaviest cove: up to ≈ +40%". Mainstream players think in
money, not expected-gain percentages; "heaviest" is tide-report vocabulary.

**Problem E — The top bar is a 48 px tall data bus.** Twelve simultaneous items: logo, room
switcher ("… · 2–500 · 7 aboard"), round #, phase chip, weather chip, SURGE pot ticker (+LIVE),
connection dot, player name, balance, volume, settings, help. At most three of these affect the
current decision.

**Problem F — The highest-emotion moment speaks the most jargon.** The result stack can show
"Category 3 — salvage ×2", "GOLDEN ANCHOR", "Storm Power payout reached the round cap — salvage
was clamped", and "Half your fleet was in Cove 4" simultaneously — at the exact second a novice
is asking the simplest question they will ever ask: *did I win?*

The fix, in one line each: make Place Bet a real button (§8); one plain word per concept in three
languages (§4); money in money (§9 payout rules inside §8/§12); a three-item top strip (§9–§10);
result messages that answer "what happened" in one sentence (§13); everything else one tap deeper
(§6–§7).

---

## 2. Deliverable 2 — Confusing UI Elements (classified per brief §15)

Classification: **E** essential to the current decision · **S** useful but secondary ·
**A** advanced · **R** redundant · **C** confusing · **X** remove/hide from default view.

| # | Element (file) | Today | Class | v3 disposition |
|---|---|---|---|---|
| 1 | Six-zone map (`HarborMap`) | Board + bet input + data display | E | Keep dominant; taps **select** (not commit) |
| 2 | Primary button (`ControlDeck`) | Status display, rarely pressable | C | Becomes actionable **Place Bet / Bet Again** (§8) |
| 3 | Stake stepper − / input / + | Good | E | Keep |
| 4 | 8 preset chips (1…500k) | Overlong row, scrolls | R | 4 presets; rest inside stake sheet |
| 5 | ×2 · ½ · MAX chips | Unlock on stake edit | A | Move into stake sheet (long-press / expand) |
| 6 | Focus/Split segmented + teaser | Jargon labels | A/C | Rename **1 Zone / 2 Zones**; stays unlocked-later |
| 7 | RESTAKE secondary | Duplicate of Rebet | R | Delete; one **Bet Again** term (§4) |
| 8 | Flag button + cooldown badge + picker | Advanced social feature | A | Keep behind disclosure; rename **Signal** |
| 9 | ✕ cancel (hold-in-fog) | Good pattern, cryptic aria ("your one fog order") | E/C | Keep pattern; recopy (§12) |
| 10 | Payout strip | %-based, tide jargon, "Frozen in fog" chip | C | Money range "If safe: ≈ $5.40–7.20" (§12) |
| 11 | Storm Clock + hint line | Good instrument; nautical hints | E | Keep; plain-word hints (§12) |
| 12 | Top bar: round # | Never affects decision | R/X | Move into History and Verify |
| 13 | Top bar: phase chip (OPEN TIDE…) | Duplicates Storm Clock | R/X | Delete; Clock is the phase |
| 14 | Top bar: weather chip (CROSSWIND…) | Modifier w/o intro | C/X | Hide for beginners; icon+tooltip in Expert |
| 15 | Top bar: SURGE pot + LIVE | Unexplained jackpot ticker | C/A | Jackpot chip appears only on bonus rounds; else in menu |
| 16 | Top bar: room switcher | Lobby data mid-bar | S/X | Move to menu ("Tables") |
| 17 | Top bar: name, ONLINE label | Cosmetic | R/X | Menu; connection shown only when lost |
| 18 | Wreck Log strip + sheet | "Wreck" naming; glyph strip | S | Rename **History**; keep one-tap strip |
| 19 | Chat/Activity panel | Correctly secondary | S | Keep; unread badge |
| 20 | Verify button + modal | Correctly one tap away | S | Rename **Fairness**; receipt copy (§12) |
| 21 | Skipper Card | "Bluffs called", "Rounds sailed" | A/C | Rename **Player Stats**; plain labels |
| 22 | Rules modal | Good pictogram; prose mixes harbor/cove | S/C | Recopy per §14 |
| 23 | Six proper cove names | Recall tax, untranslatable | C/X | Zones numbered 1–6; names demoted to flavor only |
| 24 | Storm Power seal (Category N) | Hurricane-scale jargon | C | "×2 multiplier" language (§13) |
| 25 | Limits / Reality check | Nautical copy ("Time at sea", "Anchors stop") | S/C | Plain copy; keep server enforcement |

Removal rule applied (brief §15): anything repeating other data (12, 13, 17), not affecting the
decision (12, 14, 16), needing prior explanation (14, 15, 24), competing with the primary (4, 5,
7), or using internal jargon (10, 21, 23) leaves the default screen.

---

## 3. Deliverable 3 — Confusing Terms (audit of every player-visible term)

Verdicts: **KEEP** (obvious from context) · **RENAME** (player needs it, word fails) ·
**HIDE** (players never need to see it) · **RULES-ONLY** (exists only in detailed rules).

| Current term (where) | Player needs it? | Verdict | Why |
|---|---|---|---|
| Harbor / Cove (everywhere) | Yes — the unit of play | RENAME → **Zone** | Two words for one object; "zone" is a loanword in RU («зона») and KA („ზონა") |
| North Quay…Brinehollow (`HARBOR_NAMES`) | No | HIDE | Six proper nouns to memorize; hostile to localization and recall |
| Anchor / Drop Anchor / ANCHORED | Yes — the action | RENAME → **Place Bet / Bet Placed** | The action word must be the money word |
| Fleet / Fleet mode | No | RENAME → **Your bet** | "Fleet" describes implementation, not meaning |
| Focus / Split | Yes (advanced) | RENAME → **1 Zone / 2 Zones** | Self-labeling; no metaphor to decode |
| Final Order (fog move) | Yes | RENAME → **Last Move** | "Order" reads as command/purchase; "last move" is literal |
| Blind Fog / Fog Lock | Yes (as state) | RENAME → **Bets hidden** (state) / **Locked** | Fog stays as *visual*; the label states the consequence |
| Open Tide / Next Tide (phase chips) | No as words | HIDE | The Storm Clock + message line carry phase |
| Tide Report / bands "light…packed" | Yes (as info) | RENAME → **Crowd** (Low/Medium/High/Full) | Says what it is; icons carry it |
| "Frozen in fog" chip | Yes | RENAME → **Paused until result** | States the consequence |
| Salvage | Yes — the win | RENAME → **Payout / You won** | Core money moment must use the money word |
| Wrecked / WRECKED banner | Yes — the loss | RENAME → **Zone N was hit / You lost** | "Hit" is the game's own physics, needs no glossary |
| Wrecked Pool / cargo | Yes (rules) | RENAME → **Losing zone's pool** | Plain possession |
| Wreck Log / Wreck Wake Replay | Yes (secondary) | RENAME → **History / Round Replay** | Standard app words |
| Storm Power / Category 1–6 | Yes (bonus) | RENAME → **Multiplier (×2, ×5…)** | The number is the meaning; hurricane scale hidden as flavor |
| PERFECT STORM (×500) | Yes (rare) | KEEP as flavor + **×500 multiplier** label | The brand moment may keep its name *with* the number |
| Surge / Storm Surge pot | Yes (bonus) | RENAME → **Bonus Round / Jackpot** | "Jackpot" is the most universally understood casino word |
| Golden Anchor | Yes (rare) | RENAME → **Jackpot winner** | Requires zero learning |
| Skipper Record / "Rounds sailed", "Bluffs called" | Optional | RENAME → **Player Stats** (plain labels) | Nautical résumé reads as noise |
| Rebet / RESTAKE (both live) | Yes | MERGE → **Bet Again** | One action, one word — hard rule |
| Signal Flag / Rally / Flee / Hold | Advanced | RENAME → **Signal**: Join / Avoid / Staying | Verbs a non-gambler parses instantly |
| Weather (Clear Tide, Crosswind, High Swell, Heavy Fog) | No (beginner) | HIDE → Expert icon + tooltip | Modifier without intro = suspicion of hidden rules |
| Rake | Rules-only | RULES-ONLY → **Game fee** | Legal/math accuracy stays in detailed rules |
| Handle | Rules-only | RULES-ONLY → **Total bets** | — |
| Pari-mutuel settlement | Rules-only | RULES-ONLY → **shared-pool payout** | The full term appears once, in Fees & RTP |
| BAL / CR abbreviations | Yes | RENAME → coin icon + amount | Abbreviations don't localize |
| "aboard" (room list) | Secondary | RENAME → **players** | — |
| "Time at sea" (reality check) | Yes (RG) | RENAME → **Time playing** | RG copy must be unambiguous — compliance issue, not style |
| Storm / storm hits | Yes | **KEEP** | The one theme word that *explains* the mechanic; universally understood |
| Safe / survived | Yes | **KEEP** | Self-explanatory pairing with "hit" |

Final rule: the theme keeps exactly **two words in the main UI — "storm" and "safe"** — plus the
LANDFALL brand and the visual world (boats, water, weather). Every other functional label is a
plain word.

---

## 4. Deliverable 4 — Terminology System (complete table)

Format per brief §16. EN is normative; RU/KA are production drafts and **require one
native-speaker review pass before ship** (tracked in backlog L-2). Max-length budgets assume
mobile buttons ≤ 12 EN chars (≤ 16 RU/KA) and status lines ≤ 40 chars.

Legend: Main UI = visible in default (beginner) interface · Onb = introduced during onboarding.

| Internal name (code, unchanged) | Current player name | New EN | Russian | Georgian | Main UI | Onb | Max len | Short tooltip (EN) |
|---|---|---|---|---|---|---|---|---|
| `zone` / `HARBOR_NAMES[i]` | Harbor / Cove / Saltmere… | **Zone 1–6** | Зона 1–6 | ზონა 1–6 | ✔ | ✔ | 8 | — (visual) |
| `sendAnchor` | Drop anchor | **Place Bet** | Поставить | დადება | ✔ | ✔ | 12 | Locks in your zone and stake |
| `myFleet` | Fleet | **Your bet** | Ваша ставка | თქვენი ფსონი | ✔ | ✔ | 14 | — |
| `stake` | Stake | **Bet** (amount) | Ставка | ფსონი | ✔ | ✔ | 8 | — |
| re-anchor | Move / re-anchor | **Move** | Переставить | გადატანა | ✔ | ✔ | 12 | Change zone before lock — free |
| `rebet` (+ old RESTAKE) | Rebet / Restake | **Bet Again** | Повторить | გამეორება | ✔ | — | 12 | Same zone, same amount |
| `cancelOrder` | Cancel (✕) | **Cancel bet** | Отменить | გაუქმება | ✔ | — | 12 | Refunds your bet |
| `FOCUS` | Focus | **1 Zone** | 1 зона | 1 ზონა | Casual+ | later | 8 | Whole bet on one zone |
| `SPLIT` | Split | **2 Zones** | 2 зоны | 2 ზონა | Casual+ | later | 8 | 70/30 across two zones |
| `finalOrder` | Final Order | **Last Move** | Последний ход | ბოლო სვლა | ✔ | ✔ | 14 | One hidden change while bets are hidden |
| `BLIND_FOG` (state label) | Blind Fog | **Bets hidden** | Ставки скрыты | ფსონები დამალულია | ✔ | ✔ | 20 | Other players' moves are hidden now |
| `tideReport.frozen` | Frozen in fog | **Paused** | Пауза | პაუზა | ✔ | — | 10 | Numbers update after the result |
| `LOCKED_STORM` (label) | Anchors locked | **Locked** | Закрыто | დაკეტილია | ✔ | ✔ | 10 | No more changes this round |
| `tideReport` bands | Tide Report: light…packed | **Crowd:** Low·Medium·High·Full | Мало·Средне·Много·Полно | ცოტა·საშუალო·ბევრი·სავსე | ✔ (icons) | later | 8/level | More players = smaller share each |
| salvage (payout) | Salvage | **Payout / You won** | Выплата / Вы выиграли | მოგება | ✔ | ✔ | 14 | Your stake back + your share |
| struck outcome | Wrecked | **Zone N was hit** | Шторм ударил в зону N | შტორმი ზონა N-ს მოხვდა | ✔ | ✔ | 40 | — |
| struck pool | Wrecked Pool / cargo | **Losing zone's pool** | Банк проигравшей зоны | წაგებული ზონის ბანკი | rules | — | — | Money bet on the hit zone |
| `payoutExpectationGains` strip | tide expectation | **If safe: ≈ $A–$B** | Если уцелеете: ≈ … | თუ გადარჩი: ≈ … | ✔ | ✔ | 40 | Estimate — final amount depends on the hit zone |
| `stormPower` | Storm Power Cat 1–6 | **Multiplier ×N** | Множитель ×N | მამრავლი ×N | when >×1 | later | 14 | Rare rounds multiply every payout |
| `PERFECT STORM` | Perfect Storm | **Perfect Storm — ×500** | Идеальный шторм — ×500 | სრულყოფილი შტორმი — ×500 | rare | — | — | Rarest round: all payouts ×500 |
| `surgeRound` | Surge | **Bonus Round** | Бонусный раунд | ბონუს რაუნდი | when live | later | 14 | This round someone wins the jackpot |
| `surgePotMinor` | Surge pot | **Jackpot** | Джекпот | ჯეკპოტი | when live | later | 10 | Grows every round until won |
| Golden Anchor event | Golden Anchor | **Jackpot winner** | Победитель джекпота | ჯეკპოტის მოგება | rare | — | — | One safe player wins the whole jackpot |
| `signals` | Signal Flag | **Signal** | Сигнал | სიგნალი | Expert | later | 10 | Public — and it can bluff |
| `RALLY` | Rally | **Join me** | Сюда | აქეთ | Expert | — | 8 | — |
| `FLEE` | Flee | **Avoid** | Опасно | საშიშია | Expert | — | 8 | — |
| `HOLD` | Hold | **Staying** | Остаюсь | ვრჩები | Expert | — | 8 | — |
| `WreckLog` | Wreck Log | **History** | История | ისტორია | ✔ (strip) | — | 10 | Recent hit zones |
| replay card | Wreck Wake Replay | **Round Replay** | Повтор раунда | რაუნდის გამეორება | S | — | 14 | — |
| `SkipperCard` | Skipper Record | **Player Stats** | Статистика | სტატისტიკა | A | — | 14 | For fun — no bearing on odds |
| verify modal | Verify / chain | **Fairness check** | Проверка честности | შემოწმება | S | later | 14 | Recheck any round's result yourself |
| `RAKE` | Rake | **Game fee** (rules) | Комиссия | საკომისიო | rules | — | — | Deducted from the losing pool only |
| handle | Handle | **Total bets** (rules) | Общий банк | საერთო ბანკი | rules | — | — | — |
| pari-mutuel | Pari-mutuel settlement | **Shared-pool payout** (rules) | Выплаты из общего банка | საერთო ბანკიდან გადახდა | rules | — | — | — |
| `weather` | Clear Tide / Crosswind… | *(icon only)* **Round modifier** | Модификатор | მოდიფიკატორი | Expert | — | — | Small twist; odds never change |
| balance | BAL … CR | 🪙 **1,240** (Balance) | Баланс | ბალანსი | ✔ | ✔ | — | — |
| room | Room ("aboard") | **Table** ("players") | Стол («игроков») | მაგიდა („მოთამაშე") | menu | — | 12 | — |
| reality check | Time at sea | **Time playing** | Время в игре | თამაშის დრო | RG | — | — | — |

Consistency rules (hard, lint-enforceable against a single `strings.ts` table):
one concept = one term, everywhere including aria-labels and chat system messages; no term used
before its disclosure tier; no abbreviation of money words; theme words never appear as control
labels; RU/KA strings may be up to 40% longer — every layout must survive that (checked in §15).

---

## 5. Deliverable 5 — The One-Sentence Game Explanation

Primary (shown on first load, in the How to Play header, and in the app-store description):

> **EN:** Pick a zone. One of six is hit — everyone else splits its money.
> **RU:** Выбери зону. Одну из шести накроет шторм — остальные делят её деньги.
> **KA:** აირჩიე ზონა. ექვსიდან ერთს შტორმი დაარტყამს — დანარჩენები მის ფსონებს ინაწილებენ.

Derived micro-versions used by the interface (never reworded ad hoc):

- Zone hint: "One of these six will be hit."
- Win explanation: "Zone N was hit. Its pool was shared by everyone else — including you."
- Loss explanation: "Zone N was hit — a 1-in-6 chance. Its pool went to the other players."
- Payout-changes explanation: "Fewer players in your zone = a bigger share if you're safe."

The sentence answers, in order: where do I act (pick a zone), what causes loss (your zone is
hit), what happens at timer end (one is hit), how do I win (be in the others), why payouts vary
(splitting money — the crowd determines shares).

---

## 6. Deliverable 6 — Revised Information Hierarchy

| Level | Contents | Presentation |
|---|---|---|
| **1 — Main action** | Place Bet / Bet Again / Keep (fog) / the result verdict | The single largest interactive element; only Level-1 items may use the action color; only one exists at a time |
| **2 — Decision info** | Timer (Storm Clock), six zones + selection, bet amount, "If safe ≈ $A–B" estimate, current bet status line | Always visible; second-largest type; timer and zones dominate the viewport |
| **3 — Supporting** | Crowd meters per zone, multiplier badge (only when >×1), Bonus-Round chip (only when live), toasts | Small, on the map or as transient chips; never animated during another element's moment |
| **4 — Optional** | Chat, History, Player Stats, Fairness, full rules, table switcher, RG settings, replay cards | Behind one menu / sheet / badge each; zero default footprint |

Enforcement rules: nothing from Level 3–4 may sit between the zones and the primary button;
destructive actions (Cancel) are never sized or colored like Level 1; the estimate line is the
only money projection on stage — exact pool tables live in the expert sheet.

---

## 7. Deliverable 7 — Beginner, Casual, and Expert Modes

Builds on the shipped `deckProgress.ts` schedule (kept) — v3 renames tiers and tightens the
beginner surface:

| Mode | Trigger | Visible surface |
|---|---|---|
| **Beginner** (default, first session) | Fresh profile | Six zones, timer, bet stepper + 4 presets, **Place Bet**, status line, estimate line, result. Nothing else. Menu exists but unbadged |
| **Casual** | 3 completed rounds (or tapping a teaser) | + 1 Zone / 2 Zones toggle, Bet Again, History strip, crowd meters get labels, stake sheet (×2 ½ MAX, all presets) after first stake edit |
| **Expert** | Settings toggle ("Expert mode — show everything"), suggested after 25 rounds; never re-gated | + Signals, round-modifier icon, detailed pool sheet, replay analytics, jackpot ticker always on, keyboard map |

Every unlock announces itself once, in one line, dismissible (brief §7):
"New: **2 Zones** — split your bet 70/30 across two zones." / "New: **Signals** — public flags
other players can see (and bluff with)."

---

## 8. Deliverable 8 — The Round State Machine

Internal phases are untouched; the table maps them to player-facing stages. Every stage has:
one message, one primary, distinct visuals, and a defined disabled look (dimmed + lock icon +
reason line — never “broken”).

| Stage | Internal state | Message (status line) | Primary button | Secondary actions | Visual state |
|---|---|---|---|---|---|
| **1 Choose** | `ANCHOR_OPEN`, no fleet | "Choose a zone and place your bet." | **PLACE BET $5** (disabled w/ hint "Pick a zone first" until a zone is selected) | stepper, presets | Zones breathe softly; selected zone: border + ✓ + boat preview |
| **2 Bet placed** | `ANCHOR_OPEN`, fleet | "Bet placed: Zone 3 · $5." | **✓ BET PLACED** (confirmed style, inert) | **Move** (tap another zone), stake edit → "Update bet", small ✕ Cancel | Your zone: filled border + ⚓ boat + label "Your bet" |
| **3 Last chance** | `ANCHOR_OPEN` + blind window | "Bets hidden. One last move — or keep." | **KEEP ZONE 3** (confirm-style; pressing = explicit hold) | **Change** (tap a zone → uses the one Last Move), ✕ hold-to-cancel | Fog rolls in; other boats become silhouettes; your boat crisp + halo |
| **4 Locked** | `LOCKED_STORM` | "Bets locked. Result incoming…" | **🔒 LOCKED** (inert, dimmed-not-broken) | none | Ring frozen; storm prowls; controls dim to 60% with lock icon |
| **5 Result** | `RESOLVED` → `COOLDOWN` | win/loss/bonus messages (§13) | **BET AGAIN $5** | "Change bet" (returns to Stage 1 state) | Hit zone: ✕ + impact; safe zones: ✓ + green beam; verdict card |

Rules carried from the brief: the primary is **never** destructive and never changes function
within a phase (already enforced by `deckState.ts` — kept); Cancel stays the small ✕ with
hold-to-confirm during the hidden phase; Stage 3 never uses the words "Final Order".

**Interaction change (the one behavioral change v3 makes):** a zone tap **selects**; the Place
Bet button **commits** (client sends the same anchor message on press — wire protocol unchanged).
Rationale: one-tap map betting optimizes for experts but costs novices mis-bets and, worse, makes
the biggest button on screen a no-op. Two taps, both obvious, is what every reference game does.
Experts get one-tap back as an Expert-mode preference ("Quick bet: tap a zone to bet instantly").

**Feedback rule (every action answers within 150 ms):** select → border+✓+sound tick; place →
button morphs to ✓ BET PLACED + boat sails + chip sound; move → boat visibly sails between
zones; locked → rope-lash animation + dim; result → verdict card + amber only if net ≥ 0.

---

## 9. Deliverable 9 — Desktop Wireframe Descriptions

Low-fidelity; hierarchy only. Full-bleed bay retained from v2; panels are overlays, not frames.

```
┌────────────────────────────────────────────────────────────────────┐
│ ☰ Menu      ◔ 0:07 · "Choose a zone and place your bet"   🪙 1,240 │  ← 3-item strip
│                                                                    │
│        ┌────────┐      ┌────────┐      ┌────────┐                  │
│        │ ZONE 1 │      │ ZONE 2 │      │ ZONE 3 │                  │
│        │ 👥 Low  │      │ 👥 High │      │ 👥 Full │                 │
│        └────────┘      └────────┘      └────────┘        [💬]      │  ← chat toggle,
│              (open water — storm visual roams here)                │    pinnable rail
│        ┌────────┐      ┌────────┐      ┌────────┐                  │
│        │ ZONE 4 │      │ ZONE 5 │      │ ZONE 6 │                  │
│        │ 👥 Low  │      │ 👥 Med  │  ✓  │ 👥 Med │                  │
│        └────────┘      └────────┘      └────────┘                  │
│                                                                    │
│  History: 3 1 6 1 4 2 …                          If safe: ≈ $5.40–7.20 │
│  ┌──────────────────────────┐   ┌──────────────────────────────┐   │
│  │ [−]   $5   [+]  1·2·5·10 │   │        PLACE BET  $5         │   │  ← Level-1 action
│  └──────────────────────────┘   └──────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────┘
```

- **Top strip (3 items):** menu (tables, stats, fairness, limits, settings, expert toggle),
  Storm Clock + status line center, balance right. Round #, phase chip, weather, name, ONLINE,
  surge ticker: all removed (menu/contextual).
- **Zones:** each is one giant target: number, crowd meter (icon + level word), selection state
  (border + ✓ + boat). Hover shows "your share if safe here ≈ $X" — public info only, desktop
  affordance not required for play.
- **Action dock:** stake module left, primary right, estimate line above. Bonus-Round chip
  ("🏆 Jackpot round — $740") appears above the dock only when live.
- **Chat/History/Stats/Fairness:** right rail, pinnable, one tab each; never covers the dock.
- Keyboard: 1–6 select, Enter place/keep, M move mode, Esc cancel-intent. (Expert doc §5.7 kept.)

Secondary screens (same fidelity): **Stake sheet** (all presets, ×2 ½ MAX, custom input);
**Advanced sheet** (exact pools, per-zone shares, signals); **How to Play** (§14); **Fairness
receipt** (headline "The result was fixed before betting opened", three ✓ rows, plain numbers);
**Settings** incl. Expert mode + RG limits; **History** (replay cards list); **Player Stats**.

---

## 10. Deliverable 10 — Mobile Wireframe Descriptions (primary design target)

Portrait, one-hand reach; all commit actions in the bottom 40%.

```
Stage 1 — Choose                      Stage 2 — Bet placed
┌──────────────────────┐             ┌──────────────────────┐
│ ☰   ◔0:07  🪙1,240   │             │ ☰   ◔0:05  🪙1,235   │
│ "Choose a zone and   │             │ "Bet placed:         │
│  place your bet"     │             │  Zone 3 · $5"        │
│ ┌───────┐ ┌───────┐  │             │ ┌───────┐ ┌───────┐  │
│ │ZONE 1 │ │ZONE 2 │  │             │ │ZONE 1 │ │ZONE 2 │  │
│ │👥Low  │ │👥High │  │             │ │👥Low  │ │👥High │  │
│ ├───────┤ ├───────┤  │             │ ├───────┤ ├───────┤  │
│ │ZONE 3✓│ │ZONE 4 │  │             │ │ZONE 3⚓│ │ZONE 4 │  │
│ ├───────┤ ├───────┤  │             │ │Your bet│ ├───────┤  │
│ │ZONE 5 │ │ZONE 6 │  │             │ ├───────┤ │ZONE 6 │  │
│ └───────┘ └───────┘  │             │ │ZONE 5 │ └───────┘  │
│ If safe: ≈ $5.40–7.20│             │ Tap a zone to move   │
│ [−]  $5  [+] 1·2·5·10│             │ [Edit bet]      [✕]  │
│ ┌──────────────────┐ │             │ ┌──────────────────┐ │
│ │  PLACE BET  $5   │ │             │ │  ✓ BET PLACED    │ │
│ └──────────────────┘ │             │ └──────────────────┘ │
└──────────────────────┘             └──────────────────────┘

Stage 3 — Last chance                 Stage 5 — Result (win)
┌──────────────────────┐             ┌──────────────────────┐
│ "Bets hidden. One    │             │ ┌──────────────────┐ │
│  last move — or keep"│             │ │   +$6.40  ✓      │ │
│  (fog overlay,       │             │ │ You're safe —    │ │
│   crowd meters pause)│             │ │ Zone 4 was hit.  │ │
│ [Change zone]  [✕hold]│            │ │ Its pool was     │ │
│ ┌──────────────────┐ │             │ │ shared.          │ │
│ │  KEEP ZONE 3     │ │             │ └──────────────────┘ │
│ └──────────────────┘ │             │ [Replay] [Fairness]  │
└──────────────────────┘             │ ┌──────────────────┐ │
                                     │ │  BET AGAIN  $5   │ │
                                     └──────────────────────┘
```

Mobile rules (brief §13): zones ≥ 88 px tall (2×3 grid fills width — zones ARE the buttons);
primary ≥ 56 px tall, text ≥ 16 px; interactive text ≥ 14 px; no horizontal scroll anywhere in
core controls (4 presets fit; more in sheet); chat/history/stats = bottom sheets; the dock stays
visible above the keyboard when chat opens; no hover-dependent info (crowd levels always
rendered); long-press = signals (Expert only); haptics per v2 §5.6 kept.

---

## 11. Deliverable 11 — First-Session Onboarding Flow (Flow A)

> **STATUS (post-R5 revision).** The contextual flow below was specified here and never built —
> no captions, no practice mode, no demo animation shipped, so a first-time player got no
> onboarding at all beyond an auto-dismissing table banner. What ships now is an **entry gate**
> (`WelcomeGate.tsx`): a single screen before the first bet carrying four plain-language points
> and a table choice.
>
> This deviates from the "no modal tour" rule immediately below, on product instruction, and the
> deviation is recorded in the remediation decisions log. Two things keep it from being the
> failure mode that rule was written against. It is **not a tour** — no step sequence, no "next",
> one screen the player leaves by choosing a table. And it is **not repeated at a regular** —
> once completed on a device the explanation collapses behind a toggle and the screen becomes a
> table picker with the last table preselected.
>
> The contextual captions below remain the right complement, not a competitor: they teach the
> controls in place, which the gate deliberately does not attempt. They stay unbuilt and open.

Exactly three interactions, contextual, skippable at every step ("Skip ✕" on each caption).
No modal tour. Captions ≤ 8 words, localized.

1. **Land mid-round → spectate.** Caption under the clock: *"One of six zones will be hit."*
   Watching one strike + payout beats any tutorial (kept from v2 — the round is the tutorial).
2. **Betting opens.** Zones breathe; everything else at 40% opacity.
   Caption: *"Tap a zone to choose it."* → player taps → zone shows ✓.
3. **Stake + button highlight.** Caption over the dock: *"Set your bet, then press Place Bet."*
   → player presses → confirmed state; opacity restores; onboarding over.

After the first result, one explanatory line rides the verdict card (not a step):
win — *"Zone N's pool was shared by everyone else — including you."*
loss — *"1-in-6 chance. Its pool went to the other players."*

Also shipped (brief §10): **Replay tutorial** (menu → How to Play → "Show me"), **Practice mode**
(zero-stake spectate-with-fake-bet for 3 rounds, badge "Practice — no money"), the **How-to-Play
pictogram strip** (kept, recopied §14), and a 20-second silent **demo animation** (a scripted
round: bet → hidden → hit → split) on the How to Play sheet. First-bet onboarding total: 3
interactions, ~12 seconds.

---

## 12. Deliverable 12 — Revised Button Labels and Microcopy

Buttons (EN / RU / KA):

| Context | Label |
|---|---|
| Primary, no selection | PLACE BET (disabled) + "Pick a zone first" / Поставить + «Сначала выбери зону» / დადება + „ჯერ აირჩიე ზონა" |
| Primary, zone selected | **PLACE BET $5** / ПОСТАВИТЬ $5 / დადება $5 |
| Primary, committed | ✓ BET PLACED / ✓ СТАВКА ПРИНЯТА / ✓ ფსონი მიღებულია |
| Primary, hidden phase | KEEP ZONE 3 / ОСТАВИТЬ ЗОНУ 3 / დატოვე ზონა 3 |
| Primary, locked | 🔒 LOCKED / 🔒 ЗАКРЫТО / 🔒 დაკეტილია |
| Primary, result | BET AGAIN $5 / ПОВТОРИТЬ $5 / გაიმეორე $5 |
| Move (secondary) | Move — tap a zone / Переставить / გადატანა |
| Edit stake (secondary) | Update bet / Изменить ставку / ფსონის შეცვლა |
| Cancel (small ✕) | aria: "Cancel bet — refunds $5" / «Отменить ставку — возврат $5» / „ფსონის გაუქმება — $5 დაბრუნდება" |
| Cancel during hidden phase | "Cancel uses your one Last Move. Hold to confirm." |
| Split toggle | 1 Zone · 2 Zones (tooltip: "70% here, 30% there") |
| Fairness | Fairness / Честность / შემოწმება |

Status & info lines:

| Moment | Copy |
|---|---|
| Estimate (open) | "If safe: ≈ $5.40–$7.20" + ⓘ → "Estimate. The final amount depends on which zone is hit and how many players share it." |
| Estimate (heaviest) | "Best case ≈ $7.20 (if the fullest zone is hit)" — expert sheet only |
| Estimate (hidden phase) | "≈ $5.40–$7.20 · Paused" |
| Crowd tooltip | "More players in a zone = smaller share each if it's safe." |
| Multiplier pre-announce (bonus) | "🏆 Jackpot round — one safe player wins $740" |
| Clock hints (per stage) | "Choose a zone" → "You can move until bets hide" → "One last move" → "Locked" → "Result" |
| Connection lost | "Connection lost — reconnecting… Your bet is safe on the server." |

Error toasts (all: icon + one sentence + auto-dismiss; the stake chip shakes instead of prose
where possible):

| Case | Copy |
|---|---|
| Late bet (Flow D) | "Too late — bets are locked. Next round in 5 s." |
| Below table min | "Minimum bet at this table: $1." |
| Above table max | "Maximum bet at this table: $500." |
| Insufficient balance | "Not enough balance — your balance is $3.20." |
| Whale cap | "Bets are capped at 25% of the round total. Max right now: $86." |
| Second move in hidden phase | "You've used your Last Move this round." |
| Signal cooldown | "Signals recharge — available again in 2 rounds." |
| Limit reached (RG) | "You've reached your loss limit for today. Betting is paused." |

---

## 13. Deliverable 13 — Win, Loss, Locked, Rejected, and Bonus Messages

One or two short sentences, always: **amount → cause → economy** (in that order). Amber only
when net ≥ 0 (brand rule kept).

| Outcome | Headline | Explanation line |
|---|---|---|
| **Win** | **+$6.40 — You're safe** | "Zone 4 was hit. Its pool was shared by everyone else." |
| **Loss** | **−$5.00 — Zone 3 was hit** | "A 1-in-6 chance. Its pool went to the other players." |
| **Split, half lost** (net −) | **−$1.20 — Half your bet was in Zone 3** | "Zone 3 was hit. Your other half was safe and earned a share." |
| **Split, half lost** (net +) | **+$0.80 — You came out ahead** | "Zone 3 took 30% of your bet; your 70% share earned more." |
| **Bonus multiplier** | **+$12.80 — ×2 multiplier round** | "Base payout $6.40, doubled this round." |
| **Perfect Storm** | **+$3,200 — PERFECT STORM ×500** | "The rarest round in the game. Base payout $6.40 × 500." |
| **Jackpot won (you)** | **JACKPOT +$740** | "You were picked from all safe players. It restarts at $500." |
| **Jackpot won (other)** | "🏆 Marina won the $740 jackpot" | "Jackpot restarts at $500 and grows every round." |
| **Jackpot rollover** | "No one was safe in the jackpot draw" | "$740 rolls over to the next bonus round." |
| **Payout capped** | *(sub-line on verdict)* "Maximum round payout reached — multiplier was capped." | — |
| **Spectator** | "Zone 4 was hit" | "Players there lost; everyone else shared its pool." |
| **Locked state** | "Bets locked. Result incoming…" | — |
| **Rejected (late)** | "Too late — bets are locked." | "Next round starts in 5 s." |

Loss laws (kept from v2, restated as copy law): never red full-screens, never celebratory styling
on a net loss, never blame ("you chose poorly"), always the odds ("1-in-6") — loss copy builds
trust, not shame.

---

## 14. Deliverable 14 — Simplified How to Play

Level 1 — fits one mobile screen (pictogram strip retained, recopied):

> **How to Play**
> *Pick a zone. One of six is hit — everyone else splits its money.*
>
> 1. Choose one zone (or two, later).
> 2. Place your bet before the timer ends.
> 3. One of the six zones is hit — picked at random, 1-in-6 each.
> 4. Bets in that zone are lost.
> 5. Everyone else keeps their bet **plus a share** of the losing zone's money.
>
> Pictograms: [pick zone] → [bets hide] → [locked] → [zone hit] → [✕ that zone loses] → [💰 the rest split it]

Worked example (one card, numbers only):

> All bets this round: **$600** · Zone 4 is hit with **$100** in it →
> a **12% game fee** is taken from that $100 → the remaining **$88** is split among all safe
> players, in proportion to their bets. Your $5 became **$5 + your share**.

Expandable sections (Level 2, one tap each): How payouts are calculated (pro-rata formula in
words, then math) · Multiplier rounds (×1 most rounds; ×2–×500 rare, odds table) · Jackpot
(how it grows, how the winner is picked) · Moving and the Last Move · 2-Zone bets (70/30) ·
Signals (public, can bluff) · **Fairness** (pre-committed results, verify any round) · **Fees &
RTP** (rake %, "shared-pool (pari-mutuel) payout", long-run return ≈ 98%) · Responsible play
(limits, breaks, self-exclusion) · Full rules.

---

## 15. Deliverable 15 — Accessibility Checklist

Every item is a ship gate (☐ = verified per release):

- ☐ Every state uses ≥ 2 channels beyond color: selected zone = border + ✓ + label; your bet =
  boat + ⚓ + "Your bet" label; hit = ✕ + impact motion + text; safe = ✓ + beam + text; locked =
  lock icon + dim + "Locked"; disabled = dim + lock + one-line reason.
- ☐ Touch targets ≥ 48 px (zones ≥ 88 px); spacing ≥ 8 px between adjacent targets.
- ☐ Interactive text ≥ 14 px; primary label ≥ 16 px; money verdict ≥ 24 px; user text-scale
  0.9–1.4× reflows without clipping.
- ☐ Contrast: AA all text, AAA for money and verdicts; palettes verified for
  protanopia/deuteranopia/tritanopia.
- ☐ Full keyboard map (1–6, Enter, Esc, M, tab order = visual order); visible focus ring on every
  control incl. zones.
- ☐ Screen reader: canvas is presentation; parallel DOM buttons for zones (exists —
  `BayAccessibilityLayer`); phase changes `aria-live=polite`, verdicts `assertive`; labels use
  the §4 vocabulary only ("Zone 3", never "Cove 3, Saltmere").
- ☐ `prefers-reduced-motion`: cuts + opacity only; no screen shake/ripple; information never
  motion-only.
- ☐ Flash rate ≤ 3/s everywhere (photosensitivity).
- ☐ No hover-only information on any platform.
- ☐ RU/KA strings up to +40% length verified in: primary button, status line, zone labels,
  toasts, verdict cards (pseudo-locale test in CI).
- ☐ One-hand mobile: every Stage 1–5 action reachable in the bottom 40% of a 6.1" screen.
- ☐ RG copy ("Time playing", limits, exclusion) reviewed for plain language — no metaphors.

---

## 16. Deliverable 16 — Usability-Test Plan

**Participants:** 10 per round; never seen LANDFALL; mix: 4 casual casino players (Aviator/
roulette experience), 4 non-gamblers, 2 aged 55+; ≥ 3 testing in Russian or Georgian UI.
**Setup:** mobile device, live table with bots, practice mode off, think-aloud, screen+face
recording. Moderator script: zero explanations before task 4.

**Tasks:** T1 "Here's the game — do whatever seems natural" (observe until first bet or 90 s) ·
T2 "Place a $2 bet on any zone" · T3 "Now change your zone" · T4 "What just happened in that
round?" (after one resolution) · T5 "Repeat your last bet" · T6 "Find out if the game is fair" ·
T7 "Find where to limit your spending".

**Comprehension gate (after one practice round, ≥ 80% must answer correctly — brief §19):**
Q1 Where do you place a bet? · Q2 What causes a loss? · Q3 What happens to the losing zone's
money? · Q4 Can you still change your choice, and until when? · Q5 What does "If safe ≈
$5.40–7.20" mean — is it guaranteed? · Q6 What happened in the last round?

**Metrics (instrumented + observed):**

| Metric | Target |
|---|---|
| Time to first bet (from betting-open) | ≤ 15 s median |
| Incorrect taps during first bet | ≤ 1 |
| Identify primary action immediately | ≥ 80% |
| Understand result without opening rules | ≥ 80% |
| Understand estimate ≠ guarantee (Q5) | ≥ 70% |
| Explain the game in one sentence (unaided) | ≥ 80% |
| Q1–Q6 correct | ≥ 80% each |

**Logging protocol:** timestamp every hesitation > 3 s, every misinterpreted term (record the
word verbatim), every "search" gesture (scanning for the next action), every tap on a
non-interactive element. Terms with ≥ 2 misreadings across a cohort go back to §4 for renaming.
**Cadence:** cohort 1 after P0, cohort 2 after P1, regression cohort (grandmother-test protocol
from v2 §12, kept) before commercial launch. No pass, no ship.

---

## 17. Deliverable 17 — Prioritized Implementation Backlog

**P0 — before public testing** (all in `packages/web`, no server changes):

| ID | Item | Where |
|---|---|---|
| P0-1 | Actionable primary: tap = select, **Place Bet** = commit; Expert "quick bet" pref for one-tap | `ControlDeck.tsx`, `deckState.ts`, `HarborMap.tsx`, `store.ts` |
| P0-2 | Central `strings.ts` (EN) with the §4 vocabulary; delete all inline copy; one term per concept incl. aria + system chat lines | all components |
| P0-3 | Zones numbered 1–6 everywhere; retire proper names + cove/harbor from UI (code names unchanged) | `constants.ts` consumers, `WreckLog.tsx`, `BayScene.ts`, a11y labels |
| P0-4 | Merge Rebet/Restake → **Bet Again**; delete the RESTAKE slot | `ControlDeck.tsx`, `deckState.ts` |
| P0-5 | Result copy per §13 incl. multiplier/jackpot/capped/split variants | `ResultBanner.tsx` |
| P0-6 | Money-range estimate "If safe: ≈ $A–$B" from stake × gains; ⓘ explainer; "Paused" state | `deckState.ts` (`formatPayoutStrip`), `ControlDeck.tsx` |
| P0-7 | Top strip diet to 3 items; menu absorbs tables/round#/name/etc.; jackpot chip contextual | `TopBar.tsx` |
| P0-8 | 3-step contextual first-bet onboarding + post-result explainer line | new `Onboarding.tsx`, `deckProgress.ts` |
| P0-9 | Presets 4 on stage, rest in stake sheet; ×2/½/MAX into sheet | `ControlDeck.tsx` |
| P0-10 | Stage state machine copy + disabled-not-broken styling per §8 | `deckState.ts`, `StormClock.tsx`, `index.css` |

**P1 — before commercial launch:** i18n framework + RU/KA translations with native review (L-2)
· pseudo-locale +40% CI check · Expert mode audit vs §7 · practice mode + replayable demo ·
How-to-Play rewrite per §14 incl. worked example · fairness receipt recopy · replay-card wording
pass · full accessibility pass per §15 · Player Stats/Limits/Reality-check plain-language pass ·
usability cohorts 1–2 and fixes.

**P2 — later:** personalized onboarding (skip-if-experienced heuristics) · advanced stats ·
optional thematic animation upgrades · social profiles · table customization · localization
beyond EN/RU/KA.

---

## 18. Deliverable 18 — Acceptance Criteria per Major Change

| Change | Accepted when |
|---|---|
| Actionable primary (P0-1) | A first-time tester, told nothing, places a bet in ≤ 15 s with ≤ 1 wrong tap; the primary is pressable in Stage 1 and is chosen as "the main button" by ≥ 80% of testers; zone tap alone never moves money |
| Terminology (P0-2/3/4) | Zero occurrences of: harbor, cove, proper cove names, anchor-as-verb, fleet, salvage, tide, fog-as-label, final order, rebet+restake coexisting — in rendered UI and aria (verified by string-table lint); one term per concept in EN/RU/KA |
| Result explanation (P0-5) | ≥ 80% of testers state correctly, without rules: what they won/lost, why, and where the money came from/went; loss card never styled as win |
| Payout estimate (P0-6) | ≥ 70% of testers answer "is it guaranteed?" correctly; the strip shows money (not %) and a visible "≈"; exact pools appear nowhere on the default screen |
| Top strip (P0-7) | ≤ 3 items in the strip; every removed item reachable in ≤ 2 taps; no tester asks "what is SURGE/CROSSWIND" because neither is visible by default |
| Onboarding (P0-8) | ≤ 3 interactions, each skippable; median time-to-first-bet ≤ 15 s; replay available from menu |
| State machine (P0-10) | Each of the 5 stages visually distinct in a blink test (5 screenshots, testers sort them correctly); disabled controls identified as "waiting" not "broken" by ≥ 80% |
| Mobile targets (§10) | Automated audit: all interactive ≥ 48 px, primary ≥ 56 px, no horizontal scroll in core controls, dock visible with keyboard open |
| Progressive disclosure (§7) | Fresh profile screenshot contains only the Beginner list; every unlock shows its one-line intro exactly once; Expert toggle reveals everything and never re-gates |
| Localization (P1) | RU/KA at +40% length: no clipping in the 5 stage screenshots; native-speaker sign-off recorded |
| Accessibility (P1) | Every §15 box checked; screen-reader run-through of one full round narrates all 5 stages with §4 vocabulary |
| Usability gate (P1) | §16 metrics table met by cohort 2; every term with ≥ 2 misreadings renamed and retested |

---

## Appendix A — Before/After User Flows B–F (Flow A = §11)

**Flow B — Returning casual player.** Sees: last table auto-joined, Stage 1, primary reads
**BET AGAIN $5** with sub "Zone 3 · same as last time". Understands: one tap repeats. Can:
press it, or change zone/stake first (then it reads PLACE BET). Primary: Bet Again. Secondary:
stake edit. Edge: last table full → toast "Table full — joined Harbor 2" (plain copy);
balance below last stake → primary reads PLACE BET with stake clamped, toast explains.

**Flow C — Experienced player.** Expert mode on: exact pool sheet, signals, quick-bet
(one-tap zones), keyboard map, jackpot ticker, round modifier icon, fairness from every replay
card. Understands: reads crowd/pools, splits 2 Zones, flags **Join me**, verifies after losses.
Primary: quick bet. Secondary: signals, sheets. Edge: signal cooldown badge with rounds-left
counter (kept); whale-cap toast per §12.

**Flow D — Late bet attempt.** Sees: dock dimmed with 🔒, primary **LOCKED**; taps a zone →
zone doesn't select, toast "Too late — bets are locked. Next round in 5 s.", chip shake, dud
sound. Understands: nothing was charged; when the next chance comes (countdown visible).
Edge: repeated taps never queue a bet; toast doesn't stack.

**Flow E — Player loses.** Sees: storm enters Zone 3, ✕ + impact on Zone 3, their boat marked,
slate card "−$5.00 — Zone 3 was hit" + "A 1-in-6 chance. Its pool went to the other players."
Fairness stamp glows once on first big loss (kept). Understands: which zone, what was lost, why,
that it was odds not targeting. Can: Bet Again, open Fairness, open Replay. Edge: split-loss
variants per §13.

**Flow F — Win with multiplier.** Sees: pre-announced "×2 multiplier round" chip during betting;
at result, amber card "+$12.80 — ×2 multiplier round" + "Base payout $6.40, doubled this round."
Understands: base vs multiplier, why the number beat the estimate. Can: Bet Again, share replay
card. Edge: capped payout adds the §13 cap sub-line — never silent.

## Appendix B — Learning-Curve Reference (Product Designer)

Aviator/JetX teach in one watched round because the screen contains one number and one button.
LANDFALL's equivalent minimal loop is: six zones, one timer, one button, one result sentence —
exactly the Beginner surface of §7. Mines/Plinko prove players accept variable payouts when the
*cause* of variance is visible; LANDFALL's crowd meters are that cause made visible, which is why
they stay on the beginner screen as icons while every other datum leaves. Lightning Roulette
proves multipliers need no explanation when pre-announced with a number — hence "×2 round"
replaces "Category 3".
