/**
 * Alacritty Terminal Importer
 *
 * Parses Alacritty config files (YAML or TOML format)
 *
 * YAML format (older versions):
 * colors:
 *   primary:
 *     background: '#1d2021'
 *     foreground: '#ebdbb2'
 *   normal:
 *     black: '#282828'
 *     red: '#cc241d'
 *     ...
 *   bright:
 *     black: '#928374'
 *     ...
 *
 * TOML format (v0.13+):
 * [colors.primary]
 * background = '#1d2021'
 * foreground = '#ebdbb2'
 *
 * [colors.normal]
 * black = '#282828'
 * ...
 */

import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { TerminalPalette, Theme, paletteToThemeColors } from "../types.js";

interface AlacrittyColors {
  background?: string;
  foreground?: string;
  black?: string;
  red?: string;
  green?: string;
  yellow?: string;
  blue?: string;
  magenta?: string;
  cyan?: string;
  white?: string;
}

/**
 * Parse TOML format Alacritty config
 */
function parseToml(content: string): { primary: AlacrittyColors; normal: AlacrittyColors; bright: AlacrittyColors } {
  const result = {
    primary: {} as AlacrittyColors,
    normal: {} as AlacrittyColors,
    bright: {} as AlacrittyColors,
  };

  let currentSection: keyof typeof result | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Match section headers
    const sectionMatch = trimmed.match(/^\[colors\.(primary|normal|bright)\]$/);
    if (sectionMatch) {
      currentSection = sectionMatch[1] as keyof typeof result;
      continue;
    }

    // Match key = value (with optional quotes)
    if (currentSection) {
      const kvMatch = trimmed.match(/^(\w+)\s*=\s*['"]?([^'"]+)['"]?$/);
      if (kvMatch) {
        const key = kvMatch[1] as keyof AlacrittyColors;
        const value = kvMatch[2].trim();
        result[currentSection][key] = value;
      }
    }
  }

  return result;
}

/**
 * Parse YAML format Alacritty config
 */
function parseYaml(content: string): { primary: AlacrittyColors; normal: AlacrittyColors; bright: AlacrittyColors } {
  const result = {
    primary: {} as AlacrittyColors,
    normal: {} as AlacrittyColors,
    bright: {} as AlacrittyColors,
  };

  let inColors = false;
  let currentSection: keyof typeof result | null = null;

  for (const line of content.split("\n")) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith("#")) continue;

    // Detect indentation level
    const indent = line.match(/^(\s*)/)?.[1].length || 0;

    // Top level colors:
    if (indent === 0 && line.trim() === "colors:") {
      inColors = true;
      continue;
    }

    // Exit colors section
    if (indent === 0 && inColors && !line.trim().startsWith("#")) {
      inColors = false;
      currentSection = null;
    }

    if (!inColors) continue;

    // Section headers (primary:, normal:, bright:)
    if (indent === 2) {
      const sectionMatch = line.trim().match(/^(primary|normal|bright):$/);
      if (sectionMatch) {
        currentSection = sectionMatch[1] as keyof typeof result;
        continue;
      }
    }

    // Key-value pairs (4 spaces indent)
    if (indent >= 4 && currentSection) {
      const kvMatch = line.trim().match(/^(\w+):\s*['"]?([^'"]+)['"]?$/);
      if (kvMatch) {
        const key = kvMatch[1] as keyof AlacrittyColors;
        const value = kvMatch[2].trim();
        result[currentSection][key] = value;
      }
    }
  }

  return result;
}

/**
 * Normalize color - ensure # prefix
 */
function normalizeColor(color: string | undefined, fallback: string): string {
  if (!color) return fallback;
  const trimmed = color.replace(/^0x/, ""); // Handle 0xRRGGBB format
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/**
 * Parse an Alacritty config file and extract the color palette
 */
export function parseAlacritty(content: string, isToml: boolean): TerminalPalette {
  const data = isToml ? parseToml(content) : parseYaml(content);

  return {
    black: normalizeColor(data.normal.black, "#000000"),
    red: normalizeColor(data.normal.red, "#cc241d"),
    green: normalizeColor(data.normal.green, "#98971a"),
    yellow: normalizeColor(data.normal.yellow, "#d79921"),
    blue: normalizeColor(data.normal.blue, "#458588"),
    magenta: normalizeColor(data.normal.magenta, "#b16286"),
    cyan: normalizeColor(data.normal.cyan, "#689d6a"),
    white: normalizeColor(data.normal.white, "#a89984"),

    brightBlack: normalizeColor(data.bright.black, "#928374"),
    brightRed: normalizeColor(data.bright.red, "#fb4934"),
    brightGreen: normalizeColor(data.bright.green, "#b8bb26"),
    brightYellow: normalizeColor(data.bright.yellow, "#fabd2f"),
    brightBlue: normalizeColor(data.bright.blue, "#83a598"),
    brightMagenta: normalizeColor(data.bright.magenta, "#d3869b"),
    brightCyan: normalizeColor(data.bright.cyan, "#8ec07c"),
    brightWhite: normalizeColor(data.bright.white, "#ebdbb2"),

    background: normalizeColor(data.primary.background, "#282828"),
    foreground: normalizeColor(data.primary.foreground, "#ebdbb2"),
  };
}

/**
 * Import a theme from an Alacritty config file
 */
export function importAlacritty(filePath: string, themeName: string): Theme {
  const content = readFileSync(filePath, "utf-8");
  const ext = extname(filePath).toLowerCase();
  const isToml = ext === ".toml" || content.includes("[colors.");

  const palette = parseAlacritty(content, isToml);
  const colors = paletteToThemeColors(palette);

  return {
    name: themeName,
    source: filePath,
    colors,
  };
}
