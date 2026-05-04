/**
 * Polyester Design Library
 *
 * Loads `.polystyle` manifests from the bundled library and from user-provided
 * paths, and exposes a resolver used by the `/import` component.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export interface PolyStyle {
  name: string;
  category: string;
  description: string;
  /** Component names this style targets (e.g. ["card"], ["hero"]). */
  targets: string[];
  /** CSS class users should apply (via /region --class or directly). */
  wrapperClass?: string;
  /** Example Polyester markup showing the style in use. */
  sampleMarkup?: string;
  /** Raw CSS injected when the item is imported. */
  css: string;
  /** Optional Google-Font family names needed by this item. */
  fontImports?: string[];
}

// ─── Library root discovery ─────────────────────────────────────

function libraryRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dist/library/index.js → ../../library
  const candidates = [
    // Bundled runtime (VS Code extension): vendor/polyester/dist/index.js → ../library
    resolve(here, "..", "library"),
    resolve(here, "..", "..", "library"),
    resolve(here, "..", "..", "..", "library"),
    resolve(process.cwd(), "library"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return candidates[0];
}

// ─── Resolvers ──────────────────────────────────────────────────

/**
 * Resolve an import reference to an absolute file path.
 *
 * Supported forms:
 *   "@library/<category>/<name>"   — bundled item
 *   "./rel/path.polystyle"          — relative to `fromDir`
 *   "/abs/path.polystyle"           — absolute path
 */
export function resolveStyleRef(ref: string, fromDir: string): string | null {
  if (ref.startsWith("@library/")) {
    const rest = ref.slice("@library/".length);
    const withExt = rest.endsWith(".polystyle") ? rest : rest + ".polystyle";
    const abs = join(libraryRoot(), withExt);
    return existsSync(abs) ? abs : null;
  }
  const path = isAbsolute(ref) ? ref : resolve(fromDir, ref);
  return existsSync(path) ? path : null;
}

export function loadStyle(absPath: string): PolyStyle {
  const raw = readFileSync(absPath, "utf-8");
  const obj = JSON.parse(raw);
  if (!obj.name || !obj.css) {
    throw new Error(`Invalid polystyle at ${absPath}: missing name or css`);
  }
  return obj as PolyStyle;
}

// ─── Library listing (for MCP + UI) ─────────────────────────────

export function listLibrary(): PolyStyle[] {
  const root = libraryRoot();
  if (!existsSync(root)) return [];
  const items: PolyStyle[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (entry.endsWith(".polystyle")) {
        try { items.push(loadStyle(full)); } catch {}
      }
    }
  }
  walk(root);
  return items.sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
}
