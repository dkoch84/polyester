/**
 * Kitty Terminal Importer
 *
 * Parses kitty.conf files to extract color0-color15 and background/foreground.
 *
 * Kitty format:
 *   foreground #dddddd
 *   background #000000
 *   color0 #000000
 *   color1 #cc0403
 *   ...
 *   color15 #feffff
 *
 * Also supports:
 *   # comments
 *   include other.conf
 */

import { readFileSync } from "node:fs";
import { TerminalPalette, Theme, paletteToThemeColors } from "../types.js";

/**
 * Parse a kitty.conf file and extract the color palette
 */
export function parseKitty(content: string): TerminalPalette {
  const colors: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Skip include directives
    if (trimmed.startsWith("include ")) continue;

    // Match: colorN #hex or foreground #hex or background #hex
    const match = trimmed.match(/^(color\d+|foreground|background)\s+(.+)$/);
    if (match) {
      const key = match[1];
      const value = match[2].trim();
      colors[key] = value;
    }
  }

  return {
    black: colors.color0 || "#000000",
    red: colors.color1 || "#cc241d",
    green: colors.color2 || "#98971a",
    yellow: colors.color3 || "#d79921",
    blue: colors.color4 || "#458588",
    magenta: colors.color5 || "#b16286",
    cyan: colors.color6 || "#689d6a",
    white: colors.color7 || "#a89984",

    brightBlack: colors.color8 || "#928374",
    brightRed: colors.color9 || "#fb4934",
    brightGreen: colors.color10 || "#b8bb26",
    brightYellow: colors.color11 || "#fabd2f",
    brightBlue: colors.color12 || "#83a598",
    brightMagenta: colors.color13 || "#d3869b",
    brightCyan: colors.color14 || "#8ec07c",
    brightWhite: colors.color15 || "#ebdbb2",

    background: colors.background || "#282828",
    foreground: colors.foreground || "#ebdbb2",
  };
}

/**
 * Import a theme from a kitty.conf file
 */
export function importKitty(filePath: string, themeName: string): Theme {
  const content = readFileSync(filePath, "utf-8");
  const palette = parseKitty(content);
  const colors = paletteToThemeColors(palette);

  return {
    name: themeName,
    source: filePath,
    colors,
  };
}
