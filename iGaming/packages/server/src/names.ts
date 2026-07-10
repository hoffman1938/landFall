const ADJECTIVES = [
  'Salty', 'Foggy', 'Brave', 'Rusty', 'Windy', 'Lucky', 'Stormy', 'Quiet',
  'Bold', 'Drifty', 'Misty', 'Sunny', 'Keen', 'Steady', 'Wily', 'Merry',
];
const NOUNS = [
  'Jib', 'Keel', 'Gull', 'Buoy', 'Mast', 'Helm', 'Reef', 'Tide',
  'Anchor', 'Skiff', 'Compass', 'Lantern', 'Sextant', 'Rudder', 'Bosun', 'Dory',
];

/** Reserved words players may not impersonate (security-review.md §1.13). */
const RESERVED = /system|admin|official|harbormaster|landfall|house/i;

export function randomName(rand: () => number = Math.random): string {
  // Math.random is fine here: names are cosmetic, never outcome-adjacent.
  const a = ADJECTIVES[Math.floor(rand() * ADJECTIVES.length)]!;
  const n = NOUNS[Math.floor(rand() * NOUNS.length)]!;
  return `${a}${n}`;
}

export function isReservedName(name: string): boolean {
  return RESERVED.test(name);
}
