/**
 * Theme Loader
 *
 * Handles loading, saving, and listing themes, styles, and spacing modules.
 *
 * Modules are searched across several roots, highest precedence first:
 *   $POLY_THEME_PATH entries: colon-separated, for a checkout or a share
 *   each subdirectory of ~/.config/polyester/packs: clones from `poly theme add`
 *   ~/.config/polyester itself: this machine's own themes
 * and finally the built-in presets compiled into the binary.
 *
 * Each root holds the same three directories: themes, styles and spacing.
 *
 * A theme is either `themes/<name>.json` or a self-contained directory
 * `themes/<name>` holding theme.json, an optional theme.css, and an optional
 * fonts directory. The directory form is what makes a theme portable: the CSS
 * and the font files travel with the tokens instead of living beside one
 * document.
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join, basename, dirname, resolve, isAbsolute } from "node:path";
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
  ThemeFontFace,
} from "./types.js";
import { BUILTIN_STYLES, BUILTIN_SPACING } from "./starters.js";
import type { Diagnostic } from "../diagnostics.js";

const CONFIG_DIR = join(homedir(), ".config", "polyester");
const THEMES_DIR = join(CONFIG_DIR, "themes");
const STYLES_DIR = join(CONFIG_DIR, "styles");
const SPACING_DIR = join(CONFIG_DIR, "spacing");
/** Clones managed by `poly theme add`. Each subdirectory is a search root. */
export const PACKS_DIR = join(CONFIG_DIR, "packs");

export type ModuleKind = "themes" | "styles" | "spacing";

/**
 * Search roots, highest precedence first.
 *
 * Writes always go to CONFIG_DIR; only reads consult the wider path.
 */
export function themeRoots(): string[] {
  const roots: string[] = [];

  const envPath = process.env.POLY_THEME_PATH;
  if (envPath) {
    for (const entry of envPath.split(":")) {
      const trimmed = entry.trim();
      if (trimmed) roots.push(resolve(trimmed));
    }
  }

  if (existsSync(PACKS_DIR)) {
    for (const entry of readdirSync(PACKS_DIR).sort()) {
      const dir = join(PACKS_DIR, entry);
      if (statSync(dir).isDirectory()) roots.push(dir);
    }
  }

  roots.push(CONFIG_DIR);
  return roots;
}

/**
 * Find a module file by name across the search path.
 *
 * For themes the directory form wins over the flat file, so a theme can grow
 * a theme.css without changing how documents refer to it.
 */
export function findModuleFile(kind: ModuleKind, name: string): string | null {
  for (const root of themeRoots()) {
    if (kind === "themes") {
      const dirForm = join(root, "themes", name, "theme.json");
      if (existsSync(dirForm)) return dirForm;
    }
    const flat = join(root, kind, `${name}.json`);
    if (existsSync(flat)) return flat;
  }
  return null;
}

/** Every module name of one kind found on the search path. */
function listModuleNames(kind: ModuleKind): string[] {
  const names = new Set<string>();
  for (const root of themeRoots()) {
    const dir = join(root, kind);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (entry.endsWith(".json")) {
        names.add(basename(entry, ".json"));
      } else if (kind === "themes" && statSync(full).isDirectory()) {
        if (existsSync(join(full, "theme.json"))) names.add(entry);
      }
    }
  }
  return [...names];
}

// ─── Directory Management ──────────────────────────────────────

export function ensureConfigDirs(): void {
  for (const dir of [CONFIG_DIR, THEMES_DIR, STYLES_DIR, SPACING_DIR]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * A named theme, style, spacing preset or syntax scheme could not be resolved.
 *
 * Thrown rather than defaulted: a document that asks for a theme and silently
 * gets the built-in default is a document rendered in the wrong design, and it
 * reports success while doing it.
 */
export class ThemeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeError";
  }
}

/** "corporate, minimal, playful": the "did you mean" half of an error. */
function available(names: string[]): string {
  return names.sort().join(", ");
}

// ─── Style Module Loading ──────────────────────────────────────

export function loadStyle(name: string): StyleTokens {
  // 1. Search path first. Disk beats built-ins deliberately: a built-in that
  //    shadowed a same-named file made overriding a shipped style impossible
  //    to do without deleting it from the source.
  const filePath = findModuleFile("styles", name);
  if (filePath) {
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as StyleTokens;
    } catch (err) {
      throw new ThemeError(
        `Style "${name}" at ${filePath} could not be parsed: ${(err as Error).message}`,
      );
    }
  }

  // 2. Built-in presets
  if (BUILTIN_STYLES[name]) return { ...BUILTIN_STYLES[name] };
  if (name === "default") return { ...DEFAULT_STYLE };

  throw new ThemeError(
    `Style "${name}" not found. Available: ${available(listStyles())}`,
  );
}

export function listStyles(): string[] {
  return [...new Set(["default", ...Object.keys(BUILTIN_STYLES), ...listModuleNames("styles")])];
}

