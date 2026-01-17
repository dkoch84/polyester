/**
 * Base16 Importer
 *
 * Parses Base16 scheme files (YAML format)
 *
 * Base16 format:
 * scheme: "Gruvbox dark, hard"
 * author: "..."
 * base00: "1d2021"
 * base01: "3c3836"
 * ...
 * base0F: "d65d0e"
 *
 * Color meanings:
 * base00 - Default Background
 * base01 - Lighter Background (status bars)
 * base02 - Selection Background
 * base03 - Comments, Invisibles
 * base04 - Dark Foreground (status bars)
 * base05 - Default Foreground
 * base06 - Light Foreground
 * base07 - Light Background
 * base08 - Variables, XML Tags, Markup Link Text
 * base09 - Integers, Boolean, Constants
 * base0A - Classes, Markup Bold, Search Text Background
 * base0B - Strings, Inherited Class
 * base0C - Support, Regular Expressions, Escape Characters
 * base0D - Functions, Methods, Attribute IDs
 * base0E - Keywords, Storage, Selector
 * base0F - Deprecated, Opening/Closing Embedded Tags
 */

import { readFileSync } from "node:fs";
import { Theme, ThemeColors } from "../types.js";

interface Base16Scheme {
  scheme?: string;
  author?: string;
  base00: string;
  base01: string;
  base02: string;
  base03: string;
  base04: string;
  base05: string;
  base06: string;
  base07: string;
  base08: string;
  base09: string;
  base0A: string;
  base0B: string;
  base0C: string;
  base0D: string;
  base0E: string;
  base0F: string;
}

/**
 * Simple YAML parser for Base16 scheme files
 * Only handles flat key: value or key: "value" format
 */
function parseSimpleYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Match: key: value or key: "value"
    const match = trimmed.match(/^(\w+):\s*"?([^"]*)"?$/);
    if (match) {
      result[match[1]] = match[2];
    }
  }

  return result;
}

/**
 * Ensure color has # prefix
 */
function normalizeColor(color: string): string {
  if (!color) return "#000000";
  return color.startsWith("#") ? color : `#${color}`;
}

/**
 * Parse Base16 scheme content and extract theme colors
 */
export function parseBase16(content: string): ThemeColors {
  const data = parseSimpleYaml(content) as unknown as Base16Scheme;

  // Map Base16 colors to syntax highlighting roles
  return {
    background: normalizeColor(data.base00),
    foreground: normalizeColor(data.base05),

    keyword: normalizeColor(data.base0E),      // Keywords, storage
    string: normalizeColor(data.base0B),       // Strings
    number: normalizeColor(data.base09),       // Numbers, constants
    function: normalizeColor(data.base0D),     // Functions, methods
    comment: normalizeColor(data.base03),      // Comments
    type: normalizeColor(data.base0A),         // Classes
    variable: normalizeColor(data.base08),     // Variables
    operator: normalizeColor(data.base05),     // Use foreground
    punctuation: normalizeColor(data.base05),  // Use foreground
    property: normalizeColor(data.base0D),     // Properties (like functions)
    tag: normalizeColor(data.base08),          // XML tags
    attribute: normalizeColor(data.base0A),    // Attributes
    selector: normalizeColor(data.base0E),     // CSS selectors
    regexp: normalizeColor(data.base0C),       // Regular expressions
    builtin: normalizeColor(data.base0C),      // Built-ins
    meta: normalizeColor(data.base0F),         // Meta/deprecated

    addition: normalizeColor(data.base0B),     // Strings (green typically)
    deletion: normalizeColor(data.base08),     // Variables (red typically)
  };
}

/**
 * Import a theme from a Base16 scheme file
 */
export function importBase16(filePath: string, themeName: string): Theme {
  const content = readFileSync(filePath, "utf-8");
  const colors = parseBase16(content);

  return {
    name: themeName,
    source: filePath,
    colors,
  };
}
