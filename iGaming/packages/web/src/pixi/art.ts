/**
 * Original harbor scene art — six themed vector nightscapes generated as SVG
 * and rasterized to Pixi textures. Hand-authored in-repo (no external assets,
 * no licensing constraints — per the project's free-assets-only rule, this IS
 * the safest possible asset: our own).
 *
 * Each scene: gradient sky → stars/moon/clouds → landmark silhouette → water.
 * viewBox is 480×320; cells cover-fit and crop via mask.
 */

export interface HarborTheme {
  skyTop: string;
  skyMid: string;
  horizon: string;
  water: string;
  accent: number; // pixi hex for pool bar / chips
  accentCss: string;
}

export const HARBOR_THEMES: HarborTheme[] = [
  // 1 North Quay — cold teal night, lighthouse with beam
  { skyTop: '#071726', skyMid: '#0d2c44', horizon: '#14506b', water: '#0a2438', accent: 0x4fc3f7, accentCss: '#4fc3f7' },
  // 2 Gullrock — violet dusk, sea arch and gulls
  { skyTop: '#160f2b', skyMid: '#2c1a4d', horizon: '#5c3a6e', water: '#1a1338', accent: 0xb388ff, accentCss: '#b388ff' },
  // 3 Saltmere — deep blue, big moon over salt flats
  { skyTop: '#050e20', skyMid: '#0c2140', horizon: '#1f4b70', water: '#0a1c34', accent: 0x64b5f6, accentCss: '#64b5f6' },
  // 4 Ketterly — green-teal, harbor cranes and pier
  { skyTop: '#06231d', skyMid: '#0a3a30', horizon: '#14654e', water: '#07281f', accent: 0x4db6ac, accentCss: '#4db6ac' },
  // 5 Fogwatch — grey-blue fog, watchtower
  { skyTop: '#151c26', skyMid: '#26313f', horizon: '#48586b', water: '#1a222e', accent: 0x90a4ae, accentCss: '#90a4ae' },
  // 6 Brinehollow — indigo cove, cave mouth and lanterns
  { skyTop: '#120b2e', skyMid: '#221457', horizon: '#3f2b78', water: '#160f3a', accent: 0x9575cd, accentCss: '#9575cd' },
];

function stars(seed: number, n: number): string {
  // deterministic pseudo-random star field per scene
  let s = seed * 2654435761;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0), s / 2 ** 32);
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = 10 + rnd() * 460;
    const y = 8 + rnd() * 130;
    const r = 0.5 + rnd() * 1.1;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#dfe9ff" opacity="${(0.25 + rnd() * 0.6).toFixed(2)}"/>`;
  }
  return out;
}

