/**
 * pywal Importer
 *
 * Parses pywal's colors.json from ~/.cache/wal/colors.json
 *
 * pywal format:
 * {
 *   "wallpaper": "/path/to/image.png",
 *   "alpha": "100",
 *   "special": {
 *     "background": "#1d2021",
 *     "foreground": "#d5c4a1",
 *     "cursor": "#d5c4a1"
 *   },
 *   "colors": {
 *     "color0": "#1d2021",
 *     "color1": "#cc241d",
 *     ...
 *     "color15": "#fbf1c7"
 *   }
 * }
 */

import { readFileSync } from "node:fs";
import { TerminalPalette, Theme, paletteToThemeColors } from "../types.js";

interface PywalColors {
  wallpaper?: string;
  alpha?: string;
  special: {
    background: string;
    foreground: string;
    cursor?: string;
  };
  colors: {
    color0: string;
    color1: string;
    color2: string;
    color3: string;
    color4: string;
    color5: string;
    color6: string;
    color7: string;
    color8: string;
    color9: string;
    color10: string;
    color11: string;
    color12: string;
    color13: string;
    color14: string;
    color15: string;
  };
}

/**
 * Parse pywal colors.json and extract the color palette
 */
export function parsePywal(content: string): TerminalPalette {
  const data = JSON.parse(content) as PywalColors;

  return {
    black: data.colors.color0,
    red: data.colors.color1,
    green: data.colors.color2,
    yellow: data.colors.color3,
    blue: data.colors.color4,
    magenta: data.colors.color5,
    cyan: data.colors.color6,
    white: data.colors.color7,

    brightBlack: data.colors.color8,
    brightRed: data.colors.color9,
    brightGreen: data.colors.color10,
    brightYellow: data.colors.color11,
    brightBlue: data.colors.color12,
    brightMagenta: data.colors.color13,
    brightCyan: data.colors.color14,
    brightWhite: data.colors.color15,

    background: data.special.background,
    foreground: data.special.foreground,
  };
}

/**
 * Import a theme from a pywal colors.json file
 */
export function importPywal(filePath: string, themeName: string): Theme {
  const content = readFileSync(filePath, "utf-8");
  const palette = parsePywal(content);
  const colors = paletteToThemeColors(palette);

  return {
    name: themeName,
    source: filePath,
    colors,
  };
}
