/**
 * Lucide Icons Integration
 *
 * Provides inline SVG icons from the lucide-static package.
 */

import { readFileSync, existsSync } from "fs";
import { createRequire } from "module";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);

// Cache for loaded icons
const iconCache = new Map<string, string>();

// Find the lucide-static icons directory
let iconsDir: string | null = null;

function getIconsDir(): string {
  if (iconsDir) return iconsDir;

  try {
    // Resolve lucide-static package path
    const lucidePath = require.resolve("lucide-static/package.json");
    iconsDir = join(dirname(lucidePath), "icons");
    return iconsDir;
  } catch {
    // Fallback: try common locations
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const candidates = [
      join(__dirname, "../../../node_modules/lucide-static/icons"),
      join(__dirname, "../../../../node_modules/lucide-static/icons"),
    ];
    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        iconsDir = candidate;
        return iconsDir;
      }
    }
    throw new Error("Could not find lucide-static icons directory");
  }
}

/**
 * Get SVG markup for a Lucide icon
 * Returns the SVG element with customizable size and color
 */
export function getIcon(
  name: string,
  options: { size?: string; color?: string; className?: string } = {}
): string | null {
  const { size = "1em", color = "currentColor", className = "" } = options;

  // Normalize icon name (handle camelCase and kebab-case)
  const iconName = name
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase();

  // Check cache
  const cacheKey = iconName;
  let svgContent = iconCache.get(cacheKey);

  if (!svgContent) {
    // Try to load the icon
    const iconPath = join(getIconsDir(), `${iconName}.svg`);
    if (!existsSync(iconPath)) {
      return null;
    }

    svgContent = readFileSync(iconPath, "utf-8");

    // Remove the license comment
    svgContent = svgContent.replace(/<!--[\s\S]*?-->\n?/g, "");

    iconCache.set(cacheKey, svgContent);
  }

  // Modify the SVG with custom attributes
  let svg = svgContent;

  // Update size
  svg = svg.replace(/width="24"/, `width="${size}"`);
  svg = svg.replace(/height="24"/, `height="${size}"`);

  // Update color
  svg = svg.replace(/stroke="currentColor"/, `stroke="${color}"`);

  // Add className if provided
  if (className) {
    svg = svg.replace(/class="([^"]*)"/, `class="$1 ${className}"`);
  }

  // Add inline styling for vertical alignment
  svg = svg.replace(
    /<svg/,
    `<svg style="vertical-align: middle; display: inline-block;"`
  );

  return svg;
}

/**
 * Check if an icon exists
 */
export function hasIcon(name: string): boolean {
  const iconName = name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  const iconPath = join(getIconsDir(), `${iconName}.svg`);
  return existsSync(iconPath);
}

/**
 * Get list of available icons (for documentation)
 */
export function listIcons(): string[] {
  const fs = require("fs") as typeof import("fs");
  try {
    const files = fs.readdirSync(getIconsDir());
    return files
      .filter((f: string) => f.endsWith(".svg"))
      .map((f: string) => f.replace(".svg", ""));
  } catch {
    return [];
  }
}
