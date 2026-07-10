# Concept Generation: Inventing a New Instant-Game Category

**Prepared by:** Lead Game Designer, Gambling Mathematician, and Behavioral Psychology
consultant personas (joint deliverable), with veto review by Security Architect
**Phase:** 2 (rerun) — Idea Generation under the revised mandate
**Status:** This document supersedes the original Phase-2 conclusion (Crash selection) recorded
in [mechanic-comparison.md](mechanic-comparison.md). The mandate changed: the studio must **not**
build on any existing instant-game mechanic (Crash/Aviator, JetX, Mines, Limbo, Dice, Plinko,
Hi-Lo, Wheel, slots). The goal is a new category, not a better skin.

---

## 0. Method

We generated 100 raw concepts across 10 structural families, applied a quick 5-axis screen
(Originality, Simplicity, Fun, Spectator value, Social interaction — each 1-5), de-duplicated
aggressively (many "different" ideas are the same structure wearing different art), ran the
10 strongest through the full 10-axis scorecard, then iterated on the winner through four
design passes. Honesty note: raw idea counts flatter themselves — of 100 concepts, only **8
genuinely distinct interactive structures** survive de-duplication (§3). That finding is itself
the most useful output of the exercise: the space of "one decision + one random event + shared
round" games is structured, and most of it is already occupied by the banned list.

**First-principles screen used throughout** (from the mandate): what naturally creates
anticipation, tension, relief, surprise, competition, and memorable moments with only one
meaningful decision? Candidate answers: (a) waiting for a random event you're exposed to,
(b) positioning yourself relative to *other people* before a random event, (c) collectively
influencing the risk everyone shares, (d) predicting other people rather than the RNG.
The banned list has thoroughly mined (a). Families (b), (c), (d) are where new categories live —
they are *multiplayer-native*: the tension source is other players, which single-player games
structurally cannot copy.

## 1. The 100 Concepts (compact register)

Scores: **O**riginality / **S**implicity / **F**un / **Sp**ectator / **So**cial, each 1-5.
Verdicts: ✂ = rejected (reason), ≈ = duplicate of a stronger entry, ☆ = shortlisted.

### Family A — Positional survivor, pari-mutuel (place yourself; random event strikes one position; survivors are paid from the struck pool)

