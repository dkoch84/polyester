/**
 * Theme Loader
 *
 * Handles loading, saving, and listing themes, styles, and spacing modules.
 * Directories:
 *   ~/.config/polyester/themes/   — composed themes + syntax themes
 *   ~/.config/polyester/styles/   — style modules
 *   ~/.config/polyester/spacing/  — spacing modules
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import {
  Theme,
  ThemeColors,
  StyleTokens,
  SpacingTokens,
  DEFAULT_THEME,
  DEFAULT_SYNTAX,
  DEFAULT_STYLE,
  DEFAULT_SPACING,
} from "./types.js";
import { BUILTIN_STYLES, BUILTIN_SPACING } from "./starters.js";

const CONFIG_DIR = join(homedir(), ".config", "polyester");
const THEMES_DIR = join(CONFIG_DIR, "themes");
const STYLES_DIR = join(CONFIG_DIR, "styles");
const SPACING_DIR = join(CONFIG_DIR, "spacing");

// ─── Directory Management ──────────────────────────────────────

export function ensureConfigDirs(): void {
  for (const dir of [CONFIG_DIR, THEMES_DIR, STYLES_DIR, SPACING_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// ─── Style Module Loading ──────────────────────────────────────

export function loadStyle(name: string): StyleTokens {
  // 1. Check built-in presets
  if (name === "default") return { ...DEFAULT_STYLE };
  if (BUILTIN_STYLES[name]) return { ...BUILTIN_STYLES[name] };

  // 2. Check filesystem
  const filePath = join(STYLES_DIR, `${name}.json`);
  if (existsSync(filePath)) {
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as StyleTokens;
    } catch (err) {
      console.warn(`Error loading style "${name}": ${(err as Error).message}`);
    }
  }

  console.warn(`Style "${name}" not found, using default`);
  return { ...DEFAULT_STYLE };
}

export function listStyles(): string[] {
  const names = new Set(["default", ...Object.keys(BUILTIN_STYLES)]);
  if (existsSync(STYLES_DIR)) {
    for (const f of readdirSync(STYLES_DIR)) {
      if (f.endsWith(".json")) names.add(basename(f, ".json"));
    }
  }
  return [...names];
}

export function saveStyle(style: StyleTokens): void {
  ensureConfigDirs();
  const filePath = join(STYLES_DIR, `${style.name}.json`);
  writeFileSync(filePath, JSON.stringify(style, null, 2));
}

// ─── Spacing Module Loading ────────────────────────────────────

export function loadSpacing(name: string): SpacingTokens {
  // 1. Check built-in presets
  if (BUILTIN_SPACING[name]) return { ...BUILTIN_SPACING[name] };

  // 2. Check filesystem
  const filePath = join(SPACING_DIR, `${name}.json`);
  if (existsSync(filePath)) {
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as SpacingTokens;
    } catch (err) {
      console.warn(`Error loading spacing "${name}": ${(err as Error).message}`);
    }
  }

  console.warn(`Spacing "${name}" not found, using default`);
  return { ...DEFAULT_SPACING };
}

export function listSpacingPresets(): string[] {
  const names = new Set(Object.keys(BUILTIN_SPACING));
  if (existsSync(SPACING_DIR)) {
    for (const f of readdirSync(SPACING_DIR)) {
      if (f.endsWith(".json")) names.add(basename(f, ".json"));
    }
  }
  return [...names];
}

export function saveSpacing(spacing: SpacingTokens): void {
  ensureConfigDirs();
  const filePath = join(SPACING_DIR, `${spacing.name}.json`);
  writeFileSync(filePath, JSON.stringify(spacing, null, 2));
}

// ─── Syntax Theme Loading ──────────────────────────────────────

function loadSyntaxColors(name: string): ThemeColors {
  if (name === "default") return DEFAULT_SYNTAX;

  const themePath = join(THEMES_DIR, `${name}.json`);
  if (!existsSync(themePath)) return DEFAULT_SYNTAX;

  try {
    const data = JSON.parse(readFileSync(themePath, "utf-8"));
    // Could be a legacy theme file with `colors` key
    if (data.colors && !data.syntax && !data.style) {
      return data.colors as ThemeColors;
    }
    if (data.syntax && typeof data.syntax === "object") {
      return data.syntax as ThemeColors;
    }
    // If it looks like raw ThemeColors (has background/foreground/keyword)
    if (data.background && data.foreground && data.keyword) {
      return data as ThemeColors;
    }
    return DEFAULT_SYNTAX;
  } catch {
    return DEFAULT_SYNTAX;
  }
}

// ─── Composed Theme Loading ────────────────────────────────────

export interface ResolvedTheme {
  name: string;
  style: StyleTokens;
  spacing: SpacingTokens;
  syntax: ThemeColors;
}

/**
 * Resolve a theme by name into its fully-expanded modules.
 * Handles both legacy (colors-only) and composed theme files.
 */
