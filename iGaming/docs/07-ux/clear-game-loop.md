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

## The jackpot, every round

The Storm Surge pot is fed by a share of every round's rake and paid out whole to one surviving
player on a jackpot round — about one round in twenty-five. The dashboard mentioned it only ON that
round, so for the other twenty-four it grew invisibly and a player could sit at a table for ten
minutes without learning it existed. The advanced UI had always carried a permanent meter; the
simplified one dropped it.

It is back in the top bar, with that UI's rule intact: calm by default, filled only on the round it
can actually pay out. A meter that shouts every round is one players learn to stop reading, and
this one has something to say 4% of the time. The number is the real published pot from the round
header, counting up between rounds; tapping it opens the rules section that explains how the winner
is picked. The jackpot-round band no longer repeats the figure and says what the player has to do
about it instead.

`jackpotTicker.ts` holds the one rule worth stating: the number only animates when it is actually
growing at the table you are sitting at. A payout drops the pot back to the table's floor, and
counting down to that reads as losing something you never had; a table switch changes the figure
because it is a different table's pot entirely, and pots never merge. Both snap.

A third case cost a real bug. `requestAnimationFrame` is paused in a backgrounded tab, so the first
version froze part-way up a climb and stayed there — the pot kept arriving in every round header
while the display kept its half-finished number, drifting rounds behind the truth. Animation is now
skipped outright when no frames will run, and every path out of the effect — finished, interrupted
by the next round, or unmounted — ends by showing the real number. An animation may be skipped; it
is never allowed to leave a wrong figure on screen.

## Getting a bet placed in ten seconds

The betting window is ten seconds long and the stepper moves by the table minimum, so crossing a
tier took forty presses and the amount in practice never changed. Half / double / max cover almost
every real adjustment in one tap and still land in a field the player can read and correct before
confirming. When a previous bet exists, the dock offers it by name ("Repeat Harbor 3 - 5.00"),
which fills the draft and still requires the same explicit confirmation — a shortcut, never
auto-bet.

## Making the important text important

A hierarchy pass, prompted by a plain observation: the sentences that carry the most meaning were
the faintest things on the screen. The design brief's own scale puts important secondary values at
18-28px and labels at 11-13px; almost everything in the second tier was sitting at 10-12px.

The rule of the game — "if your harbor is hit your bet is lost; if it is safe your bet returns plus
a share of the bank" — was 10px grey at the bottom of the deck, and now reads at 13px with the two
outcomes coloured. **Cancel bet** was an 11px underlined word, the same weight as a footnote, for a
time-limited decision on money already staked; it is a bordered button with the amount on it.
The jackpot figure, the per-harbor payouts, the round's return, the session net, the feed and the
toast all moved up a step, and the toast's dismiss control became a real target.

Nothing here reaches for gradients, glass or glow. The screen was not short of decoration; it was
short of contrast between what matters and what does not.

## What the audit found

A scripted pass over the rendered page at 1440x900, 1280x720, 1024x768, 768x1024, 390x844 and
360x640, in the choosing, storm and result phases and with every dialog open, checking for document
overflow, text clipped by an `overflow: hidden` ancestor, overlapping siblings within a layer,
touch targets under 36px, missing accessible names, and WCAG AA contrast on every text node against
its computed background. What it caught:

- **1024x768 was broken** — the commonest laptop size there is. Below 1150px the table rail stacks
  under the board; below 800px tall the short-laptop rule frees every vertical minimum so the deck
  stays visible. Together the rail took 240px out of a column that had already given up its floors,
  and the board collapsed to a strip with the deck drawn across the harbors. The game now keeps a
  working height and the page scrolls.
- **The "practice" tag was being truncated away** in the live feed. The nickname was a bare text
  node in a flex row, so a long one pushed the tags out of an `ellipsis` box — cutting off exactly
  the word that keeps the feed honest. Only the nickname truncates now.
- **The phone top bar overlapped itself**, stacking table, jackpot and balance into one smear. It
  is two rows below 700px.
- **Two full-screen sheets could be open at once.** Rules, limits, history and Verify are not
  `<dialog>` elements and have no z-order between them, so opening one over another left a close
  button nobody could reach. Opening any one now closes the rest.
