# LANDFALL — clear game loop

The default screen is a dark, flat dashboard. The main path is **choose a harbor → confirm the amount → watch the storm → read your result**. The existing advanced game is available through Menu → Advanced controls; it loads only on request.

## What the review found

The old beginner view still split its final three seconds into four messages, called editable bets “locked”, and allowed edited amounts to be sent by a subsequent harbor tap. Quick-bet and split preferences could bypass confirmation. Returning profiles could be sent directly to the advanced view. Results emphasized the struck harbor before the player's own outcome, and some multiplier labels incorrectly implied that the entire payout was multiplied.

The new dashboard removes the fog substeps from the primary presentation. Fog still constrains the actual last change on the server; it no longer introduces a new screen or a subsecond decision dialog. There is one stable location for the amount and confirmation button. Draft selection, accepted bet, and locked bet have different labels. A harbor tap never commits a simple-mode bet. Editing the amount never silently changes the accepted bet.

## What remains the same

- Six harbors; exactly one is hit, uniformly at 1/6, independently of stakes, crowd reports and prior results.
- Normal timing: 10 seconds to choose, 5 seconds of storm, 3 seconds of result, 2 seconds of cooldown.
- Safe stakes return and share 88% of the struck harbor's bank, proportional to surviving stake size.
- Storm Power scales the bank share, **not the returned stake**. The existing liability cap still applies. Even ×1.25 is now disclosed.
- Split bets, hidden final orders, signals, room tiers, jackpots, verification, and play limits remain available. Simple-mode orders explicitly use one harbor.
- All credits are virtual. No auto-bet, fabricated wins, streak promises, or copied Ice Fishing payout table is added.

## Two questions, both on screen

A LANDFALL round contains two independent questions, and until now the interface answered only one
of them. WHICH harbor is struck is a flat 1/6 that nothing can influence. HOW MUCH that is worth is
pari-mutuel: it depends entirely on where the room's money is sitting. The board showed the first
and hid the second, so an identical 5.00 bet returning +0.08 in one round and +12.40 in the next
looked arbitrary — the player could see the rule they cannot affect and not the one they can.

Both are now visible, each with the precision the server actually publishes:

- **While bets are open** exact pools stay hidden (anti-probing, `core/src/tide.ts`). Each harbor
  carries the banded crowd meter the server does publish — Empty/Low/Medium/High/Full — and the
  caption states the rule: a busier harbor hands out a bigger bank when the storm hits it.
- **From lock onward** the lock snapshot publishes exact pools, so every harbor shows precisely
  what it pays _you_ if the storm picks it: five positive numbers and, on your own harbor, your
  stake in red. Six concrete outcomes, one about to become real. Watching without a bet, the same
  cells show each harbor's bank instead, so a spectator learns the same rule.

`packages/web/src/payoutPreview.ts` mirrors `settleRound()` and is tested against it directly:
across every struck harbor the previewed net matches the settled net to within the one minor unit
that settlement's largest-remainder pass can add on top. The preview floors, so it is a lower bound
in both places it can move — that rounding, and Storm Power, whose ladder floor is x1 and whose
liability cap can never clamp below the x1 base. "A Share x bonus can only raise them" is therefore
literal, not a hedge. The room's rake now arrives in WELCOME as `rakeBp`, so an operator who tunes
rake per room cannot turn the preview into a lie.

## The landing, in beats

The result used to arrive whole: LANDFALL was received and the screen was already the answer.
Nothing was hidden and nothing was wrong, but the most interesting seconds of the round were spent
on a fait accompli. `revealStages.ts` orders the same data into four beats inside the existing 3s
RESOLVED phase — the storm lands (0ms), which harbor (420ms), what it did to you (900ms), and any
Share x bonus (1500ms). No beat withholds anything actionable: the round is settled and the balance
is already correct before the first beat draws. `prefers-reduced-motion` collapses the ladder to
the final beat, because a player asking for less motion is asking for the answer, not for suspense.

How loud the landing is comes from the server's own event-tier draw (its own HMAC domain,
independent of the harbor draw by construction), so a Tempest is a verifiable 1-in-20 event rather
than a flourish the client invented for a big win. The full-screen moment is deliberately rare and
never fires on a loss: a Share x above the x1 floor on a win actually collected, the Storm Surge
jackpot, or a Tempest survived at a profit. It rides above the board for two seconds with no
backdrop and no dismiss button, and is gone before the next betting window opens.

## The table

The payouts are literally made of other players' money, so a room you cannot see is a rule you
cannot feel. The right rail carries three tabs, one at a time, beside the board on desktop and
below it on phones where the game keeps the fold:

- **Live** every fleet that settled, round by round. Losses are in the feed beside the wins: a
  winners-only ticker is a highlight reel, and a highlight reel of a 1-in-6 game teaches the wrong
  base rate, so each round block carries the plain "N won - M lost" count. Demo practice fleets
  share the player name generator, so `results[].bot` now travels from the server (C5, the rule the
  lock snapshot already followed) and every practice row is labelled as one. Your own row is pinned
  first and never trimmed.
- **Chat** the table's conversation, on the existing server-side rate limits.
- **Rounds** where the storm has landed lately, as six bars of counts rather than a list a player
  can read a streak into, plus one click to verify any round.

Nothing in the rail ever overlays the harbors or the dock.

## Choosing the table

The stake tier is the most consequential setting in the game — it decides what a round costs and
whose money a payout is made of — and nobody was choosing it. The server seats an unrouted player
in the busiest table they can afford, which is the right rule for LIQUIDITY (five tiers split
between a handful of players is five dead tables) and the wrong one for a person opening the game,
because an opening balance of 50,000 covers the 5,000-minimum table. A returning player landed back
in whatever room they last used, sticky in the same silent way. The dashboard then closed the entry
gate on their behalf: the first-use guide dismissed straight into the current room, and a profile
that had already seen the guide was dismissed without any dialog at all.

