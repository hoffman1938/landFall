# Audio Design — LANDFALL (8-bit / lo-fi edition)

**Prepared by:** Audio Team, with review by Lead Game Designer (psychology) and Legal &
Compliance (licensing)
**Status:** Implemented in [engine.ts](../../packages/web/src/audio/engine.ts).
**Revision note:** v2 direction by product request — full 8-bit chiptune vocabulary
(square/triangle/noise voices) under a lo-fi master chain: waveshaper bit-crush (48 levels),
warm 3.8 kHz lowpass ("old speaker"), and a quiet vinyl-crackle bed. The soundtrack is a swung
~84 BPM chiptune loop in D minor (Dm–Bb–F–C): triangle bass, sparse pentatonic square lead
through a tape-style feedback echo, sine-drop kick, noise hats/snare, ±4-cent humanized
detune. Wins are "coin" chirps (the canonical 8-bit reward); the Golden Anchor is a full
victory fanfare with coin rain; Storm Power reveals get a rising power-up arpeggio sized by
the category, and the thunderclap itself scales with the storm. Every UI press answers in
theme (`click('up'|'down'|'tap'|'nav'|'send')`). All psychology rules below carry over
unchanged.

---

## 1. Licensing Position: Zero External Assets

Every sound and the ambient theme are **synthesized at runtime with the Web Audio API** from
code authored in this repository. There are no audio files, no downloads, and therefore **no
third-party licenses to track** — the strongest possible compliance answer to the project's
"royalty-free only, document every license" rule (this document *is* the complete license
register: everything is original work).

If richer produced audio is ever wanted, the sourcing rules remain: Pixabay / Freesound /
OpenGameArt, CC0-preferred, each file logged here with URL, author, and license. Until then,
procedural wins on: zero licensing risk, zero load time, works offline, and cues can be
parameterized by game state (e.g. wind duration exactly matches the storm phase).

## 2. The Cue Set (and the psychology behind each)

| Cue | Sound | When | Psychological intent |
|---|---|---|---|
| Foghorn (signature) | Two low blasts (68→62 Hz, lowpassed) | Anchor window opens | Brand identity + Pavlovian "round starting, come back" call. Low frequency = calm authority, not alarm. |
| Surge call | Foghorn + rising golden bell shimmer | Surge round announced | Marks rarity; the shimmer borrows the win-timbre to signal "the pot is reachable today" without promising anything. |
| Countdown ticks | 3 soft 1.1 kHz pips | Last 3s of anchor window | Urgency for the re-anchor scramble — quiet enough to raise attention, not stress (no accelerating alarm patterns). |
| Anchor splash | Tiny high-passed noise splash | Your anchor lands/moves | Immediate action feedback; confirms the server accepted you. |
| Rising wind | Band-passed noise sweeping 350→1500 Hz over the whole locked phase | Storm approach | The anticipation arc — Landfall's equivalent of Aviator's climbing pitch. Builds tension that the thunderclap releases. |
| Thunderclap | Noise burst with lowpass sweep + 46 Hz sub | Landfall | **Deliberately neutral**: it resolves the tension but is neither a win nor a loss sound — the same event is good news for five harbors and bad for one. |
| Salvage bell | Struck-bell partials on D5 (+A5 when the salvage is big) | Your payout arrives | Bright timbres are **reserved exclusively for wins** — the audio twin of the "beacon amber = payouts only" visual rule. Reserved = conditioned = instantly meaningful. |
| Golden Anchor fanfare | Ascending D5-F5-A5-D6 bells; closing chord only if *you* won | Surge pot pays | The rarest and biggest sound in the game — memorable-moment engineering. Spectators hear a shorter, quieter version: shared event, personal scale. |
| Wreck thud | Single short 95→50 Hz sine, quiet | Your stake is lost | **Short, low, undramatic, then silence.** No lingering sad sting (no rumination bait), and never a celebratory sound on a loss — "losses disguised as wins" is a documented dark pattern in slot design and is explicitly banned here. |

## 3. Ambient Theme

A sparse **D-minor-pentatonic music-box loop** (~93 BPM eighths with rests and occasional
octave lifts) over a barely-audible D2/A2 drone and slow wave-wash noise. Design intent:

- **Low arousal baseline.** The ambience is deliberately calm and repetitive so the tension
  cues (wind, ticks) stand out by contrast rather than by loudness — total loudness stays
  moderate, which is both better game-feel and more responsible design.
- **Nautical, melancholy-warm mood** — fits the "weather it together" fiction; minor
  pentatonic avoids both casino-cheese major fanfares and horror dissonance.
- Slight timing/pitch humanization prevents the loop from turning into an earworm irritant.

## 4. Player Control & Politeness

- Mute toggle + volume slider in the top bar, persisted in `localStorage`.
- Browser autoplay policy respected: the audio context starts only on the first user gesture;
  every cue is a no-op before that (no console errors, no blocked-autoplay warnings).
- Melody suppressed while muted; master gain ramps smoothly (no clicks).

## 5. Explicitly Avoided (responsible-design list)

- No sound on other players' ordinary losses (no schadenfreude conditioning).
- No accelerating heartbeat/alarm loops (anxiety-pattern).
- No win-sound on net-zero or losing outcomes ("losses disguised as wins").
- No unskippable jingles; every cue is ≤ ~2s except the player's own jackpot.
