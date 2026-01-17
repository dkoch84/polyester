/**
 * Theme Loader
 *
 * Handles loading, saving, and listing themes from ~/.config/polyester/themes/
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { Theme, DEFAULT_THEME } from "./types.js";

const CONFIG_DIR = join(homedir(), ".config", "polyester");
const THEMES_DIR = join(CONFIG_DIR, "themes");

/**
 * Ensure config directories exist
 */
export function ensureConfigDirs(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!existsSync(THEMES_DIR)) {
    mkdirSync(THEMES_DIR, { recursive: true });
  }
}

/**
 * Get path to a theme file
 */
export function getThemePath(name: string): string {
  return join(THEMES_DIR, `${name}.json`);
}

/**
 * Load a theme by name
 * Returns the default theme if not found
 */
export function loadTheme(name: string): Theme {
  if (name === "default") {
    return DEFAULT_THEME;
  }

  const themePath = getThemePath(name);

  if (!existsSync(themePath)) {
    console.warn(`Theme "${name}" not found, using default`);
    return DEFAULT_THEME;
  }

  try {
    const content = readFileSync(themePath, "utf-8");
    const theme = JSON.parse(content) as Theme;
    return theme;
  } catch (err) {
    console.error(`Error loading theme "${name}":`, (err as Error).message);
    return DEFAULT_THEME;
  }
}

/**
 * Save a theme to disk
 */
export function saveTheme(theme: Theme): void {
  ensureConfigDirs();
  const themePath = getThemePath(theme.name);
  const content = JSON.stringify(theme, null, 2);
  writeFileSync(themePath, content);
}

/**
 * List all available themes
 */
export function listThemes(): string[] {
  ensureConfigDirs();

  const themes = ["default"]; // Built-in default is always available

  if (existsSync(THEMES_DIR)) {
    const files = readdirSync(THEMES_DIR);
    for (const file of files) {
      if (file.endsWith(".json")) {
        themes.push(basename(file, ".json"));
      }
    }
  }

  return themes;
}

/**
 * Check if a theme exists
 */
export function themeExists(name: string): boolean {
  if (name === "default") return true;
  return existsSync(getThemePath(name));
}

/**
 * Delete a theme
 */
export function deleteTheme(name: string): boolean {
  if (name === "default") {
    console.error("Cannot delete the default theme");
    return false;
  }

  const themePath = getThemePath(name);
  if (!existsSync(themePath)) {
    console.error(`Theme "${name}" does not exist`);
    return false;
  }

  const { unlinkSync } = require("node:fs");
  unlinkSync(themePath);
  return true;
}

/**
 * Generate CSS from a theme for use in HTML output
 */
export function themeToCSS(theme: Theme): string {
  const c = theme.colors;

  return `
/* Syntax highlighting: ${theme.name} */
.poly-content pre {
  background: ${c.background};
  color: ${c.foreground};
}

.hljs { background: ${c.background}; color: ${c.foreground}; }

.hljs-comment,
.hljs-quote { color: ${c.comment}; }

.hljs-keyword,
.hljs-selector-tag { color: ${c.keyword}; }

.hljs-string,
.hljs-symbol,
.hljs-bullet { color: ${c.string}; }

.hljs-number,
.hljs-literal { color: ${c.number}; }

.hljs-title,
.hljs-section,
.hljs-title.function_ { color: ${c.function}; }

.hljs-type,
.hljs-title.class_ { color: ${c.type}; }

.hljs-variable,
.hljs-template-variable { color: ${c.variable}; }

.hljs-built_in { color: ${c.builtin}; }

.hljs-attr,
.hljs-attribute { color: ${c.attribute}; }

.hljs-property { color: ${c.property}; }

.hljs-params { color: ${c.foreground}; }

.hljs-meta { color: ${c.meta}; }

.hljs-name,
.hljs-tag { color: ${c.tag}; }

.hljs-selector-id,
.hljs-selector-class { color: ${c.selector}; }

.hljs-regexp { color: ${c.regexp}; }

.hljs-operator { color: ${c.operator}; }

.hljs-punctuation { color: ${c.punctuation}; }
${c.addition ? `
.hljs-addition { color: ${c.addition};${c.additionBg ? ` background: ${c.additionBg};` : ""} }` : ""}
${c.deletion ? `
.hljs-deletion { color: ${c.deletion};${c.deletionBg ? ` background: ${c.deletionBg};` : ""} }` : ""}
`.trim();
}