export function resolveTheme(name: string): ResolvedTheme {
  if (name === "default") {
    return {
      name: "default",
      style: { ...DEFAULT_STYLE },
      spacing: { ...DEFAULT_SPACING },
      syntax: DEFAULT_SYNTAX,
    };
  }

  const themePath = join(THEMES_DIR, `${name}.json`);
  if (!existsSync(themePath)) {
    console.warn(`Theme "${name}" not found, using default`);
    return resolveTheme("default");
  }

  try {
    const data = JSON.parse(readFileSync(themePath, "utf-8")) as Theme;
    return resolveThemeData(data);
  } catch (err) {
    console.error(`Error loading theme "${name}": ${(err as Error).message}`);
    return resolveTheme("default");
  }
}

/**
 * Resolve a Theme data object (from file or inline) into expanded modules.
 */
export function resolveThemeData(data: Theme): ResolvedTheme {
  // Resolve style
  let style: StyleTokens;
  if (typeof data.style === "string") {
    style = loadStyle(data.style);
  } else if (data.style && typeof data.style === "object") {
    style = data.style;
  } else {
    style = { ...DEFAULT_STYLE };
  }

  // Resolve spacing
  let spacing: SpacingTokens;
  if (typeof data.spacing === "string") {
    spacing = loadSpacing(data.spacing);
  } else if (data.spacing && typeof data.spacing === "object") {
    spacing = data.spacing;
  } else {
    spacing = { ...DEFAULT_SPACING };
  }

  // Resolve syntax (with backward compat: `colors` → `syntax`)
  let syntax: ThemeColors;
  const syntaxSource = data.syntax ?? data.colors;
  if (typeof syntaxSource === "string") {
    syntax = loadSyntaxColors(syntaxSource);
  } else if (syntaxSource && typeof syntaxSource === "object") {
    syntax = syntaxSource;
  } else {
    syntax = DEFAULT_SYNTAX;
  }

  return { name: data.name, style, spacing, syntax };
}

/**
 * Build a ResolvedTheme from individual module overrides.
 * Any parameter can be undefined to use defaults.
 */
export function resolveModules(opts: {
  theme?: string;
  style?: string;
  spacing?: string;
  syntax?: string;
}): ResolvedTheme {
  // Start from theme if specified, otherwise defaults
  let resolved: ResolvedTheme;
  if (opts.theme) {
    resolved = resolveTheme(opts.theme);
  } else {
    resolved = {
      name: "custom",
      style: { ...DEFAULT_STYLE },
      spacing: { ...DEFAULT_SPACING },
      syntax: DEFAULT_SYNTAX,
    };
  }

  // Explicit overrides take precedence over theme
  if (opts.style) resolved.style = loadStyle(opts.style);
  if (opts.spacing) resolved.spacing = loadSpacing(opts.spacing);
  if (opts.syntax) resolved.syntax = loadSyntaxColors(opts.syntax);

  return resolved;
}

// ─── CSS Generation ────────────────────────────────────────────

