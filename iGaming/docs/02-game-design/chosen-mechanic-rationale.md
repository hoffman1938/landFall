# Chosen Concept: LANDFALL

**Prepared by:** Lead Game Designer, with sign-off from CEO & Product Owner
**Phase:** 3 (rerun) — Choose Best Concept, under the revised no-derivative mandate
**Depends on:** [concept-generation.md](concept-generation.md)
**Supersedes:** the original Phase-3 decision (Crash mechanic, later themed "Ember"). That
decision was correct under the original brief ("compete with Aviator-like games"); the brief
changed to "invent a new category — do not reuse Crash, Aviator, Mines, Limbo, Dice, Plinko,
Hi-Lo, Wheel, or slot mechanics." The Crash-era analysis is retained in
[mechanic-comparison.md](mechanic-comparison.md) as the reference map of existing mechanics we
must not reproduce.

---

## 1. Decision

**The flagship game is LANDFALL** — a positional-survivor, pari-mutuel instant game:

> Drop your anchor at one of six harbors. The storm wrecks one. Everyone else splits the
> wrecked harbor's cargo.

One decision (where to anchor), ~20-second rounds, provably fair single draw, and a payout that
is a live function of where *other players* chose to stand.

## 2. Why This Is Genuinely Different (Mandated Resemblance Check)

Per the mandate, any resemblance to an existing game must be confronted, not hand-waved:

| Banned mechanic | Structural difference |
|---|---|
| Crash / Aviator / JetX | No rising multiplier, no timing decision, no bail-out. The player's entire decision happens *before* the random event; the tension is positional and social, not temporal. |
| Wheel / roulette | Closest relative, and the one to take seriously. Three inversions separate them: **(1) outcome inversion** — in Wheel you win if the draw *selects* you; in Landfall the selected harbor *loses* and everyone else wins (survivorship, not selection); **(2) pari-mutuel payouts** — Wheel pays a fixed paytable; Landfall's payout is computed from the live distribution of real players' stakes, so no paytable exists and no two rounds pay alike; **(3) the crowd is the strategy layer** — Wheel gives you nothing to think about between spins; Landfall's live pool bars make "where is everyone else?" the whole game. A Wheel player who switches segments changes nothing; a Landfall player who re-anchors changes their expected payout (validated in [mathematical-model.md](../03-math/mathematical-model.md)§4). |
| Mines | No grid reveal, no sequential picks, no compounding. |
| Limbo / Dice / Hi-Lo | No player-chosen target/threshold against a number draw. |
| Plinko | No physics cascade determining the outcome (storm animation is deterministic theater derived from the revealed seed — cosmetic only). |
| Slots | No reels, paylines, or symbol tables. |

The honest prior-art note: **survivor pools and pari-mutuel wagering both exist** (sports
elimination pools; horse-race tote betting). What does not exist, to this studio's knowledge,
is their combination as a **live, 20-second, shared-round instant game with a visible crowd** —
that combination is the category claim, and it is defensible because the ingredient neither
Wheel nor tote betting has is *watching the crowd redistribute itself in real time before the
lock*, which is only possible in a synchronous multiplayer round.

## 3. Why It Wins on the Mandate's Own Criteria

1. **Explainable in under 10 seconds** — one sentence (§1), and watching a single round teaches
   it completely: bars fill up on six islands, storm hits one, numbers rain on the other five.
2. **One core mechanic, one decision** — which harbor. Bet size is a parameter, not a second
   mechanic (single anchor per round in MVP — see
   [concept-generation.md](concept-generation.md)§4, Iteration 3).
3. **Multiplayer by design, not by decoration** — this is the strongest single argument for
   Landfall: the payout formula takes the other players' positions as input. A solo Landfall
   round is not a lesser experience; it is (near-)mathematically undefined without seeded
   counterparty pools (see [mathematical-model.md](../03-math/mathematical-model.md)§6). Crash
   is a shared *screening* of individually-independent bets; Landfall's bets interact.
4. **Spectator-native** — the pre-lock crowd scramble (pool bars shifting as players re-anchor)
   is legible drama even for someone who has never played, and the storm-path tease gives the
   reveal a 4-second anticipation arc.
5. **Generates memorable moments** — the signature story players retell: "Harbor 3 had 60% of
   the round's money and the storm hit *it* — everyone else nearly doubled." That moment is
   impossible in any fixed-odds game.
6. **Emotionally distinct from Crash** — Crash's loop is private greed-vs-fear on a timer.
   Landfall's loop is communal: dread during the storm approach, shared relief (5/6 of players
   survive a typical round), sympathy/schadenfreude for the wrecked harbor, and chat-native
   banter ("get OFF harbor 2, it's overloaded"). Chat remains a **core feature** (carried
   forward from the previous product direction — it fits this game even better, since
   coordination talk is now strategically meaningful).
7. **Structurally safer for the operator-side math** — pari-mutuel redistribution means the
   house never pays out more than the round took in (validated conservation in
   [mathematical-model.md](../03-math/mathematical-model.md)§7); there is no 1000x-liability
   tail as in Crash.

## 4. Known Weaknesses (Stated, With Mitigations)

- **No tail-multiplier fantasy.** Landfall's per-round upside is bounded by the round's own
  pot; there is no "I could win 500x" dream. Mitigation: this is a real trade (social drama in
  exchange for jackpot fantasy) accepted deliberately; a future "storm surge" progressive side
  pool could restore tail upside without touching the core mechanic — roadmap item only.
- **Needs liquidity to shine.** The crowd IS the content. With very few players the strategic
  layer thins out. Mitigation: house-seeded baseline pools per harbor (mathematically analyzed,
  not hand-waved — [mathematical-model.md](../03-math/mathematical-model.md)§6) keep solo/low-pop
  rounds playable and correctly priced; the game is honest about being best with a crowd.
- **Volatility is emergent, not player-selected.** Crash lets each player dial risk via target
  multiplier; Landfall's payout variance is set by the crowd's shape. Mitigation: accepted for
  MVP purity; future room tiers (different K, different rake) offer coarse volatility choice.

## 5. Plan B and Plan C

- **Plan B — Undertow** (pure minority game, [concept-generation.md](concept-generation.md)#11):
  highest-originality runner-up; shelved because it degenerates below ~10 concurrent players and
  is collusion-prone. Revisit if/when the platform has reliable concurrent population.
- **Plan C — Impact** (continuous placement, distance-ranked pari-mutuel,
  [concept-generation.md](concept-generation.md)#31): strongest visual candidate; shelved for
  settlement-math explainability and mobile-UI cost. Natural second title — it reuses the entire
  platform (wallet, provably-fair pipeline, pari-mutuel settlement engine, chat).

Both reuse Landfall's infrastructure wholesale, which is exactly the "additional game modes"
expansion the long-term roadmap anticipates
([technical-specification.md](../06-spec/technical-specification.md)§21).

## 6. Identity & Branding Direction (summary — full treatment in the GDD)

- **Name:** LANDFALL (working title; short, evocative, globally pronounceable, no trademark
  collision found in the instant-game space at time of writing — formal clearance is a
  Product/Legal task before any public release).
- **Iconic symbol:** a lighthouse with a beam cutting through storm clouds — survivorship in one
  image; renders cleanly at favicon size.
- **Visual language:** deep navy/storm palette with one signal color (beacon amber) reserved
  exclusively for the surviving payout moment.
- **Audio identity:** foghorn (anchor window opens), rising wind (storm approach), single
  thunderclap (landfall), harbor bell (your survival payout) — four cues, all ownable and
  royalty-free-sourceable per the asset constraints.
