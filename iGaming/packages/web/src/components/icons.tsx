/**
 * In-repo geometric icon set (docs/07-ux/ux-redesign-v2.md §7.4).
 * 24-grid, 2px rounded stroke, no emoji anywhere in the product.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...rest }: P) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...rest,
  };
}

export const AnchorIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="2.4" />
    <path d="M12 7.4V21M12 21c-4.4 0-8-3.2-8-7h2.6M12 21c4.4 0 8-3.2 8-7h-2.6M8.5 10.5h7" />
  </svg>
);

export const BoatIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 16.5h16l-2.2 4H6.2Z" fill="currentColor" stroke="none" />
    <path d="M12 3v12.5M12 4l6.5 9.5H12" fill="none" />
  </svg>
);

export const SplitBoatsIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 15.5h11l-1.6 3H4.1Z" fill="currentColor" stroke="none" />
    <path d="M8 6.5v9M8 7.2l4 7.3H8" />
    <path d="M15.5 18.5h6l-1 2h-4Z" fill="currentColor" stroke="none" />
    <path d="M18.5 12.5v6M18.5 13l2.6 4.5h-2.6" strokeWidth={1.6} />
  </svg>
);

export const StormIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6.5 13a4.5 4.5 0 1 1 .8-8.9A5 5 0 0 1 17 5.6 3.8 3.8 0 0 1 17.8 13Z" />
    <path d="M12.5 13.5 9.5 18h3l-2.4 4.5" />
  </svg>
);

export const FogIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 9h13M6 13h14.5M3.5 17h11" />
  </svg>
);

export const LockIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="5.5" y="11" width="13" height="9" rx="2" />
    <path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
  </svg>
);

export const CrateIcon = (p: P) => (
  <svg {...base(p)}>
    <rect x="4.5" y="6.5" width="15" height="13" rx="1.5" />
    <path d="M4.5 11h15M12 6.5V20" />
  </svg>
);

export const LighthouseIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9.5 21 10.5 8h3L14.5 21Z" />
    <path d="M9.8 8h4.4l-.6-3h-3.2ZM4 6.5 8.5 8M20 6.5 15.5 8M6 21h12" />
  </svg>
);

export const ShieldCheckIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9.5 4-1.8 7-5.2 7-9.5V6Z" />
    <path d="m9 12 2.2 2.2L15.4 10" />
  </svg>
);

export const TimerIcon = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="13" r="8" />
    <path d="M12 9.5V13l2.5 2M9.5 2.5h5" />
  </svg>
);

export const SoundOnIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5Z" />
    <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" />
  </svg>
);

export const SoundOffIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5v5h3.5L12 19V5L7.5 9.5Z" />
    <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
  </svg>
);

/** Signal flags — pictographic, color + shape encode the kind. */
export const RallyFlagIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 21V3.5" />
    <path d="M6 4.5h11l-3 3.5 3 3.5H6" fill="currentColor" stroke="none" />
  </svg>
);

export const FleeFlagIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 21V3.5" />
    <path d="M6 4.5h11.5L14 8l3.5 3.5H6Z" />
    <path d="m10 6.2 1.6 3.3" strokeWidth={1.6} />
  </svg>
);

export const HoldFlagIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 21V3.5" />
    <rect x="6" y="4.5" width="11" height="7" rx="1" fill="currentColor" stroke="none" />
  </svg>
);

export const SlidersIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h9M19.5 7h.5M4 17h3M13.5 17h6.5" />
    <circle cx="16" cy="7" r="2.4" />
    <circle cx="10" cy="17" r="2.4" />
  </svg>
);

export const ChatIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 5.5h16v11H9L4 20.5Z" />
  </svg>
);

export const XIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);

export const QuestionIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 9a3 3 0 1 1 4.6 2.5c-1 .7-1.6 1.3-1.6 2.5" />
    <circle cx="12" cy="18" r="0.6" fill="currentColor" stroke="none" />
  </svg>
);

/** Telemetry: an axis with a plotted line — the rail's own mark. */
export const ChartIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 4v16h16" />
    <path d="m7.5 14.5 3.5-4 3 2.5 4.5-6" />
  </svg>
);

export const SurgeIcon = (p: P) => (
  <svg {...base(p)}>
    <path d="M13 2.5 5.5 13.5H11L9.5 21.5 18 10h-5.5Z" fill="currentColor" stroke="none" />
  </svg>
);
