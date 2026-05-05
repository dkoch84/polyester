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

const CACHE_DIR = resolve(homedir(), ".cache", "polyester", "fonts");

// Chrome-ish UA so Google Fonts gives us woff2 (the smallest, widely-supported format).
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

export interface FontDecl {
  family: string;
  /** Pre-rendered @font-face CSS (one or more blocks, src already inlined). */
  css: string;
}

export type FontCache = Map<string, FontDecl>;

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
): Promise<FontCache> {
  const cache: FontCache = new Map();
  const fontCmds = collectFontCommands(doc);

  for (const cmd of fontCmds) {
    const family = getPositional(cmd, 0);
    if (!family) continue;
    const src = getFlag(cmd, "src");
    const google = getFlag(cmd, "google");

    try {
      if (typeof src === "string") {
        const css = await loadLocalFont(family, src, sourceDir, cmd);
        cache.set(fontCacheKey(family, `src:${src}`), { family, css });
      } else if (google !== undefined) {
        const axes = typeof google === "string" && google.length ? google : "";
        const css = await loadGoogleFont(family, axes, cmd);
        cache.set(fontCacheKey(family, `google:${axes}`), { family, css });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`⚠ /font "${family}" failed: ${msg}`);
    }
  }

  return cache;
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

async function loadLocalFont(
  family: string,
  src: string,
  sourceDir: string,
  cmd: Command,
): Promise<string> {
  const fontPath = isAbsolute(src) ? src : resolve(sourceDir, src);
  const data = await readFile(fontPath);
  const mime = mimeForExt(extname(fontPath));
  const format = formatForExt(extname(fontPath));
  const dataUri = `data:${mime};base64,${data.toString("base64")}`;

  const weight = (getFlag(cmd, "weight") as string) || "400";
  const style = (getFlag(cmd, "style") as string) || "normal";
  const display = (getFlag(cmd, "display") as string) || "swap";

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
  const display = (getFlag(cmd, "display") as string) || "swap";
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