export function saveStyle(style: StyleTokens): void {
  ensureConfigDirs();
  const filePath = join(STYLES_DIR, `${style.name}.json`);
  writeFileSync(filePath, JSON.stringify(style, null, 2));
}

// ─── Spacing Module Loading ────────────────────────────────────

export function loadSpacing(name: string): SpacingTokens {
  // Search path first, same reasoning as loadStyle.
  const filePath = findModuleFile("spacing", name);
  if (filePath) {
    try {
      return JSON.parse(readFileSync(filePath, "utf-8")) as SpacingTokens;
    } catch (err) {
      throw new ThemeError(
        `Spacing "${name}" at ${filePath} could not be parsed: ${(err as Error).message}`,
      );
    }
  }

  if (BUILTIN_SPACING[name]) return { ...BUILTIN_SPACING[name] };
  if (name === "default") return { ...DEFAULT_SPACING };

  throw new ThemeError(
    `Spacing "${name}" not found. Available: ${available(listSpacingPresets())}`,
  );
}

export function listSpacingPresets(): string[] {
  return [...new Set([...Object.keys(BUILTIN_SPACING), ...listModuleNames("spacing")])];
}

export function saveSpacing(spacing: SpacingTokens): void {
  ensureConfigDirs();
  const filePath = join(SPACING_DIR, `${spacing.name}.json`);
  writeFileSync(filePath, JSON.stringify(spacing, null, 2));
}

// ─── Syntax Theme Loading ──────────────────────────────────────

function loadSyntaxColors(name: string): ThemeColors {
  if (name === "default") return DEFAULT_SYNTAX;

  const themePath = findModuleFile("themes", name);
  if (!themePath) {
    throw new ThemeError(
      `Syntax theme "${name}" not found. Available: ${available(listThemes())}`,
    );
  }

  let data: any;
  try {
    data = JSON.parse(readFileSync(themePath, "utf-8"));
  } catch (err) {
    throw new ThemeError(
      `Syntax theme "${name}" at ${themePath} could not be parsed: ${(err as Error).message}`,
    );
  }

  {
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
    // The file exists and parsed but carries no syntax section. That is a
    // legitimate theme shape (style/spacing only), so the default stands.
    return DEFAULT_SYNTAX;
  }
}

// ─── Composed Theme Loading ────────────────────────────────────

export interface ResolvedTheme {
  name: string;
  style: StyleTokens;
  spacing: SpacingTokens;
  syntax: ThemeColors;
  /**
   * Directory-form themes only: the theme's own directory. Font sources inside
   * the theme resolve against it, which is what lets a theme carry its faces
   * instead of borrowing whatever the document happens to sit next to.
   */
  dir?: string;
  /** Contents of the theme's theme.css, if it has one. */
  css?: string;
  /** Font faces the theme declares. Inlined by prefetchThemeFonts at build time. */
  fonts?: ThemeFontFace[];
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

  const themePath = findModuleFile("themes", name);
  if (!themePath) {
    throw new ThemeError(
      `Theme "${name}" not found. Available: ${available(listThemes())}`,
    );
  }

  let data: Theme;
  try {
    data = JSON.parse(readFileSync(themePath, "utf-8")) as Theme;
  } catch (err) {
    throw new ThemeError(
      `Theme "${name}" at ${themePath} could not be parsed: ${(err as Error).message}`,
    );
  }

  // Resolution of the theme's own style/spacing/syntax references throws
  // ThemeError in its own right, and that message is more specific than
  // anything this frame could add, so it is left to propagate.
  const resolved = resolveThemeData(data);
  resolved.name = data.name || name;

  // Directory form: pick up the sibling CSS and font declarations.
  if (basename(themePath) === "theme.json") {
    const dir = dirname(themePath);
    resolved.dir = dir;
    const cssPath = join(dir, "theme.css");
    if (existsSync(cssPath)) resolved.css = readFileSync(cssPath, "utf-8");
    if (data.fonts?.length) resolved.fonts = data.fonts;
  }

  return resolved;
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

/**
 * resolveModules, but a ThemeError becomes a diagnostic instead of a throw.
 *
 * On failure the defaults are returned so the caller can finish compiling and
 * collect the document's other errors: the build is going to fail either way,
 * and one report listing every problem beats one that stops at the first.
 * Any other error is a real fault and still propagates.
 */
export function tryResolveModules(opts: {
  theme?: string;
  style?: string;
  spacing?: string;
  syntax?: string;
}): { resolved: ResolvedTheme; diagnostics: Diagnostic[] } {
  try {
    return { resolved: resolveModules(opts), diagnostics: [] };
  } catch (err) {
    if (!(err instanceof ThemeError)) throw err;
    return {
      resolved: resolveModules({}),
      diagnostics: [{ severity: "error", message: err.message }],
    };
  }
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
  return [...new Set(["default", ...listModuleNames("themes")])];
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
