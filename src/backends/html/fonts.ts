/**
 * Font prefetching and inlining.
 *
 * Walks a parsed Polyester document for /font commands, fetches Google Fonts
 * CSS + woff2 files (cached on disk), reads local font files, and base64-
 * inlines everything into ready-to-emit @font-face CSS strings.
 *
 * Inlining is what makes pagination deterministic: live preview, headless
 * Chrome (PDF), and standalone HTML all see the exact same bytes for the
 * font, so glyph metrics and line wrapping match across environments.
 */

import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import type { Document, Command } from "../../parser/ast.js";
import type { Diagnostic } from "../../diagnostics.js";
import type { ResolvedTheme } from "../../themes/loader.js";

const CACHE_DIR = resolve(homedir(), ".cache", "polyester", "fonts");

// Chrome-ish UA so Google Fonts gives us woff2 (the smallest, widely-supported format).
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FontDecl {
  family: string;
  /** Pre-rendered @font-face CSS (one or more blocks, src already inlined). */
  css: string;
  /**
   * Set when this /font could not be resolved. The prefetch pass has already
   * reported the real cause, so the component stays silent rather than adding
   * a second, vaguer message on top of it.
   */
  failed?: boolean;
}

export type FontCache = Map<string, FontDecl>;

export interface FontPrefetchResult {
  cache: FontCache;
  /** One error per /font that could not be resolved. */
  diagnostics: Diagnostic[];
}

/** Stable key for matching prefetched results back to a /font invocation. */
export function fontCacheKey(family: string, source: string): string {
  return `${family}::${source}`;
}

/**
 * Walk an AST for /font commands and return a cache map of family → resolved CSS.
 * Local --src fonts are read from disk; --google fonts are fetched (with
 * disk cache) and their woff2 URLs rewritten to inlined data URIs.
 */
export async function prefetchFonts(
  doc: Document,
  sourceDir: string,
): Promise<FontPrefetchResult> {
  const cache: FontCache = new Map();
  const diagnostics: Diagnostic[] = [];
  const fontCmds = collectFontCommands(doc);

  for (const cmd of fontCmds) {
    const line = cmd.loc?.start.line;
    const family = getPositional(cmd, 0);
    if (!family) continue;
    const src = getFlag(cmd, "src");
    const google = getFlag(cmd, "google");

    // Computed up front so a failure can be recorded under the same key the
    // component will look up, which is what keeps it from reporting twice.
    let key: string | undefined;
    if (typeof src === "string") {
      key = fontCacheKey(family, `src:${src}`);
    } else if (google !== undefined) {
      const axes = typeof google === "string" && google.length ? google : "";
      key = fontCacheKey(family, `google:${axes}`);
    }
    if (!key) continue; // No source given; the component reports this one.

    try {
      if (typeof src === "string") {
        const css = await loadLocalFont(family, src, sourceDir, cmd);
        cache.set(key, { family, css });
      } else {
        const axes = typeof google === "string" && google.length ? google : "";
        const css = await loadGoogleFont(family, axes, cmd);
        cache.set(key, { family, css });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // An unresolvable font is a hard error: rendering in a fallback face
      // silently changes every line break in the document.
      diagnostics.push({
        severity: "error",
        message: `/font "${family}" could not be loaded: ${msg}`,
        ...(line !== undefined && { line }),
      });
      cache.set(key, { family, css: "", failed: true });
    }
  }

  return { cache, diagnostics };
}

function collectFontCommands(doc: Document): Command[] {
  const out: Command[] = [];
  const walk = (children: readonly { type: string }[]) => {
    for (const child of children) {
      if (child.type === "command") {
        const cmd = child as Command;
        if (cmd.name === "font") out.push(cmd);
        if (cmd.block) walk(cmd.block.children);
      }
    }
  };
  walk(doc.children);
  return out;
}

function getPositional(cmd: Command, idx: number): string | undefined {
  let count = 0;
  for (const a of cmd.args) {
    if (a.type === "positional") {
      if (count === idx) return a.value;
      count++;
    }
  }
  return undefined;
}

function getFlag(cmd: Command, name: string): string | boolean | undefined {
  for (const a of cmd.args) {
    if (a.type === "flag" && a.name === name) {
      return a.value === undefined ? true : a.value;
    }
  }
  return undefined;
}

// ─── Local font loading ────────────────────────────────────────────────

interface FaceOptions {
  weight?: string;
  style?: string;
  display?: string;
}

async function loadLocalFont(
  family: string,
  src: string,
  sourceDir: string,
  cmd: Command,
): Promise<string> {
  return loadLocalFontFile(family, src, sourceDir, {
    weight: getFlag(cmd, "weight") as string,
    style: getFlag(cmd, "style") as string,
    display: getFlag(cmd, "display") as string,
  });
}

export async function loadLocalFontFile(
  family: string,
  src: string,
  sourceDir: string,
  opts: FaceOptions = {},
): Promise<string> {
  const fontPath = isAbsolute(src) ? src : resolve(sourceDir, src);
  const data = await readFile(fontPath);
  const mime = mimeForExt(extname(fontPath));
  const format = formatForExt(extname(fontPath));
  const dataUri = `data:${mime};base64,${data.toString("base64")}`;

  const weight = opts.weight || "400";
  const style = opts.style || "normal";
  const display = opts.display || "swap";

  return `@font-face {
  font-family: ${cssQuote(family)};
  font-style: ${style};
  font-weight: ${weight};
  font-display: ${display};
  src: url("${dataUri}") format("${format}");
}`;
}

function mimeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".woff2": return "font/woff2";
    case ".woff": return "font/woff";
    case ".ttf": return "font/ttf";
    case ".otf": return "font/otf";
    default: return "application/octet-stream";
  }
}

function formatForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".woff2": return "woff2";
    case ".woff": return "woff";
    case ".ttf": return "truetype";
    case ".otf": return "opentype";
    default: return "truetype";
  }
}

function cssQuote(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

// ─── Google Fonts loading ───────────────────────────────────────────────

/**
 * Fetch Google Fonts CSS for the given family + axis spec, then fetch every
 * referenced woff2 and rewrite the CSS to use base64 data URIs.
 *
 * Cached on disk by sha256(family + axes) so subsequent builds are offline-
 * friendly and instant.
 */
async function loadGoogleFont(
  family: string,
  axes: string,
  cmd: Command,
): Promise<string> {
  return loadGoogleFontSpec(family, axes, { display: getFlag(cmd, "display") as string });
}

export async function loadGoogleFontSpec(
  family: string,
  axes: string,
  opts: FaceOptions = {},
): Promise<string> {
  const display = opts.display || "swap";
  const cacheKey = createHash("sha256")
    .update(`${family}|${axes}|${display}`)
    .digest("hex")
    .slice(0, 16);
  const cachePath = resolve(CACHE_DIR, `${cacheKey}.css`);

  if (existsSync(cachePath)) {
    return await readFile(cachePath, "utf-8");
  }

  const cssUrl = buildGoogleFontsUrl(family, axes, display);
  const cssRes = await fetch(cssUrl, { headers: { "User-Agent": UA } });
  if (!cssRes.ok) {
    throw new Error(`Google Fonts CSS fetch failed (${cssRes.status}): ${cssUrl}`);
  }
  let css = await cssRes.text();

  // Find and inline every url(...) in the CSS. Google's CSS only emits
  // url("https://fonts.gstatic.com/...") for the woff2 sources.
  const urlRe = /url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^)'"]+)\1\)/g;
  const matches = Array.from(css.matchAll(urlRe));
  const fetched = new Map<string, string>();

  await Promise.all(
    matches.map(async (m) => {
      const url = m[2];
      if (fetched.has(url)) return;
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) {
        throw new Error(`woff2 fetch failed (${res.status}): ${url}`);
      }
      const buf = Buffer.from(await res.arrayBuffer());
      fetched.set(url, `data:font/woff2;base64,${buf.toString("base64")}`);
    }),
  );

  css = css.replace(urlRe, (_match, quote, url) => {
    const dataUri = fetched.get(url);
    return dataUri ? `url("${dataUri}")` : `url(${quote}${url}${quote})`;
  });

  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(cachePath, css, "utf-8");
  return css;
}

function buildGoogleFontsUrl(family: string, axes: string, display: string): string {
  // family is "Inter" or "JetBrains Mono"; URL needs '+' for spaces.
  const fam = encodeURIComponent(family).replace(/%20/g, "+");
  const spec = axes ? `${fam}:${axes}` : fam;
  return `https://fonts.googleapis.com/css2?family=${spec}&display=${encodeURIComponent(display)}`;
}

// ─── Theme fonts ────────────────────────────────────────────────

/**
 * Resolve the font faces a directory-form theme declares.
 *
 * Local `src` paths resolve against the theme's own directory, which is the
 * point of the directory form: the faces travel with the theme instead of
 * depending on where the document sits. Returns ready-to-emit CSS plus one
 * error per face that could not be loaded.
 */
export async function prefetchThemeFonts(
  theme: ResolvedTheme,
): Promise<{ css: string; diagnostics: Diagnostic[] }> {
  const faces = theme.fonts;
  if (!faces?.length || !theme.dir) return { css: "", diagnostics: [] };

  const blocks: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const vars: string[] = [];

  for (const face of faces) {
    const opts = {
      weight: face.weight,
      style: face.style,
      display: face.display,
    };
    try {
      if (face.src) {
        blocks.push(await loadLocalFontFile(face.family, face.src, theme.dir, opts));
      } else if (face.google !== undefined) {
        blocks.push(await loadGoogleFontSpec(face.family, face.google || "", opts));
      } else {
        throw new Error("needs either src or google");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diagnostics.push({
        severity: "error",
        message: `Theme "${theme.name}" font "${face.family}" could not be loaded: ${msg}`,
      });
      continue;
    }

    const stack = `${cssQuote(face.family)}, system-ui, -apple-system, sans-serif`;
    const monoStack = `${cssQuote(face.family)}, ui-monospace, monospace`;
    if (face.body) vars.push(`--poly-font-body: ${stack};`);
    if (face.heading) vars.push(`--poly-font-heading: ${stack};`);
    if (face.mono) vars.push(`--poly-font-mono: ${monoStack};`);
  }

  if (vars.length) {
    blocks.push(`.poly-document {\n  ${vars.join("\n  ")}\n}`);
  }

  return { css: blocks.join("\n"), diagnostics };
}