The gate now has two steps. How-to-play runs on a first visit only; the table choice runs every
visit, before the first bet. Each row carries the stake range, the real human population (bots are
never counted) and what the balance actually covers, so the answer is informed rather than a guess.
The table the player is already at is preselected, so a refresh costs one confirming tap, and the
dialog has no close button — a question that has to be answered should not offer a control that
does nothing.

`tableChoice.ts` never ranks tables by what they earn. The suggestion is always the cheapest
affordable table, marked "Best to start"; a table the balance cannot cover is shown with the reason
rather than hidden, so the ladder is legible without being an invitation to climb it.

The chosen table is also named in the top bar with its range, and that label is the control that
changes it. Previously the room appeared only as 10px grey text in the session rail and a list
buried in the menu, so a player could not tell which table they were on, that others existed, or
why nobody beside them was betting a hundred times their stake.

## Getting a bet placed in ten seconds

The betting window is ten seconds long and the stepper moves by the table minimum, so crossing a
tier took forty presses and the amount in practice never changed. Half / double / max cover almost
every real adjustment in one tap and still land in a field the player can read and correct before
confirming. When a previous bet exists, the dock offers it by name ("Repeat Harbor 3 - 5.00"),
which fills the draft and still requires the same explicit confirmation — a shortcut, never
auto-bet.

## Reveal and player understanding

The normal result says whether **your** harbor survived and leads with the server-confirmed net change. The receipt separates stake returned, bank share, jackpot when applicable, and total returned. A short delayed emphasis reveals the actual share multiplier; it never invents a second random draw. The latest personal receipt remains available while later spectator rounds run. Missing reconnect receipts are identified rather than reconstructed from a prior bet.

The first-use example does not send a game order or debit a wallet. The player can select a harbor and inspect both a safe outcome and a lost stake. Example numbers are explicitly labeled; live bank shares vary. Help, sound, limits, tables, history, and full rules have direct menu entries.

References used for interaction structure: [Evolution Ice Fishing](https://games.evolution.com/live-casino/game-shows/ice-fishing/), [Lightning Roulette](https://games.evolution.com/live-casino/live-roulette/lightning-roulette/), and [Evolution game shows](https://games.evolution.com/live-casino/game-shows/). These inform staged outcomes, an obvious selection surface, and optional details; their mathematics and assets are not used.

## Visual specification

The selected direction is [the dashboard concept](concepts/clear-game-loop/dashboard.png), generated with the built-in ImageGen tool. Its brief: complete dark neo-minimalist LANDFALL dashboard; near-black and charcoal surfaces, thin borders, red storm accent, green confirmation, white selection; central numeric timer and six harbor controls; a compact session rail and a tabbed table rail (live results, chat, round statistics); stable amount/confirmation band; persistent personal receipt. No pictures, glass, glow, texture, or 3D assets. All shipped visuals are HTML/CSS/SVG.

Tokens: background #0E0E0E, chrome #121212, controls #171717/#1A1A1A, borders #292929, red #FF2F45, green #17E07D, white #F4F4F4. Typography uses the existing Manrope Variable font and tabular figures. Standard control transitions take 150 ms; reveal emphasis takes 250 ms. Reduced-motion preferences disable animation.

Intentional implementation differences from the concept: actual server data replaces mock values; the trajectory appears only during the storm; the grid has no decorative vertical axis; additional help, accepted-bet, limit, and receipt text explains live behavior. The session rail yields to the game on narrow screens and the table rail moves beneath it rather than disappearing; six controls form a 3×2 group below the timer on phones. The rejected landscape concept is not used.

## Reliability

Normal last-socket disconnect now requests graceful parking. Current accepted bets finish on their existing schedule before the loop stops. Returning during this interval resumes the existing round. A rejected cancellation blocks a room switch, so the player retains the result stream. WELCOME restores the consumed final-order flag. Table entry clamps a draft against both the new tier and the published liquidity cap.

The edge package now invokes Wrangler with the repository root as its working directory. Previously its custom build re-entered the edge package's own build script recursively. Workspace builds now complete the client bundle and Worker dry run without deploying.

A separate, pre-existing limitation remains: deployment, process termination, or Durable Object eviction does not reconstruct unfinished in-memory rounds. This change addresses normal disconnect/idle parking; it does not implement durable crash recovery. Seed-chain rotation and historical room-specific surge-probability verification remain separate backend work. No fixed RTP is newly asserted; the unsupported “≈98%” footer was removed.

## Checks

Regression suites cover explicit confirmation, duplicate/pending clicks, amount bounds, table entry, exact phase deadlines, final-order restoration, same-round receipts, split rounding, bonus/cap/jackpot accounting, unknown receipts, graceful idle settlement, resumed rounds, and refused room switches. Local browser checks cover the example, real demo confirmation and settlement, persistent receipt, verification, menus, and desktop/mobile layout.

Validation: 297 tests pass (70 core, 49 server, 178 web), workspace typecheck and lint pass, and the complete production build including the Worker dry run passes. The payout-preview suite cross-checks the preview against `settleRound()` itself on every struck harbor rather than against a restatement of its formula. Browser testing at 1440×900 and 390×844 covered the crowd meter, the locked payout preview, all four reveal beats on both a played and a spectated round, a chat message round-tripping through the server, the practice labels in the live feed, the round-statistics tab, and both entry paths through the
table gate — first visit (guide then table) and returning visit (table only) — including a real
table switch that reclamped the stake to the new tier's minimum. The mobile layout has no horizontal overflow and keeps the board and dock above the fold with the table rail beneath them. Every colour pair added here meets WCAG AA on the surface it sits on.
