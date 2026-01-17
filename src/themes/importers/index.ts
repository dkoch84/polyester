/**
 * Theme Importers Index
 *
 * Exports all theme importers and provides auto-detection.
 */

export { parseXResources, importXResources } from "./xresources.js";
export { parsePywal, importPywal } from "./pywal.js";
export { parseBase16, importBase16 } from "./base16.js";
export { parseKitty, importKitty } from "./kitty.js";
export { parseAlacritty, importAlacritty } from "./alacritty.js";

import { Theme } from "../types.js";
import { importXResources } from "./xresources.js";
import { importPywal } from "./pywal.js";
import { importBase16 } from "./base16.js";
import { importKitty } from "./kitty.js";
import { importAlacritty } from "./alacritty.js";
import { basename, extname } from "node:path";
import { readFileSync } from "node:fs";

export type ImporterFormat = "xresources" | "pywal" | "base16" | "kitty" | "alacritty";

/**
 * Detect the format of a theme file based on filename and content
 */
export function detectFormat(filePath: string): ImporterFormat | null {
  const filename = basename(filePath).toLowerCase();
  const ext = extname(filePath).toLowerCase();

  // Check filename patterns
  if (filename.includes("xresources") || filename.includes(".xresources")) {
    return "xresources";
  }
  if (filename === "colors.json" || filePath.includes("/wal/")) {
    return "pywal";
  }
  if (filename === "kitty.conf" || filename.endsWith(".kitty")) {
    return "kitty";
  }
  if (filename.includes("alacritty") || ext === ".toml" && filePath.includes("alacritty")) {
    return "alacritty";
  }

  // Try to detect by content
  try {
    const content = readFileSync(filePath, "utf-8");

    // pywal JSON
    if (ext === ".json" && content.includes('"special"') && content.includes('"colors"')) {
      return "pywal";
    }

    // Base16 YAML (has base00-base0F)
    if ((ext === ".yaml" || ext === ".yml") && content.includes("base00:")) {
      return "base16";
    }

    // XResources (has *color patterns)
    if (content.match(/^\*\.?color\d+:/m)) {
      return "xresources";
    }

    // Kitty (has color0-15 without *)
    if (content.match(/^color\d+\s+#/m)) {
      return "kitty";
    }

    // Alacritty (has colors: or [colors.])
    if (content.includes("[colors.") || content.match(/^colors:\s*$/m)) {
      return "alacritty";
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

/**
 * Import a theme from any supported format
 * Auto-detects format if not specified
 */
export function importTheme(
  filePath: string,
  themeName: string,
  format?: ImporterFormat
): Theme {
  const detectedFormat = format || detectFormat(filePath);

  if (!detectedFormat) {
    throw new Error(
      `Could not detect theme format for ${filePath}. ` +
      `Specify format explicitly with --format (xresources, pywal, base16, kitty, alacritty)`
    );
  }

  switch (detectedFormat) {
    case "xresources":
      return importXResources(filePath, themeName);
    case "pywal":
      return importPywal(filePath, themeName);
    case "base16":
      return importBase16(filePath, themeName);
    case "kitty":
      return importKitty(filePath, themeName);
    case "alacritty":
      return importAlacritty(filePath, themeName);
    default:
      throw new Error(`Unknown format: ${detectedFormat}`);
  }
}