- **The live feed was a screen-reader firehose** — `aria-live="polite"` on seven settled rows every
  twenty seconds, talking over the player. It is a labelled log that can be read on purpose.
- Touch targets under 36px (the quick-stake chips at 28px, the receipt button at 30px on phones)
  and six sub-AA colour pairs, including a disabled stepper arrow at 3.03:1 that read as broken
  rather than as quiet.

A total loss also stopped itemising itself. "Stake returned 0.00 / Bank share 0.00 / Total returned
0.00" is a worse answer to "what happened to my bet" than a sentence saying it.

## Getting back out of the advanced view

The advanced shell's exit was a 13px hairline label sharing a crowded bar with the wordmark, the
jackpot, a room switcher and four icon buttons, and players reached for a page reload instead. It
is an accent-bordered button that says where it goes. Behind it was a real dead end: the advanced
sheet could set the mode back to `beginner`, which swapped that shell into its own beginner skin —
one with a way in to the sheet and no way out to anywhere. Reading the mode back out as the exit
makes "Back to the simple board" true, since the simple board is now the dashboard.

## Numbers that do not fit

Every layout above was verified at a table whose payouts are two or three digits. At Leviathan
Deep they are six, and three things broke at once — all of them the same bug, which is a box sized
for the number somebody happened to be testing with.

- **The readout figure ran outside its ring.** It had two sizes chosen by a character-count
  threshold, which works for "07" and for "+12.26" and fails at "−10000.00". The figure now carries
  its own length as `--gd-chars` and derives its size from it, with the old clamp as the ceiling,
  so short figures are as large as they ever were and an eleven-character one still fits. Checked
  from "02" up to "+1234567.89".
- **"Returned 11353.85" printed through the label beneath it.** A circle has room for a figure and
  one label; the third line moved under the ring.
- **The per-harbor figure crowded its cell**, and the unit word beside it was pushed through the
  state word. The same length-derived sizing now applies, in container-query units so each cell
  scales the figure to the width it actually got.

Fixing the cell exposed the real problem with it: "01" stacked above "Harbor 1" said the same
thing twice and cost 21px of a row that did not have it — the content ran 14px taller than the row
and `justify-content: center` split the difference over the card's top and bottom edges. They read
as one line now, with the state beside them and the figure alone underneath. A container query
drops the word on cells too narrow to hold it whole, because a truncated "Harb…" is worse than the
number that is already the harbor's name everywhere else. "WAITING" went entirely: it was on the
five harbors that are not yours, and it says nothing the figure has not already said.

Also from the same pass: the stake field forced the stepper's own +/− buttons off its edge on a
360px screen, the top bar needed its two-row treatment up to 860px rather than 700px (a 768px
tablet overflowed the table name, the range and the jackpot), and the session figures were being
pushed off the bottom of the left rail by a paragraph repeating a rule the deck now states in full.

## Where the round's other action lives

Cancel bet and Repeat last bet sat in the footnote row under the deck, reading as small print about
the rules. Both are decisions taken in the same ten seconds as the confirm, so they are beside it
now, in the same band and at the same height, with the amount on them. The footnote row keeps only
the sentence it should always have been.

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

Validation: 306 tests pass (70 core, 49 server, 187 web), workspace typecheck and lint pass, and the complete production build including the Worker dry run passes. The payout-preview suite cross-checks the preview against `settleRound()` itself on every struck harbor rather than against a restatement of its formula. Browser testing at 1440×900 and 390×844 covered the crowd meter, the locked payout preview, all four reveal beats on both a played and a spectated round, a chat message round-tripping through the server, the practice labels in the live feed, the round-statistics tab, and both entry paths through the
table gate — first visit (guide then table) and returning visit (table only) — including a real
table switch that reclamped the stake to the new tier's minimum. The jackpot meter was checked
against the server's own `landfall_surge_pot_minor` gauge across several rounds, in both its calm
and its live presentation. The mobile layout has no horizontal overflow and keeps the board and dock above the fold with the table rail beneath them. Every colour pair added here meets WCAG AA on the surface it sits on.
