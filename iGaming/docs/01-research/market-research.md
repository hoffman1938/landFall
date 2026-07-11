# Market Research: Crash / Instant-Game Genre

**Prepared by:** CEO & Product Owner (executive framing), with input from Lead Game Designer
**Phase:** 1 — Research
**Status:** Baseline research for educational/local-development project. Not a commercial launch plan.

---

## 1. Genre Definition

"Instant games" (also called "crash games," "originals," or "mini-games" depending on
operator) are single-round, fast-resolving browser games that sit alongside traditional
slots and table games in online casino product suites. Defining characteristics:

- **Round length:** seconds to low tens of seconds — far shorter than a slot spin session
  or a hand of blackjack in perceived pacing, even though the underlying RTP math is the same
  family of problem.
- **One core decision:** the player makes at most one meaningful real-time decision per round
  (when to cash out, which tile to pick, whether to stop). This is the opposite of games with
  deep decision trees (poker, blackjack strategy).
- **Provably fair by convention:** because these games emerged largely from the crypto-casino
  space, cryptographic verifiability (seed/hash/HMAC schemes) is a baseline player expectation,
  not a differentiator — its *absence* is a red flag to informed players, not its presence a
  selling point.
- **High round frequency:** players can complete many rounds per minute, which materially
  changes bankroll math and addiction-risk profile compared to slower games — relevant context
  for the Legal & Compliance team's future responsible-gambling checklist, even though this
  project ships no real-money functionality.

## 2. Competitor Breakdown

### Aviator (Spribe)
The category-defining title. A plane flies up a curve while a multiplier climbs from 1.00x;
players must cash out before the plane "flies away." Strengths: extremely simple visual
metaphor, strong social proof via a live bet feed showing other players cashing out, low
production cost (a single animated curve). Weaknesses: the mechanic itself is now heavily
cloned industry-wide, so differentiation has shifted to skins/branding rather than mechanics;
some players criticize it as "just a random number with a plane on it," i.e. the presentation
does a lot of work to make a single float feel like a skill-adjacent decision.

### JetX, Spaceman, and other Aviator clones
Near-identical mechanic to Aviator with different visual themes (jet, astronaut). Confirms that
the *core loop* (rising multiplier, single cash-out decision, shared live round) is the durable,
copyable part of the genre, while art/theme is the replaceable part — informs this project's
own differentiation strategy (see [chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md)):
compete on social/spectator features and transparent fairness tooling, not on inventing a new
curve shape.

### Mines-style games (various operators)
Grid of hidden tiles, most containing "safe" multiplier boosts and a small number containing
"bombs" that end the round. Player reveals tiles one at a time; multiplier compounds with each
safe reveal. Strengths: genuine (if shallow) decision-making each turn — "do I stop now or push
my luck" — creates a stronger sense of agency than Crash's single decision. Weaknesses:
fundamentally a private, per-player round; even when hosted on shared server infrastructure,
there is no synchronous shared moment for other players to watch or react to, which caps its
"multiplayer" quality at "same server," not "same experience."

### Plinko-style games
A ball is dropped through a peg field into a multiplier bucket at the bottom, physics-driven.
Strengths: strong visual appeal, satisfying "physical" randomness feel, minimal decision-making
(single drop action) suits absolute beginners. Weaknesses: least mathematically interesting of
the four (bucket probabilities are static and pre-determined by peg geometry, not a live
decision under pressure), and each drop resolves independently and near-instantly, so there is
no shared round to rally around.

### Limbo-style games
Player enters a target multiplier; a single random draw either meets or fails to meet it.
Strengths: the simplest possible implementation, almost a pure math widget. Weaknesses: least
game-like of the four — closer to a numeric form submission than an experience — and offers
essentially no shared/social surface at all.

## 3. Player Psychology in This Genre

- **Risk/reward tension under time pressure** (Crash specifically) — the core engagement loop
  is the player's own nervous anticipation of "should I take the sure thing now or risk it for
  more," repeated every few seconds. This is the same psychological mechanism as classic
  push-your-luck game design (e.g. Blackjack's "hit or stand," Balloon Analogue Risk Task in
  behavioral research).
