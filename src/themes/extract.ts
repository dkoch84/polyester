/**
 * Theme extraction.
 *
 * Lifts the look-and-feel out of a document project and writes it as a
 * self-contained theme directory that any project on the search path can use.
 *
 * The rule this follows is that nothing is guessed and nothing is lost:
 *
 *   - `--poly-*` custom properties have an exact meaning, so they become
 *     token values in theme.json.
 *   - Every other declaration, including a document's own semantic variables
 *     (`--ink`, `--accent`, and so on), is copied into theme.css verbatim. A
 *     converter cannot know that `--ink` means body text, and guessing would
 *     produce a theme that looks almost right, which is worse than one that
 *     looks the same.
 *   - Font files named by `/font --src` are copied into the theme's fonts
 *     directory and re-declared relative to it, so the faces travel with the
 *     theme.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { parse } from "../parser/parser.js";
import { resolveStyleRef, loadStyle as loadLibraryStyle } from "../library/index.js";
import type { StyleTokens, Theme, ThemeColors, ThemeFontFace, SpacingTokens } from "./types.js";
import { tryResolveModules } from "./loader.js";
import { loadConfig } from "../config/index.js";
import type { Command, Document } from "../parser/ast.js";

export interface ExtractOptions {
  /** The .poly document to lift the theme out of. */
  documentPath: string;
  /** Theme name, used for the directory and the `name` field. */
  name: string;
  /** Where to write the theme directory. Defaults to the user's config dir. */
  outDir: string;
  /** Rewrite the source document to use the extracted theme. */
  adopt?: boolean;
}

export interface ExtractResult {
  themeDir: string;
  /** Absolute paths of every file written. */
  written: string[];
  /** `--poly-*` properties that became tokens in theme.json. */
  mappedTokens: string[];
  /** Font faces carried into the theme. */
  fonts: ThemeFontFace[];
  /** Lines of CSS copied verbatim into theme.css. */
  cssLines: number;
  /** Things the caller should know but that did not stop the extraction. */
  notes: string[];
  /** The theme name whose style, spacing and syntax the document was rendering with. */
  inheritedFrom: string;
  /** Set when --adopt rewrote the document. */
  documentRewritten?: string;
}

// ─── AST walking ────────────────────────────────────────────────

function commands(doc: Document): Command[] {
  const out: Command[] = [];
  const walk = (children: readonly { type: string }[]) => {
    for (const child of children) {
      if (child.type !== "command") continue;
      const cmd = child as Command;
      out.push(cmd);
      if (cmd.block) walk(cmd.block.children);
    }
  };
  walk(doc.children);
  return out;
}

function positional(cmd: Command, idx: number): string | undefined {
  let count = 0;
  for (const a of cmd.args) {
    if (a.type === "positional") {
      if (count === idx) return a.value;
      count++;
    }
  }
  return undefined;
}

function flag(cmd: Command, name: string): string | boolean | undefined {
  for (const a of cmd.args) {
    if (a.type === "flag" && a.name === name) return a.value === undefined ? true : a.value;
  }
  return undefined;
}

function rawBlock(cmd: Command): string {
  if (!cmd.block) return "";
  return cmd.block.children
    .map((child) => ("value" in child ? String((child as { value: unknown }).value) : ""))
    .join("\n");
}

// ─── Token mapping ──────────────────────────────────────────────

/**
 * `--poly-*` property name to its position in StyleTokens.
 *
 * Only properties Polyester itself defines are mapped; see the file header for
 * why nothing else is.
 */
const TOKEN_MAP: Record<string, [keyof StyleTokens, string]> = {
  "--poly-color-primary": ["colors", "primary"],
  "--poly-color-primary-light": ["colors", "primary-light"],
  "--poly-color-primary-dark": ["colors", "primary-dark"],
  "--poly-color-secondary": ["colors", "secondary"],
  "--poly-color-accent": ["colors", "accent"],
  "--poly-color-bg": ["colors", "background"],
  "--poly-color-surface": ["colors", "surface"],
  "--poly-color-text": ["colors", "text"],
  "--poly-color-text-muted": ["colors", "text-muted"],
  "--poly-color-heading": ["colors", "heading"],
  "--poly-color-heading-sub": ["colors", "heading-sub"],
  "--poly-color-border": ["colors", "border"],
  "--poly-color-link": ["colors", "link"],
  "--poly-color-success": ["colors", "success"],
  "--poly-color-warning": ["colors", "warning"],
  "--poly-color-error": ["colors", "error"],
  "--poly-font-body": ["fonts", "body"],
  "--poly-font-heading": ["fonts", "heading"],
  "--poly-font-mono": ["fonts", "mono"],
  "--poly-radius": ["borders", "radius"],
  "--poly-border-width": ["borders", "width"],
  "--poly-shadow-card": ["shadows", "card"],
  "--poly-shadow-elevated": ["shadows", "elevated"],
  "--poly-hero-gradient": ["hero", "gradient"],
  "--poly-hero-bg": ["hero", "background"],
  "--poly-hero-text": ["hero", "text-color"],
};