export function styleToCSS(style: StyleTokens): string {
  const c = style.colors;
  const f = style.fonts;
  const b = style.borders;
  const s = style.shadows;
  const h = style.hero;

  return `/* Style tokens: ${style.name || "custom"} */
:root {
  --poly-color-primary: ${c.primary};
  --poly-color-primary-light: ${c["primary-light"]};
  --poly-color-primary-dark: ${c["primary-dark"]};
  --poly-color-secondary: ${c.secondary};
  --poly-color-accent: ${c.accent};
  --poly-color-bg: ${c.background};
  --poly-color-surface: ${c.surface};
  --poly-color-text: ${c.text};
  --poly-color-text-muted: ${c["text-muted"]};
  --poly-color-heading: ${c.heading || c.text};
  --poly-color-heading-sub: ${c["heading-sub"] || c.heading || c.text};
  --poly-color-border: ${c.border};
  --poly-color-link: ${c.link};
  --poly-color-success: ${c.success};
  --poly-color-warning: ${c.warning};
  --poly-color-error: ${c.error};
  --poly-font-body: ${f.body};
  --poly-font-heading: ${f.heading};
  --poly-font-mono: ${f.mono};
  --poly-radius: ${b.radius};
  --poly-border-width: ${b.width};
  --poly-shadow-card: ${s.card};
  --poly-shadow-elevated: ${s.elevated || "0 4px 12px rgba(0,0,0,0.1)"};
  --poly-hero-gradient: ${h.gradient};
  --poly-hero-bg: ${h.background || h.gradient};
  --poly-hero-text: ${h["text-color"]};
}`;
}

export function spacingToCSS(spacing: SpacingTokens): string {
  return `/* Spacing tokens: ${spacing.name || "custom"} */
:root {
  --poly-spacing-base: ${spacing.base};
  --poly-spacing-page-margin: ${spacing["page-margin"]};
  --poly-spacing-section-gap: ${spacing["section-gap"]};
  --poly-spacing-column-gap: ${spacing["column-gap"]};
  --poly-spacing-card-padding: ${spacing["card-padding"]};
  --poly-spacing-block-padding: ${spacing["block-padding"]};
}`;
}

/**
 * Generate CSS for syntax highlighting from ThemeColors.
 */
export function syntaxToCSS(colors: ThemeColors, name?: string): string {
  const c = colors;
  return `
/* Syntax highlighting: ${name || "custom"} */
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

// ─── Legacy compat exports ─────────────────────────────────────

/** @deprecated Use syntaxToCSS() or resolveTheme() instead */
export function themeToCSS(theme: Theme): string {
  // Handle both legacy (colors-only) and composed themes
  const colors = theme.syntax
    ? (typeof theme.syntax === "object" ? theme.syntax : loadSyntaxColors(theme.syntax))
    : theme.colors || DEFAULT_SYNTAX;
  return syntaxToCSS(colors, theme.name);
}

export function getThemePath(name: string): string {
  return join(THEMES_DIR, `${name}.json`);
}

/**
 * Load a theme by name (legacy — returns raw Theme object)
 */
export function loadTheme(name: string): Theme {
  if (name === "default") return DEFAULT_THEME;

  const themePath = getThemePath(name);
  if (!existsSync(themePath)) {
    console.warn(`Theme "${name}" not found, using default`);
    return DEFAULT_THEME;
  }

  try {
    const content = readFileSync(themePath, "utf-8");
    const theme = JSON.parse(content) as Theme;
    // Backward compat: if `colors` exists, keep it
    return theme;
  } catch (err) {
    console.error(`Error loading theme "${name}":`, (err as Error).message);
    return DEFAULT_THEME;
  }
}

export function saveTheme(theme: Theme): void {
  ensureConfigDirs();
  const themePath = getThemePath(theme.name);
  writeFileSync(themePath, JSON.stringify(theme, null, 2));
}

export function listThemes(): string[] {
  ensureConfigDirs();
  const themes = ["default"];
  if (existsSync(THEMES_DIR)) {
    for (const f of readdirSync(THEMES_DIR)) {
      if (f.endsWith(".json")) themes.push(basename(f, ".json"));
    }
  }
  return themes;
}

export function themeExists(name: string): boolean {
  if (name === "default") return true;
  return existsSync(getThemePath(name));
}

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
