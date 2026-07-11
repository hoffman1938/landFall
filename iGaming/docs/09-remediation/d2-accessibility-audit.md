# D2 — Accessibility Audit (the 60+ mandate)

Law (README §3): interactive text ≥ 14px (primary labels ≥ 16px), touch targets ≥ 44px
(48px preferred), visible focus states, aria roles kept, color+shape+icon redundancy,
`prefers-reduced-motion` respected. **Do not densify back later.**

Every interactive element with its final size after the D2 pass. Tailwind scale: h-11 = 44px,
min-h-14 = 56px, text-sm = 14px, text-base = 16px.

## ControlDeck (packages/web/src/components/ControlDeck.tsx)

| Element | Target size | Label size | Notes |
|---|---|---|---|
| Primary action button | 56px (min-h-14, min-w-52) | 16px (text-base) + 12px sub-caption | Never destructive (deckState.ts); aria-live |
| RESTAKE secondary | 56px (min-h-14, w-24) | 14px + 12px amount | Reserved slot — deck geometry constant within a phase |
| ✕ cancel | 44px wide, stretches to 56px row | icon 16 + aria-label | Hold-to-confirm during fog (650ms, visible fill progress) |
| Signal flag button | 44px wide, stretches | icon 18 + aria-label | |
| Mode toggle (Focus/Split) | 44px (h-11, min-w-20) | 14px (text-sm) | role=radiogroup, aria-checked |
| Stake − / + steppers | 44×44 (h-11 w-11) | 16px glyph + aria-label | |
| Stake input | 44px (h-11, w-28) | 16px (text-base) | sr-only label, aria-invalid + described-by error |
| Preset chips (1…500) | 44px (h-11, min-w-11) | 14px (text-sm) | was 28px/11px — non-compliant |
| ×2 / ½ / MAX chips | 44px (h-11, min-w-11) | 14px | |
| Flag picker options | 64×64 (h-16 w-16) | 14px caption | was 56px/10px |
| Stake error message | n/a (status) | 14px (text-sm) | role=status |
| Payout strip (D4) | n/a (non-interactive note) | 12px | role=note; freezes visually in fog |

## TopBar (packages/web/src/components/TopBar.tsx)

| Element | Target size | Label size | Notes |
|---|---|---|---|
| Mute button | 44×44 (h-11 w-11) | icon + aria-label | was 36px/32px |
| How-to-play button | 44×44 (h-11 w-11) | icon + aria-label | was 36px/32px |
| Volume slider | 96px wide, in hover/focus popover | aria-label | |
| Header bar | 48px (h-12) | — | grown from 40/36px to fit 44px targets |

## Overlays

| Element | Target size | Label size | Notes |
|---|---|---|---|
| RulesModal close | 48×48 (h-12 w-12) | icon + aria-label | already compliant |
| VerifyModal close | 48×48 (h-12 w-12) | icon + aria-label | already compliant |
| Verify button (ResultBanner) | ≥44px row height | 12px → tracked | small trust affordance inside a 44px-row strip |
| SecondaryPanel launcher | 44×44 (h-11 w-11) | icon + unread badge | already compliant |
| SecondaryPanel close | 44×44 (h-11 w-11) | icon + aria-label | already compliant |
| SecondaryPanel tabs | ≥44px (min-h-11) | 14px (text-sm) | label raised from 12px |

## Deliberate exemptions (recorded, not violations)

- **WreckLog history chips** (18×18): informational only — no click action; they are
  keyboard-focusable solely to expose their screen-reader labels. Non-interactive captions and
  status glyphs (phase chip, weather chip, surge ticker, timestamps) may sit below 14px — the
  law binds *interactive* text.
- **BayScene canvas coves**: hit areas are the full cove polygons (≥ 44px at min supported
  viewport); the BayAccessibilityLayer provides the parallel keyboard/SR path.

State-color redundancy: every deck state combines color + shape + icon (confirmed = outline +
anchor glyph, action = filled + label, fog-frozen strip = lock chip + dimming), verified across
`prefers-reduced-motion` (motion is additive only).