/**
 * Pull `--poly-*` declarations out of CSS.
 *
 * A later declaration wins, matching how the cascade would have resolved them
 * in the document this is extracted from.
 */
function extractPolyTokens(css: string): Map<string, string> {
  const found = new Map<string, string>();
  const re = /(--poly-[a-z0-9-]+)\s*:\s*([^;}]+)[;}]/gi;
  for (const m of css.matchAll(re)) {
    found.set(m[1].toLowerCase(), m[2].trim());
  }
  return found;
}

function applyTokens(
  tokens: Map<string, string>,
  base: StyleTokens,
): { style: StyleTokens; mapped: string[] } {
  // Start from the style the document actually rendered with, so anything its
  // CSS did not set keeps the value it had. The extracted theme then
  // reproduces the document rather than approximating it.
  const style: StyleTokens = JSON.parse(JSON.stringify(base));
  const mapped: string[] = [];

  for (const [prop, value] of tokens) {
    const target = TOKEN_MAP[prop];
    if (!target) continue;
    const [group, key] = target;
    (style[group] as unknown as Record<string, string>)[key] = value;
    mapped.push(prop);
  }

  return { style, mapped: mapped.sort() };
}

// ─── Extraction ─────────────────────────────────────────────────

export function extractTheme(opts: ExtractOptions): ExtractResult {
  const docPath = resolve(opts.documentPath);
  if (!existsSync(docPath)) {
    throw new Error(`Document not found: ${docPath}`);
  }
  const sourceDir = dirname(docPath);
  const source = readFileSync(docPath, "utf-8");
  const doc = parse(source);
  const cmds = commands(doc);

  const notes: string[] = [];
  const cssParts: string[] = [];

  // 1. CSS, in document order: /import manifests and inline /style blocks.
  for (const cmd of cmds) {
    if (cmd.name === "import") {
      const ref = positional(cmd, 0);
      if (!ref) continue;
      const abs = resolveStyleRef(ref, sourceDir);
      if (!abs) {
        notes.push(`/import "${ref}" could not be resolved and was skipped`);
        continue;
      }
      cssParts.push(`/* from ${ref} */\n${loadLibraryStyle(abs).css}`);
    } else if (cmd.name === "style") {
      const css = rawBlock(cmd).trim();
      if (css) cssParts.push(`/* from an inline /style block */\n${css}`);
    }
  }

  if (!cssParts.length) {
    notes.push("The document has no /style block and no resolvable /import, so theme.css is empty");
  }

  const css = cssParts.join("\n\n");

  // What the document renders with today: its own /page theme/style/spacing if
  // it names any, otherwise this machine's configured default. Carrying that
  // into the theme is what makes --adopt a no-op visually, most visibly for
  // syntax colors, which a document inherits without ever mentioning them.
  const page = cmds.find((c) => c.name === "page");
  const effective = tryResolveModules({
    theme: (page && (flag(page, "theme") as string)) || loadConfig().defaultTheme,
    style: page ? (flag(page, "style") as string) || undefined : undefined,
    spacing: page ? (flag(page, "spacing") as string) || undefined : undefined,
  });
  for (const d of effective.diagnostics) notes.push(d.message);

  const { style, mapped } = applyTokens(extractPolyTokens(css), effective.resolved.style);
  const spacing: SpacingTokens = effective.resolved.spacing;
  const syntax: ThemeColors = effective.resolved.syntax;

  // 2. Font faces. Local files are copied in so the theme is self-contained.
  const themeDir = resolve(opts.outDir);
  const fontsDir = join(themeDir, "fonts");
  const fonts: ThemeFontFace[] = [];
  const written: string[] = [];

  for (const cmd of cmds) {
    if (cmd.name !== "font") continue;
    const family = positional(cmd, 0);
    if (!family) continue;

    const src = flag(cmd, "src");
    const google = flag(cmd, "google");
    const face: ThemeFontFace = { family };

    if (typeof src === "string") {
      const from = isAbsolute(src) ? src : resolve(sourceDir, src);
      if (!existsSync(from)) {
        notes.push(`/font "${family}" points at a missing file and was skipped: ${src}`);
        continue;
      }
      mkdirSync(fontsDir, { recursive: true });
      const to = join(fontsDir, basename(from));
      copyFileSync(from, to);
      written.push(to);
      face.src = `fonts/${basename(from)}`;
    } else if (google !== undefined) {
      face.google = typeof google === "string" ? google : "";
    } else {
      notes.push(`/font "${family}" names no source and was skipped`);
      continue;
    }

    const weight = flag(cmd, "weight");
    const fontStyle = flag(cmd, "style");
    const display = flag(cmd, "display");
    if (typeof weight === "string") face.weight = weight;
    if (typeof fontStyle === "string") face.style = fontStyle;
    if (typeof display === "string") face.display = display;
    if (flag(cmd, "body") !== undefined) face.body = true;
    if (flag(cmd, "heading") !== undefined) face.heading = true;
    if (flag(cmd, "mono") !== undefined) face.mono = true;

    fonts.push(face);
  }

  // The document's CSS may set the font stacks directly rather than through
  // /font flags. Those already came across as tokens, so say so rather than
  // leaving the theme looking like it forgot to assign its faces.
  if (fonts.length && !fonts.some((f) => f.body || f.heading || f.mono)) {
    const viaTokens = mapped.filter((m) => m.startsWith("--poly-font-"));
    if (viaTokens.length) {
      notes.push(
        `Font families come from ${viaTokens.join(", ")} in the CSS rather than from ` +
          `/font --body/--heading/--mono flags; the faces are declared, the stacks are tokens`,
      );
    }
  }

  // 3. Write the theme.
  mkdirSync(themeDir, { recursive: true });

  const theme: Theme = {
    name: opts.name,
    source: docPath,
    style,
    spacing,
    syntax,
    ...(fonts.length && { fonts }),
  };

  const themeJsonPath = join(themeDir, "theme.json");
  writeFileSync(themeJsonPath, JSON.stringify(theme, null, 2) + "\n");
  written.unshift(themeJsonPath);

  if (css) {
    const cssPath = join(themeDir, "theme.css");
    writeFileSync(cssPath, css.endsWith("\n") ? css : css + "\n");
    written.splice(1, 0, cssPath);
  }

  const result: ExtractResult = {
    inheritedFrom: effective.resolved.name,
    themeDir,
    written,
    mappedTokens: mapped,
    fonts,
    cssLines: css ? css.split("\n").length : 0,
    notes,
  };

  if (opts.adopt) {
    writeFileSync(docPath, adoptTheme(source, opts.name));
    result.documentRewritten = docPath;
  }

  return result;
}

// ─── Adoption ───────────────────────────────────────────────────

/**
 * Rewrite a document to use an extracted theme.
 *
 * Drops the /font and /import lines the theme now carries and puts
 * `--theme <name>` on /page, adding a /page line if the document had none.
 * Everything else is left exactly as it was.
 */
export function adoptTheme(source: string, themeName: string): string {
  const lines = source.split("\n");
  const out: string[] = [];
  let pageSeen = false;

  for (const line of lines) {
    if (/^\/font\b/.test(line) || /^\/import\b/.test(line)) continue;

    if (/^\/page\b/.test(line)) {
      pageSeen = true;
      out.push(
        /--theme\b/.test(line)
          ? line.replace(/--theme\s+("[^"]*"|\S+)/, `--theme ${themeName}`)
          : `${line.trimEnd()} --theme ${themeName}`,
      );
      continue;
    }

    out.push(line);
  }

  if (!pageSeen) out.unshift(`/page --theme ${themeName}`);

  // Collapse the blank run the removed setup lines leave behind.
  return out.join("\n").replace(/^\n+/, "").replace(/\n{3,}/g, "\n\n");
}
