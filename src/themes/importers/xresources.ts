/**
 * XResources Importer
 *
 * Parses .Xresources files to extract color0-color15 and background/foreground.
 *
 * Supports formats:
 *   *color0: #282828
 *   *.color1: #cc241d
 *   URxvt.color2: #98971a
 *   ! comment lines
 */

import { readFileSync } from "node:fs";
import { TerminalPalette, Theme, paletteToThemeColors } from "../types.js";

/**
 * Parse an XResources file and extract the color palette
 */
export function parseXResources(content: string): TerminalPalette {
  const colors: Record<string, string> = {};

  for (const line of content.split("\n")) {
    // Skip comments and empty lines
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("!") || trimmed.startsWith("#")) {
      continue;
    }

    // Match patterns like: *color0: #282828 or *.foreground: #ebdbb2
    const match = trimmed.match(/^\*?\.?(\w+)?\.?(color\d+|background|foreground)\s*:\s*(.+)$/i);
    if (match) {
      const key = match[2].toLowerCase();
      const value = match[3].trim();
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
 * Import a theme from an XResources file
 */
export function importXResources(filePath: string, themeName: string): Theme {
  const content = readFileSync(filePath, "utf-8");
  const palette = parseXResources(content);
  const colors = paletteToThemeColors(palette);

  return {
    name: themeName,
    source: filePath,
    colors,
  };
}