- **Near-miss effects** — watching the multiplier climb past where you would have cashed out,
  or crashing one tick after a cash-out, are established drivers of continued play across the
  gambling-research literature; game feel (animation timing, sound stingers) amplifies this.
- **Social proof** — a live feed of other players' bets and cash-outs increases perceived
  legitimacy and creates a "everyone else is playing, and winning" ambient signal — this is a
  deliberate product feature in Aviator-likes, not an accident, and is one lever this project's
  differentiation plan leans on (see GDD's social/multiplayer feature spec).
- **Session-length dynamics** — round frequency in this genre is much higher than slots, so
  bankroll depletion (or growth) happens faster in wall-clock time, which is directly relevant
  to responsible-gambling design even in an educational build (bet limits, cool-down framing
  should be considered in future compliance work, not implemented as gameplay features now).

## 4. Regulatory / Genre Landscape (high-level orientation only)

This project is explicitly educational and local-only, with no real-money wagering, so full
regulatory analysis is out of scope for Phase 1. For future context (tracked as a placeholder
for the Legal & Compliance team, expanded later if this ever moves toward any real deployment):
real-money instant games in most regulated markets require independent RNG certification (e.g.
from testing labs such as iTech Labs or GLI), documented RTP disclosure, and responsible-gambling
tooling (deposit limits, reality checks, self-exclusion). Independent certification remains out
of scope for this educational build, but the RG tooling now exists demo-grade (remediation
F1/F2: server-enforced loss/stake limits with a 24h raise cooldown, reality checks, and a
self-exclusion lockout), and the provably-fair RNG design is intentionally built to the same
cryptographic standard real certified games use, so that the *mathematical* foundation would
not need to be redone if this project were ever extended toward that context.

## 5. Gaps / Opportunities

1. **Genuine social layer, including real chat.** Most Aviator clones show *a* live feed, but
   few offer actual in-round chat, and fewer still make the spectator experience a first-class
   feature (e.g., following a specific player, side-commentary, reactions). There's room to lean
   harder into "watching and talking through the round with other people" as the differentiator,
   since the core multiplier mechanic itself is not a place to innovate without abandoning the
   genre's proven appeal.
2. **Transparent, player-facing fairness tooling.** Most operators bury the seed-verification UI
   several menus deep, if they expose it at all in an approachable form. A polished, one-click
   "verify this round" experience is both a genuine trust-builder and a good showcase of the
   engineering work in this project.
3. **Honest math education.** Because this project is explicitly educational, publishing the
   full RTP derivation and simulation methodology (see [mathematical-model.md](../03-math/mathematical-model.md))
   as player-facing (or at least developer-facing) documentation is itself a differentiator most
   commercial operators avoid for competitive/IP reasons.
4. **Original presentation instead of another vehicle-flying-away reskin.** As §2 notes, JetX,
   Spaceman, and the many unnamed clones differ from Aviator only in *what object is flying
   away* — the underlying visual metaphor and social framing are unchanged across almost the
   entire genre. There is room for a presentation theme that isn't a plane/jet/rocket variant, and
   ideally one whose fiction gives the social layer (gap #1) a genuine reason to exist rather than
   feeling bolted on.
5. **No mechanically multiplayer game exists in the category at all.** This is the deepest gap,
   identified after re-examining the genre under the revised mandate: in every game surveyed in
   §2 — including Crash, the most "social" of them — each player's bet is mathematically
   independent of every other player's. Other players are *scenery* (a feed, a counter), never
   *inputs*. No surveyed instant game has a payout function that takes the crowd's choices as an
   argument. Pari-mutuel structures (which do exactly that, and have a century of precedent in
   tote/horse betting) have never been fused with the instant-game format's short shared rounds.
   A game built on that fusion would be structurally impossible to experience alone — the
   strongest possible form of "multiplayer by design."

These gaps directly inform the current product direction
([chosen-mechanic-rationale.md](../02-game-design/chosen-mechanic-rationale.md)): gap #5 became
the foundation of the chosen game (**Landfall**, a positional-survivor pari-mutuel game), gap #1
kept chat as a core feature, gap #4 drove an original maritime identity rather than any
vehicle-escape reskin, and gaps #2-3 continue to drive the provably-fair tooling and published
math.