| # | Name | Mechanic (one line) | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | **Landfall** | Anchor at 1 of 6 harbors; a storm wrecks one; survivors split the wrecked harbor's stakes pro-rata | 4 | 5 | 4 | 5 | 5 | ☆ **winner candidate** |
| 2 | Plague Ship | Bet on *which* ship sinks; correct pickers split pot | 2 | 5 | 3 | 4 | 3 | ✂ betting ON the draw = roulette/wheel structure |
| 3 | Meteor Shelter | Bunkers instead of harbors, meteor instead of storm | 4 | 5 | 4 | 5 | 5 | ≈ #1 (skin) |
| 4 | Blackout | City districts, one loses power | 4 | 5 | 3 | 4 | 5 | ≈ #1 (skin) |
| 5 | Avalanche | Mountain slopes, one slides | 4 | 5 | 4 | 5 | 5 | ≈ #1 (skin) |
| 6 | Wolf in the Fold | Sheep pens, wolf raids one | 4 | 5 | 4 | 4 | 5 | ≈ #1 (skin) |
| 7 | Customs Run | Six gates, one is inspected; caught smugglers fund the rest | 4 | 5 | 4 | 4 | 5 | ≈ #1 (skin, edgier fiction) |
| 8 | Musical Harbors | Harbors close one by one over several waves | 3 | 3 | 4 | 4 | 5 | ✂ multi-wave = multiple decisions, 60s+ rounds |
| 9 | Flood Plains | Water rises to a random level; low ground loses | 3 | 4 | 3 | 4 | 4 | ✂ "rising level + threshold" reads as Crash-adjacent |
| 10 | Lightning Rod | One tower of 6 struck; volunteers *on* the struck tower win | 3 | 4 | 3 | 4 | 3 | ✂ inverse framing = betting on the draw (see #2) |

### Family B — Minority/majority games (the crowd itself is the randomness)

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 11 | **Undertow** | Pick red or blue current; the *minority* side wins the majority's stakes (no RNG at all) | 5 | 5 | 4 | 4 | 5 | ☆ |
| 12 | Stampede | Majority side wins but at crowd-diluted odds | 3 | 4 | 3 | 3 | 4 | ✂ converges to boring equilibrium |
| 13 | Beauty Contest | Guess 2/3 of the crowd's average number | 5 | 2 | 3 | 2 | 4 | ✂ number entry ≠ one-button; slow to grasp |
| 14 | Odd One Out | Pick the emoji you think fewest others pick | 4 | 4 | 3 | 3 | 4 | ≈ #11 generalized to K options |
| 15 | Copycat | Predict which option the crowd will pick *most* | 4 | 4 | 3 | 3 | 5 | ☆ (as a future side-market, not a core game) |
| 16 | Split Current | Continuous slider version of #11 | 4 | 2 | 3 | 3 | 4 | ✂ slider ≠ one-button |
| 17 | Ghost Vote | Minority game with one RNG "ghost" vote added | 4 | 4 | 3 | 3 | 4 | ≈ #11 + noise (the noise helps low population; noted as #11 patch) |
| 18 | Defectors | Everyone starts allied; secretly defect or hold | 4 | 3 | 4 | 3 | 5 | ✂ trust games turn toxic with stakes |
| 19 | Herd | Bet WITH the herd for safety or against for payout | 3 | 4 | 3 | 3 | 4 | ≈ #12 |
| 20 | Tiebreaker | Minority game, ties broken by provably-fair draw | 4 | 4 | 3 | 3 | 4 | ≈ #11 patch (adopted into #11's spec) |

### Family C — Collective load / shared push-your-luck (crowd behavior moves the risk everyone shares)

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 21 | **The Raft** | Board or sit out; sink probability rises with total staked load; if it holds, boarders split a bonus pool | 5 | 4 | 4 | 4 | 5 | ☆ |
| 22 | Powder Keg | Stakes add fuse-length risk to a shared payout keg | 4 | 4 | 4 | 4 | 4 | ≈ #21 (skin) |
| 23 | Dam | Shared dam holds or breaks vs. total load | 4 | 4 | 3 | 4 | 4 | ≈ #21 (skin) |
| 24 | Communal Balloon | Crowd inflates one balloon; joiners bail anytime | 3 | 4 | 4 | 4 | 4 | ✂ bail-timing = Crash in a trench coat |
| 25 | Overload | Power grid version of #21 | 4 | 4 | 3 | 3 | 4 | ≈ #21 (skin) |
| 26 | Feast | Pot pays only if enough players join (threshold public good) | 4 | 3 | 3 | 3 | 5 | ✂ coordination failure ⇒ frequent dead rounds |
| 27 | Ballast | Choose which side of a ship to load; imbalance capsizes | 4 | 3 | 3 | 4 | 5 | ✂ two coupled decisions (side + amount) |
| 28 | Chain Gang | Payout chain breaks at a random link scaled by load | 3 | 3 | 3 | 3 | 3 | ✂ opaque math, hard to explain in 10s |
| 29 | Bonfire Watch | Crowd's stakes feed a fire that may flare out | 3 | 4 | 3 | 4 | 4 | ≈ #24 (Crash-adjacent) |
| 30 | Critical Mass | Reactor pays more as more join, melts down probabilistically | 4 | 4 | 4 | 4 | 4 | ≈ #21 (skin) |

### Family D — Continuous spatial placement (place a point; random point lands; geometry decides)

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 31 | **Impact** | Drop a pin anywhere on a map; a meteor lands at a provably-fair point; payouts ranked by distance, funded pari-mutuel by the closest | 5 | 4 | 4 | 5 | 4 | ☆ |
| 32 | Lightning Field | Closest pin to the strike wins all | 3 | 4 | 3 | 4 | 3 | ✂ "closest wins" = continuous roulette |
| 33 | Treasure Sonar | Closest to hidden treasure wins | 3 | 4 | 3 | 4 | 3 | ≈ #32 |
| 34 | Ripple | Stone drops; rings spread; survive outside ring N | 4 | 4 | 4 | 5 | 4 | ≈ #31 with radial payout bands |
| 35 | Safe Radius | Choose your own circle size: smaller = riskier, higher multiplier | 3 | 4 | 3 | 3 | 2 | ✂ risk-dial = Limbo in disguise |
| 36 | Tide Line | Place a marker on a beach; tide reaches a random height | 3 | 4 | 3 | 4 | 3 | ✂ 1-D rising level = Crash-adjacent read |
| 37 | Frost | Place plants; frost spreads from a random seed cell | 4 | 3 | 3 | 4 | 3 | ✂ contagion spread = multi-step, slow |
| 38 | Minefield March | Choose a path across a grid | 2 | 3 | 3 | 3 | 2 | ✂ Mines |
| 39 | Constellation | Pick a sky sector; comet crosses one | 3 | 5 | 3 | 4 | 3 | ✂ = Wheel with stars |
| 40 | Drift | Place a buoy; current (random vector) carries it toward/away from a reef | 4 | 3 | 3 | 4 | 3 | ✂ two random factors, murky fairness story |

### Family E — Timing & synchrony (non-crash)

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 41 | Freeze Frame | All players tap to stop one shared spinner nearest a hidden mark | 3 | 4 | 3 | 4 | 4 | ✂ reaction-skill + network latency = unfair by construction |
| 42 | Pulse | Tap on the beat; streaks build a pot | 3 | 4 | 3 | 3 | 3 | ✂ rhythm skill game, not a fair-odds game |
| 43 | Chorus | Pot pays only if enough players tap within the same 1s window | 4 | 4 | 3 | 4 | 5 | ✂ #26's coordination-failure problem plus latency |
| 44 | Photo Finish | Lock your guess of when a racer crosses the line | 3 | 3 | 3 | 4 | 3 | ✂ timing prediction = Crash-family tension |
| 45 | Countdown | Secret timer; last to act before it fires wins | 3 | 4 | 4 | 4 | 4 | ✂ "act before hidden deadline" = Crash structure |
| 46 | Heartbeat | Shared meter speeds/slows randomly; lock on your beat | 2 | 3 | 2 | 3 | 2 | ✂ obscure |
| 47 | Semaphore | React to a randomly-timed flag; fastest N split pot | 2 | 4 | 3 | 3 | 3 | ✂ pure latency race |
| 48 | Long Exposure | Hold a button; longer hold = more payout unless flash fires | 3 | 4 | 4 | 3 | 3 | ✂ hold-vs-bail = Crash with a button held down |
| 49 | Metronome War | Two teams alternate taps to push tempo | 3 | 3 | 3 | 3 | 4 | ✂ skill/latency again |
| 50 | Eclipse | Lock in during a slowly closing window of unknown end | 3 | 4 | 3 | 4 | 3 | ✂ Crash structure (window ends = curve crashes) |

### Family F — Number/auction selection

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 51 | **Quay Auction** | Lowest *unique* bid wins the pot (LUPI) | 4 | 3 | 4 | 3 | 5 | ☆ (weak — see §3) |
| 52 | Highest Unique | Mirror of #51 | 3 | 3 | 3 | 3 | 4 | ≈ #51 |
| 53 | Penny Harbor | Descending-price race | 1 | 3 | 2 | 2 | 2 | ✂ penny-auction mechanics are predatory |
| 54 | Sealed Cargo | Vickrey-style sealed bids for a mystery multiplier | 3 | 2 | 3 | 2 | 3 | ✂ auction theory ≠ 10-second onboarding |
| 55 | Number Necromancy | Pick the number least picked historically | 3 | 3 | 2 | 2 | 3 | ≈ #14 |
| 56 | Range War | Claim a range; narrowest range containing the draw wins | 3 | 2 | 3 | 3 | 3 | ✂ two-parameter decision |
| 57 | Coordinates | Pick X and Y separately with different crowds | 3 | 2 | 3 | 3 | 3 | ✂ two decisions |
| 58 | Ladder Bids | Bid rungs; random rung collapses | 3 | 3 | 3 | 3 | 3 | ≈ #1 with numbers instead of places |
| 59 | Fair Split | Claim a % of pot; claims over 100% total void everyone | 4 | 3 | 3 | 3 | 5 | ✂ griefing-dominant |
| 60 | One Coin Each | Everyone stakes exactly 1 unit, minority digit wins | 3 | 4 | 3 | 3 | 4 | ≈ #11 |

### Family G — Racing/pursuit with a shared live event

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 61 | Regatta | Pick a boat; boats race; winner's backers paid | 1 | 5 | 3 | 4 | 3 | ✂ horse racing / Wheel with sails |
| 62 | Predator | Six runners; ONE is eliminated mid-race; backers of survivors split the eliminated pool | 4 | 4 | 4 | 5 | 4 | ≈ #1 on rails (racing skin of Landfall — noted as an excellent future theme) |
| 63 | Slipstream | Back a racer, gain from the racer ahead's wake | 2 | 2 | 2 | 3 | 3 | ✂ opaque |
| 64 | Relay | Back a team across handoff legs | 2 | 3 | 3 | 3 | 3 | ✂ multi-leg = long rounds |
| 65 | Fox Hunt | One fox, five hounds, back either side | 2 | 4 | 3 | 4 | 3 | ✂ two-outcome Wheel |
| 66 | Migration | Flocks cross a hazard; some fraction survives | 3 | 3 | 3 | 4 | 3 | ✂ fractional outcomes muddy the payout story |
| 67 | Iceberg Right Ahead | Ships steer port/starboard by crowd vote; iceberg placement random | 4 | 3 | 3 | 4 | 5 | ✂ crowd-vote steering = whale-dominated |
| 68 | Convoy | Join a convoy; stragglers picked off by RNG | 3 | 3 | 3 | 3 | 4 | ≈ #1 |
| 69 | Gold Rush | Claim plots along a race path | 3 | 3 | 3 | 3 | 3 | ≈ #1 |
| 70 | Paceline | Bet on when the breakaway happens | 2 | 3 | 3 | 3 | 3 | ✂ timing prediction = Crash-family |

### Family H — Elimination chains & tournaments-in-miniature

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 71 | Lifeboat Ladder | Repeated eliminations until one boat remains | 3 | 3 | 4 | 4 | 5 | ✂ multi-round = 60s+, many decisions |
| 72 | Sudden Death | Knockout brackets each round | 2 | 3 | 3 | 4 | 4 | ✂ session-length violation |
| 73 | Musical Chairs Royale | Chairs removed over waves | 3 | 3 | 4 | 4 | 5 | ≈ #8 |
| 74 | Last Light | Lanterns randomly extinguished until one holds | 3 | 4 | 3 | 4 | 4 | ✂ pure lottery, no decision at all |
| 75 | Tontine | Survivor pool across many rounds | 3 | 2 | 3 | 2 | 4 | ✂ session-scale, not instant |
| 76 | Shipwreck Series | Best-of-3 Landfall | 2 | 3 | 3 | 3 | 4 | ≈ #1 tournament wrapper (future mode, not core) |
| 77 | Gauntlet | Choose when to exit a chain of survival draws | 3 | 3 | 4 | 4 | 3 | ✂ exit-timing chain = Crash discretized |
| 78 | Winner Stays | Champion's odds shift as they survive rounds | 3 | 3 | 3 | 3 | 4 | ✂ multi-round state |
| 79 | Thin Ice | Step forward each wave or bank | 3 | 4 | 4 | 4 | 3 | ✂ step/bank = Crash discretized (also ≈ Gauntlet) |
| 80 | Armada | Fleet-vs-fleet team elimination | 3 | 3 | 3 | 4 | 5 | ✂ team framing needs population; future mode at best |

### Family I — Predicting the crowd (meta-markets)

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 81 | Oracle | Bet on which harbor will end up most crowded | 4 | 4 | 3 | 3 | 5 | ☆ (future side-market on Landfall, not standalone) |
| 82 | Sentiment | Predict the % split of the crowd | 3 | 2 | 3 | 3 | 4 | ✂ number entry |
| 83 | Bandwagon | Payout for joining the *fastest-growing* pool | 3 | 3 | 3 | 3 | 4 | ✂ rewards herding = degenerate feedback loop |
| 84 | First Mover | Bonus for earliest picks | 3 | 4 | 3 | 3 | 3 | ✂ patch, not a game (adopted as a Landfall tuning option) |
| 85 | Mind Reader | Match a randomly chosen *other player's* pick | 4 | 4 | 3 | 3 | 5 | ✂ pairwise, doesn't scale to rooms |
| 86 | Poll Position | Predict the crowd's top answer to a fun prompt | 4 | 3 | 4 | 3 | 5 | ✂ content treadmill (needs endless prompts) |
| 87 | Echo | Predict whether next round's crowd beats this round's | 3 | 4 | 2 | 2 | 3 | ✂ thin |
| 88 | Whale Watch | Bet on whether a 100+ stake appears this round | 3 | 4 | 2 | 3 | 4 | ✂ side-bet, not a game |

### Family J — Physics spectacle on a shared object (theater over a fair draw)

| # | Name | Mechanic | O | S | F | Sp | So | Verdict |
|---|---|---|---|---|---|---|---|---|
| 89 | Wrecking Ball | Pendulum visibly swings, releases, smashes one of six towers | 4 | 5 | 4 | 5 | 5 | ≈ #1 (Landfall with physics theater — adopted as presentation inspiration) |
| 90 | Domino Cascade | Branching domino run ends at one of six bells | 3 | 5 | 4 | 5 | 4 | ≈ Wheel with theater |
| 91 | Pinfall | Ball cascades through pegs into zones | 1 | 5 | 3 | 4 | 3 | ✂ Plinko |
| 92 | Sandcastle | Tide erodes castles until one falls | 3 | 4 | 3 | 4 | 4 | ≈ #1 (skin) |
| 93 | Volcano | Lava flow path chooses a village | 4 | 5 | 4 | 5 | 5 | ≈ #1 (skin) |
| 94 | Glass Bridge | Panels break under a random walker | 2 | 4 | 3 | 5 | 4 | ✂ licensed-media adjacency (Squid Game), and = sequential Mines |
| 95 | Marble Run | Back a marble through a maze | 2 | 5 | 3 | 4 | 3 | ✂ = Wheel/racing |
| 96 | Pressure Valve | One of six valves blows on a shared boiler | 4 | 5 | 4 | 4 | 4 | ≈ #1 (skin) |
| 97 | Kite Storm | Six kites, gust snaps one line | 4 | 5 | 4 | 4 | 4 | ≈ #1 (skin) |
| 98 | Icebreaker | Ship's random path crushes one fishing hole | 4 | 5 | 4 | 4 | 4 | ≈ #1 (skin) |
| 99 | Aurora | Sky sectors light up; one burns out | 3 | 5 | 3 | 4 | 3 | ✂ = Wheel |
| 100 | Beacon | Six lighthouses; fog swallows one | 4 | 5 | 4 | 4 | 5 | ≈ #1 (skin — strong branding candidate for Landfall's art direction) |

## 2. What De-Duplication Reveals

The 100 concepts collapse to **8 genuinely distinct structures**:

| Structure | Representative | Multiplayer-native? | Fatal flaw? |
|---|---|---|---|
| A. Positional survivor pari-mutuel | Landfall (#1) | **Yes — payouts are literally a function of other players' choices** | None found |
| B. Pure minority game | Undertow (#11) | Yes — *entirely* other players | Degenerate below ~10 concurrent players; collusion-prone |
| C. Collective-load push-your-luck | The Raft (#21) | Yes — crowd's total stake IS the risk | Risk curve is house-defined ⇒ harder fairness story; whales distort |
| D. Distance-ranked placement | Impact (#31) | Partially — ranking is inter-player | Continuous fairness math + ranked settlement much heavier to build and explain |
| E. Lowest-unique-bid | Quay Auction (#51) | Yes | Known lottery format (not category-creating); number entry; snipe-heavy |
| F. Crowd-prediction meta | Oracle (#81) | Yes | Parasitic — needs a host game to predict; side-market, not a flagship |
| G. Timing/synchrony | Freeze Frame (#41) | Weakly | Latency = pay-to-win-by-ping; or collapses into Crash |
| H. Elimination chains | Lifeboat Ladder (#71) | Yes | Violates round-length and one-decision constraints |

Everything else in the register is one of these eight wearing different art, or a member of the
banned list wearing different art. G and H fail hard constraints. E is real but pre-existing
(unique-bid auctions) and weak on one-button simplicity. F is an add-on by definition.

## 3. Top Candidates — Full 10-Axis Scoring

Scale 1-10. Technical complexity and production cost are *inverted* (10 = cheap/simple).

| Axis | A. Landfall | B. Undertow | C. The Raft | D. Impact |
|---|---|---|---|---|
| Originality | 8 | 9 | 8 | 8 |
| Simplicity | 9 | 9 | 7 | 7 |
| Fun | 8 | 7 | 7 | 8 |
| Spectator value | 9 | 6 | 7 | 9 |
| Social interaction | 9 | 9 | 8 | 7 |
| Mobile friendliness | 9 | 10 | 8 | 7 |
| Technical simplicity | 8 | 9 | 6 | 5 |
| Production cost (cheapness) | 8 | 9 | 7 | 5 |
| Long-term scalability (tournaments/events/modes) | 9 | 6 | 6 | 8 |
| Viral potential | 8 | 6 | 7 | 8 |
| **Total** | **85** | **80** | **71** | **72** |

**Why Undertow loses despite the highest originality:** a pure minority game needs a healthy
concurrent population to function at all (with 3 players it's rock-paper-scissors against
strangers; with 2 it's broken), is structurally vulnerable to collusion (a group coordinating
off-platform can farm the minority side), and its spectator surface is thin — two bars moving.
It is preserved as **Plan B** (see [chosen-mechanic-rationale.md](chosen-mechanic-rationale.md))
because at scale it is a genuinely beautiful game, and its degenerate-population problem has a
known patch (#17's RNG ghost votes).

**Why The Raft loses:** the sink-probability-vs-load curve is set by the house, which reopens
the exact trust problem provable fairness exists to close ("is the curve honest?" is much harder
to verify than "was the draw uniform?"), and whales can grief by boarding late with huge stakes
to spike everyone's risk.

**Why Impact loses (for now):** it has the best screenshot appeal of the four, but
distance-ranked pari-mutuel settlement is the heaviest math to explain to a player in 10
seconds ("why did I get 1.4x and she got 2.1x?"), continuous-space provable fairness needs more
careful spec, and the placement UI is meaningfully harder on small phones. Preserved as
**Plan C** and as a strong second title on the same platform.

## 4. Winner: LANDFALL — and Four Improvement Iterations

**Core, in one sentence: drop your anchor at one of six harbors; the storm wrecks one;
everyone else splits the wrecked harbor's cargo.**

The concept as first drafted (#1) survived four adversarial design passes:

- **Iteration 1 — fixed odds vs. pari-mutuel.** First draft paid survivors a fixed multiplier
  (K/(K−1) minus edge). Rejected: fixed odds delete the crowd from the payout, reducing the game
  to a 6-segment survival Wheel — exactly the resemblance we must avoid. **Pari-mutuel is the
  identity of the game**: your payout depends on where *other people* stood, which no
  single-player game and nothing on the banned list does. It also gives the house zero payout
  liability (pure redistribution + rake), a structural improvement over Crash-style games that
  carry unbounded multiplier liability.
- **Iteration 2 — bet on the struck harbor vs. survive it.** A "pick which one sinks" variant
  scores as roulette (#2). Inverting to survivorship changes everything: the modal round is a
  small win (5/6 survival at K=6), losing is an event rather than the default, and the fiction
  becomes communal ("we made it; their harbor didn't") rather than adversarial-vs-house.
- **Iteration 3 — one anchor, not two.** An earlier internal draft (inherited from the Crash
  GDD's dual bet slots) allowed hedging across two harbors. Cut: hedging across zones dilutes
  the one-decision purity the mandate demands, halves the emotional stake of the storm reveal,
  and adds UI surface. Single anchor per round in MVP; multi-anchor is a future room variant.
- **Iteration 4 — make the crowd visible, and let players re-anchor until lock.** Live pool
  bars per harbor during the anchor window are what turn a uniform-odds pick into a *decision*
  (the strike is uniform; the payoff is not — minority harbors are relatively +EV, validated in
  [mathematical-model.md](../03-math/mathematical-model.md)). Allowing re-anchoring until lock
  creates the signature spectacle: the last-3-seconds crowd scramble. The predictable
  late-switching meta is not an exploit — the strike is uniform regardless — it *is* the game.

Full rationale, difference-from-banned-list analysis, and Plans B/C:
[chosen-mechanic-rationale.md](chosen-mechanic-rationale.md). Full ruleset:
[game-design-document.md](game-design-document.md). Math:
[mathematical-model.md](../03-math/mathematical-model.md).
