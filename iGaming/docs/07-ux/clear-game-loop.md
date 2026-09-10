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

## Reveal and player understanding

The normal result says whether **your** harbor survived and leads with the server-confirmed net change. The receipt separates stake returned, bank share, jackpot when applicable, and total returned. A short delayed emphasis reveals the actual share multiplier; it never invents a second random draw. The latest personal receipt remains available while later spectator rounds run. Missing reconnect receipts are identified rather than reconstructed from a prior bet.

The first-use example does not send a game order or debit a wallet. The player can select a harbor and inspect both a safe outcome and a lost stake. Example numbers are explicitly labeled; live bank shares vary. Help, sound, limits, tables, history, and full rules have direct menu entries.

References used for interaction structure: [Evolution Ice Fishing](https://games.evolution.com/live-casino/game-shows/ice-fishing/), [Lightning Roulette](https://games.evolution.com/live-casino/live-roulette/lightning-roulette/), and [Evolution game shows](https://games.evolution.com/live-casino/game-shows/). These inform staged outcomes, an obvious selection surface, and optional details; their mathematics and assets are not used.

## Visual specification

The selected direction is [the dashboard concept](concepts/clear-game-loop/dashboard.png), generated with the built-in ImageGen tool. Its brief: complete dark neo-minimalist LANDFALL dashboard; near-black and charcoal surfaces, thin borders, red storm accent, green confirmation, white selection; central numeric timer and six harbor controls; compact session and history rails; stable amount/confirmation band; persistent personal receipt. No pictures, glass, glow, texture, or 3D assets. All shipped visuals are HTML/CSS/SVG.

Tokens: background #0E0E0E, chrome #121212, controls #171717/#1A1A1A, borders #292929, red #FF2F45, green #17E07D, white #F4F4F4. Typography uses the existing Manrope Variable font and tabular figures. Standard control transitions take 150 ms; reveal emphasis takes 250 ms. Reduced-motion preferences disable animation.

Intentional implementation differences from the concept: actual server data replaces mock values; the trajectory appears only during the storm; the grid has no decorative vertical axis; additional help, accepted-bet, limit, and receipt text explains live behavior. Side rails yield to the game on narrow screens; six controls form a 3×2 group below the timer on phones. The rejected landscape concept is not used.

## Reliability

Normal last-socket disconnect now requests graceful parking. Current accepted bets finish on their existing schedule before the loop stops. Returning during this interval resumes the existing round. A rejected cancellation blocks a room switch, so the player retains the result stream. WELCOME restores the consumed final-order flag. Table entry clamps a draft against both the new tier and the published liquidity cap.

The edge package now invokes Wrangler with the repository root as its working directory. Previously its custom build re-entered the edge package's own build script recursively. Workspace builds now complete the client bundle and Worker dry run without deploying.

A separate, pre-existing limitation remains: deployment, process termination, or Durable Object eviction does not reconstruct unfinished in-memory rounds. This change addresses normal disconnect/idle parking; it does not implement durable crash recovery. Seed-chain rotation and historical room-specific surge-probability verification remain separate backend work. No fixed RTP is newly asserted; the unsupported “≈98%” footer was removed.

## Checks

Regression suites cover explicit confirmation, duplicate/pending clicks, amount bounds, table entry, exact phase deadlines, final-order restoration, same-round receipts, split rounding, bonus/cap/jackpot accounting, unknown receipts, graceful idle settlement, resumed rounds, and refused room switches. Local browser checks cover the example, real demo confirmation and settlement, persistent receipt, verification, menus, and desktop/mobile layout.

Validation: 268 tests pass (70 core, 49 server, 149 web), workspace typecheck and lint pass, and the complete production build including the Worker dry run passes. Browser testing used the Codex in-app browser at 1440×960, 1280×720, and 390×844. The mobile layout has no horizontal overflow; the short desktop keeps the board and controls visible while side rails scroll.
