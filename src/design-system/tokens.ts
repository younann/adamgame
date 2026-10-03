/**
 * Design tokens extracted from the approved mockups (see docs/DESIGN_TOKENS.md).
 * Numeric colors are for PixiJS; the same values are mirrored in globals.css @theme for DOM.
 */
export const color = {
  surfaceLowest: 0x080e1d,
  surface: 0x0d1322,
  surfaceLow: 0x151b2b,
  surfaceContainer: 0x191f2f,
  surfaceHigh: 0x242a3a,
  surfaceHighest: 0x2f3445,

  primary: 0xb3c5ff,
  primaryFixed: 0xdbe1ff,
  blue: 0x1e6bff,
  blueBright: 0x2979ff,
  blueDeep: 0x003fa5,
  blueShadow: 0x002b75,
  blueDeepest: 0x001849,

  gold: 0xfeb700,
  goldLight: 0xffdea8,
  goldMid: 0xffba20,
  goldPale: 0xffdb9d,
  goldShadow: 0x6b4b00,
  amber: 0xf59e0b,

  mint: 0x4edea3,
  mintLight: 0x6ffbbe,
  mintDeep: 0x00875d,
  mintShadow: 0x003824,

  red: 0xff5a5a,
  redSoft: 0xffb4ab,
  redDeep: 0x93000a,

  white: 0xffffff,
  ink: 0x0a0f1c,
  onSurface: 0xdde2f8,
  onSurfaceVariant: 0xc2c6d8,
  outlineVariant: 0x424655,
} as const;

export const css = {
  surfaceLowest: '#080e1d',
  surface: '#0d1322',
  blue: '#1e6bff',
  gold: '#feb700',
  mint: '#4edea3',
} as const;

/** Font family names are resolved at runtime from the next/font CSS variables. */
export const font = {
  display: 'Rubik, "Arial Rounded MT Bold", system-ui, sans-serif',
  body: '"Nunito Sans", system-ui, sans-serif',
};

export function setFontFamilies(display: string, body: string) {
  if (display) font.display = `${display}, "Arial Rounded MT Bold", system-ui, sans-serif`;
  if (body) font.body = `${body}, system-ui, sans-serif`;
}

export const motion = {
  /** Overshoot bounce used for tactile button release. */
  bounce: 'cubic-bezier(0.34,1.56,0.64,1)',
  wiggleMs: 210,
  burstMs: 850,
} as const;

/** Learning-colour palette (concepts), tuned to read well on the dark game surfaces. */
export const conceptColor: Record<string, number> = {
  red: 0xff4b4b,
  blue: 0x2f7bff,
  yellow: 0xffd21f,
  green: 0x2fd27a,
  orange: 0xff8a1f,
  purple: 0xa45bff,
  pink: 0xff6fb5,
  black: 0x2a2a35,
  white: 0xf4f6ff,
  brown: 0x9a5b2e,
};
