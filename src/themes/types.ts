/**
 * Polyester Theme Types
 *
 * Themes define colors for syntax highlighting in code blocks.
 * Colors map to highlight.js CSS classes.
 */

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

export interface Theme {
  name: string;
  source?: string;  // Where it was imported from
  colors: ThemeColors;
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
 * Built-in default theme (GitHub Dark style)
 */
export const DEFAULT_THEME: Theme = {
  name: "default",
  colors: {
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
  },
};
