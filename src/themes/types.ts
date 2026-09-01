/**
 * Polyester Theme Types
 *
 * Three composable modules:
 *   Style   — colors, fonts, borders, shadows, hero
 *   Spacing — density, gaps, margins, padding
 *   Syntax  — code block highlighting (the original ThemeColors)
 *
 * A Theme composes one of each by reference (string) or inline (object).
 */

// ─── Style Tokens ──────────────────────────────────────────────

export interface StyleColors {
  primary: string;
  "primary-light": string;
  "primary-dark": string;
  secondary: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  "text-muted": string;
  border: string;
  link: string;
  success: string;
  warning: string;
  error: string;
  /** Optional heading color for h1/h2 (defaults to `text`). */
  heading?: string;
  /** Optional color for h3 / card titles (defaults to `heading`, then `text`). */
  "heading-sub"?: string;
}

export interface StyleFonts {
  body: string;
  heading: string;
  mono: string;
}

export interface StyleBorders {
  radius: string;
  width: string;
}

export interface StyleShadows {
  card: string;
  elevated?: string;
}

export interface StyleHero {
  gradient: string;
  /** Optional non-gradient default background (solid color, image, or any CSS background). Used by `/hero --bg theme`. */
  background?: string;
  "text-color": string;
}

export interface StyleTokens {
  name?: string;
  colors: StyleColors;
  fonts: StyleFonts;
  borders: StyleBorders;
  shadows: StyleShadows;
  hero: StyleHero;
}

// ─── Spacing Tokens ────────────────────────────────────────────

export interface SpacingTokens {
  name?: string;
  base: string;
  "page-margin": string;
  "section-gap": string;
  "column-gap": string;
  "card-padding": string;
  "block-padding": string;
}

// ─── Defaults (match current hardcoded values) ─────────────────

export const DEFAULT_STYLE: StyleTokens = {
  colors: {
    primary: "#3b82f6",
    "primary-light": "#60a5fa",
    "primary-dark": "#2563eb",
    secondary: "#475569",
    accent: "#d97706",
    background: "#ffffff",
    surface: "#f9fafb",
    text: "#1a1a1a",
    "text-muted": "#666666",
    border: "#e5e5e5",
    link: "#3b82f6",
    success: "#16a34a",
    warning: "#d97706",
    error: "#dc2626",
  },
  fonts: {
    body: "system-ui, -apple-system, sans-serif",
    heading: "system-ui, -apple-system, sans-serif",
    mono: "ui-monospace, monospace",
  },
  borders: { radius: "0.5rem", width: "1px" },
  shadows: { card: "none", elevated: "0 4px 12px rgba(0,0,0,0.1)" },
  hero: {
    gradient: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "text-color": "#ffffff",
  },
};

export const DEFAULT_SPACING: SpacingTokens = {
  base: "1rem",
  "page-margin": "2cm",
  "section-gap": "2rem",
  "column-gap": "1.5rem",
  "card-padding": "1.5rem",
  "block-padding": "1rem",
};

// ─── Syntax (code highlighting) ────────────────────────────────

export interface ThemeColors {
  // Code block background and default text
  background: string;
  foreground: string;

  // Syntax highlighting colors
  keyword: string;      // function, const, return, if, etc.
  string: string;       // "strings", 'strings', `template`
  number: string;       // 123, 0xff, 3.14
  function: string;     // function names
  comment: string;      // // comments, /* comments */
  type: string;         // type names, classes
  variable: string;     // variable names
  operator: string;     // +, -, =, =>
  punctuation: string;  // {, }, (, ), [, ]
  property: string;     // object.property
  tag: string;          // HTML/XML tags
  attribute: string;    // HTML attributes
  selector: string;     // CSS selectors
  regexp: string;       // /regex/
  builtin: string;      // built-in functions/types
  meta: string;         // preprocessor, decorators

  // Diff colors (optional)
  addition?: string;
  deletion?: string;
  additionBg?: string;
  deletionBg?: string;
}

/**
 * Legacy theme (syntax-only) — kept for backward compat with existing theme files.
 */
export interface LegacyTheme {
  name: string;
  source?: string;
  colors: ThemeColors;
}

/**
 * Composed theme — references or inlines style, spacing, and syntax modules.
 * String values are resolved by name (built-in or filesystem).
 * Object values are used inline.
 * Missing keys fall back to defaults.
 */
export interface Theme {
  name: string;
  source?: string;
  style?: StyleTokens | string;
  spacing?: SpacingTokens | string;
  syntax?: ThemeColors | string;
  /** @deprecated Use `syntax` instead. Kept for backward compat. */
  colors?: ThemeColors;
}

/**
 * Terminal color palette (color0-color15)
 * Standard ANSI color mapping used by XResources, pywal, etc.
 */
export interface TerminalPalette {
  // Normal colors (0-7)
  black: string;      // color0
  red: string;        // color1
  green: string;      // color2
  yellow: string;     // color3
  blue: string;       // color4
  magenta: string;    // color5
  cyan: string;       // color6
  white: string;      // color7

  // Bright colors (8-15)
  brightBlack: string;   // color8
  brightRed: string;     // color9
  brightGreen: string;   // color10
  brightYellow: string;  // color11
  brightBlue: string;    // color12
  brightMagenta: string; // color13
  brightCyan: string;    // color14
  brightWhite: string;   // color15

  // Background and foreground
  background: string;
  foreground: string;
}

/**
 * Convert a terminal palette to syntax highlighting colors.
 * This is the default mapping - users can customize in the theme file.
 */
export function paletteToThemeColors(palette: TerminalPalette): ThemeColors {
  return {
    background: palette.background,
    foreground: palette.foreground,

    keyword: palette.red,
    string: palette.green,
    number: palette.cyan,
    function: palette.magenta,
    comment: palette.brightBlack,
    type: palette.yellow,
    variable: palette.brightYellow,
    operator: palette.foreground,
    punctuation: palette.foreground,
    property: palette.blue,
    tag: palette.red,
    attribute: palette.yellow,
    selector: palette.green,
    regexp: palette.cyan,
    builtin: palette.brightMagenta,
    meta: palette.brightBlack,

    addition: palette.green,
    deletion: palette.red,
  };
}

/**
 * Default syntax highlighting colors (GitHub Dark style)
 */
export const DEFAULT_SYNTAX: ThemeColors = {
    background: "#0d1117",
    foreground: "#c9d1d9",

    keyword: "#ff7b72",
    string: "#a5d6ff",
    number: "#79c0ff",
    function: "#d2a8ff",
    comment: "#8b949e",
    type: "#ffa657",
    variable: "#ffa657",
    operator: "#c9d1d9",
    punctuation: "#c9d1d9",
    property: "#79c0ff",
    tag: "#7ee787",
    attribute: "#79c0ff",
    selector: "#7ee787",
    regexp: "#a5d6ff",
    builtin: "#ffa657",
    meta: "#8b949e",

    addition: "#aff5b4",
    deletion: "#ffa198",
    additionBg: "#033a16",
    deletionBg: "#490202",
};

/**
 * Built-in default theme (legacy compat + default syntax)
 */
export const DEFAULT_THEME: Theme = {
  name: "default",
  colors: DEFAULT_SYNTAX,
  syntax: DEFAULT_SYNTAX,
};