const LANDMARKS: ((t: HarborTheme) => string)[] = [
  // 1 — lighthouse on a headland, sweeping beam
  (t) => `
    <path d="M0,238 L90,214 L150,228 L210,240 L480,252 L480,320 L0,320 Z" fill="#04101c"/>
    <polygon points="118,148 132,148 138,218 112,218" fill="#061622"/>
    <polygon points="115,148 135,148 133,138 117,138" fill="#0b2a3d"/>
    <rect x="119" y="128" width="12" height="10" fill="#ffd54f" opacity="0.95"/>
    <polygon points="125,133 480,86 480,150" fill="#ffd54f" opacity="0.13"/>
    <polygon points="125,133 300,180 340,220 125,140" fill="#ffd54f" opacity="0.08"/>
    <circle cx="125" cy="133" r="7" fill="#fff3c0" opacity="0.9"/>`,
  // 2 — sea arch rock with gulls
  (t) => `
    <path d="M300,246 C296,190 320,160 356,152 C398,143 428,178 432,222 L436,248 L400,246 C400,214 388,192 364,192 C342,192 330,212 332,246 Z" fill="#0d0820"/>
    <path d="M0,252 L120,240 L260,250 L480,244 L480,320 L0,320 Z" fill="#0d0820"/>
    <path d="M170,120 q8,-8 16,0 q-8,-3 -16,0" fill="none" stroke="#cfd8ff" stroke-width="2" opacity="0.8"/>
    <path d="M205,138 q7,-7 14,0 q-7,-3 -14,0" fill="none" stroke="#cfd8ff" stroke-width="2" opacity="0.65"/>
    <path d="M140,150 q6,-6 12,0 q-6,-2 -12,0" fill="none" stroke="#cfd8ff" stroke-width="1.6" opacity="0.5"/>`,
  // 3 — huge moon, low salt flats, beached skiff
  (t) => `
    <circle cx="352" cy="96" r="44" fill="#eef3ff" opacity="0.95"/>
    <circle cx="338" cy="88" r="9" fill="#c9d4ea" opacity="0.5"/>
    <circle cx="366" cy="110" r="6" fill="#c9d4ea" opacity="0.45"/>
    <circle cx="352" cy="96" r="58" fill="#eef3ff" opacity="0.12"/>
    <path d="M0,246 L480,240 L480,320 L0,320 Z" fill="#050f1e"/>
    <path d="M96,238 q22,-16 44,0 l-6,8 l-32,0 Z" fill="#0b1c30"/>
    <rect x="114" y="214" width="3" height="20" fill="#0b1c30"/>`,
  // 4 — pier with cranes
  (t) => `
    <path d="M0,244 L480,250 L480,320 L0,320 Z" fill="#03150f"/>
    <path d="M60,250 L60,196 L64,196 L64,250 M60,204 L118,170 L122,176 L64,212" stroke="#041b13" stroke-width="7" fill="none"/>
    <path d="M118,170 L118,196" stroke="#041b13" stroke-width="3"/>
    <rect x="112" y="196" width="13" height="12" fill="#041b13"/>
    <path d="M320,250 L320,186 L326,186 L326,250 M320,196 L252,166 L250,172 L318,204" stroke="#041b13" stroke-width="8" fill="none"/>
    <rect x="150" y="246" width="220" height="7" fill="#041b13"/>
    <rect x="162" y="252" width="4" height="14" fill="#041b13"/><rect x="230" y="252" width="4" height="14" fill="#041b13"/><rect x="300" y="252" width="4" height="14" fill="#041b13"/>
    <circle cx="123" cy="212" r="3.5" fill="#ffd54f" opacity="0.9"/>`,
  // 5 — fog banks and a watchtower with a lit window
  (t) => `
    <rect x="0" y="150" width="480" height="34" fill="#8ea3b8" opacity="0.10"/>
    <rect x="0" y="186" width="480" height="26" fill="#8ea3b8" opacity="0.14"/>
    <rect x="0" y="212" width="480" height="22" fill="#8ea3b8" opacity="0.18"/>
    <path d="M0,248 L480,242 L480,320 L0,320 Z" fill="#0d1219"/>
    <polygon points="368,242 372,150 396,150 400,242" fill="#0a0f15"/>
    <polygon points="366,150 402,150 384,128" fill="#0a0f15"/>
    <rect x="379" y="166" width="10" height="13" fill="#ffd54f" opacity="0.85"/>
    <rect x="330" y="234" width="80" height="8" fill="#0a0f15"/>`,
  // 6 — cove cave mouth with hanging lanterns
  (t) => `
    <path d="M0,320 L0,150 C60,168 90,210 96,320 Z" fill="#0b0722"/>
    <path d="M480,320 L480,140 C400,158 356,214 348,320 Z" fill="#0b0722"/>
    <path d="M348,320 C356,238 300,232 262,258 C236,276 230,296 228,320 Z" fill="#070417" opacity="0.9"/>
    <circle cx="60" cy="196" r="4" fill="#ffb74d" opacity="0.95"/>
    <rect x="59" y="182" width="2" height="12" fill="#241a4a"/>
    <circle cx="60" cy="196" r="9" fill="#ffb74d" opacity="0.25"/>
    <circle cx="430" cy="186" r="4" fill="#ffb74d" opacity="0.95"/>
    <rect x="429" y="172" width="2" height="12" fill="#241a4a"/>
    <circle cx="430" cy="186" r="9" fill="#ffb74d" opacity="0.25"/>`,
];

export function harborSvg(zone: number): string {
  const t = HARBOR_THEMES[zone]!;
  const landmark = LANDMARKS[zone]!(t);
  const waveLines = [0, 1, 2, 3]
    .map((i) => {
      const y = 262 + i * 14;
      return `<path d="M0,${y} q30,-3 60,0 t60,0 t60,0 t60,0 t60,0 t60,0 t60,0 t60,0" fill="none" stroke="#bcd4ff" stroke-width="1" opacity="${0.16 - i * 0.03}"/>`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="320" viewBox="0 0 480 320">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.skyTop}"/>
      <stop offset="0.55" stop-color="${t.skyMid}"/>
      <stop offset="0.8" stop-color="${t.horizon}"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${t.horizon}"/>
      <stop offset="0.35" stop-color="${t.water}"/>
      <stop offset="1" stop-color="#030812"/>
    </linearGradient>
  </defs>
  <rect width="480" height="256" fill="url(#sky)"/>
  ${stars(zone + 7, 26)}
  <ellipse cx="${90 + zone * 55}" cy="60" rx="70" ry="14" fill="#ffffff" opacity="0.05"/>
  <ellipse cx="${200 + zone * 30}" cy="86" rx="90" ry="16" fill="#ffffff" opacity="0.04"/>
  ${landmark}
  <rect y="248" width="480" height="72" fill="url(#sea)"/>
  ${waveLines}
</svg>`;
}

export const ZONE_ACCENTS = HARBOR_THEMES.map((t) => t.accent);
export const ZONE_ACCENTS_CSS = HARBOR_THEMES.map((t) => t.accentCss);
