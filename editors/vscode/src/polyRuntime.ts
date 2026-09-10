/**
 * In-process Polyester runtime
 *
 * Locates the bundled or sibling Polyester package and exposes its
 * programmatic API via dynamic import. Avoids spawning the `poly` CLI
 * so the extension works on any platform without PATH lookups.
 */

import * as path from "path";
import * as fs from "fs";
import { pathToFileURL } from "url";

interface PolyApi {
  compilePolyDocument: (source: string, opts: {
    sourceDir?: string;
    title?: string;
    theme?: string;
    style?: string;
    spacing?: string;
  }) => Promise<string>;
  listLibrary: () => Array<{
    name: string;
    category: string;
    description: string;
    targets: string[];
    wrapperClass?: string;
    sampleMarkup?: string;
    css: string;
    fontImports?: string[];
  }>;
}

let cachedApi: PolyApi | undefined;
let cachedRoot: string | undefined;

// TypeScript's CommonJS target rewrites `import(x)` to `require(x)` which
// cannot load ESM. This Function constructor preserves the native dynamic
// import and keeps the ESM loader active.
const dynamicImport: (spec: string) => Promise<any> = new Function(
  "spec",
  "return import(spec)",
) as any;

/** Where a system package installs the polyester runtime. */
const SYSTEM_ROOTS = ["/usr/lib/polyester", "/usr/local/lib/polyester"];

/**
 * Locate the polyester package root. Search order, most authoritative first:
 *   1. POLYESTER_ROOT, for testing and for anyone pinning a specific build.
 *   2. Dev mode: walk up from __dirname for a checkout containing dist/index.js.
 *   3. A system package (/usr/lib/polyester), which tracks the CLI by construction.
 *   4. The vendored bundle shipped inside the extension.
 *
 * The vendored copy is deliberately LAST. It is a snapshot taken whenever the
 * extension was last packaged, so it ages independently of the compiler it
 * claims to preview: a published extension pins a compiler generation, and any
 * fix landed in the CLI never reaches preview users until the extension is
 * rebuilt and republished. That is not hypothetical. A cascade fix (base heading
 * rules moving to :where(), so a document's own rule wins on colour) shipped in
 * the CLI in September while installed extensions kept rendering a June bundle,
 * so previews disagreed with builds for three months with nothing reporting it.
 * Preferring a real install means an upgrade fixes the preview by construction.
 */
export function findPolyRoot(extensionPath?: string): string | null {
  if (cachedRoot && fs.existsSync(path.join(cachedRoot, "dist", "index.js"))) {
    return cachedRoot;
  }

  const candidates: string[] = [];

  if (process.env.POLYESTER_ROOT) {
    candidates.push(process.env.POLYESTER_ROOT);
  }

  // Walk up from __dirname (out/ in installed, out/ in dev) looking for
  // dist/index.js. This only resolves when the extension is loaded from a
  // checkout, so it gives a developer their working tree and is inert for an
  // installed VSIX.
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    candidates.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  candidates.push(...SYSTEM_ROOTS);

  if (extensionPath) {
    candidates.push(path.join(extensionPath, "vendor", "polyester"));
  }

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "dist", "index.js"))) {
      cachedRoot = c;
      return c;
    }
  }

  return null;
}

/** What the resolved runtime is, and where it came from. */
export interface RuntimeInfo {
  root: string;
  kind: "env" | "checkout" | "system" | "vendored";
  version: string;
  commit?: string;
  dirty?: boolean;
  vendoredAt?: string;
}

/**
 * Identify the runtime that would actually be used.
 *
 * Worth having because the failure this guards against is invisible from
 * outside: an extension can be at the version it claims while the compiler
 * inside it is months behind, so "which polyester is this preview using?" has
 * to be answerable without bisecting bundles.
 */
export function describeRuntime(extensionPath?: string): RuntimeInfo | null {
  const root = findPolyRoot(extensionPath);
  if (!root) return null;

  let kind: RuntimeInfo["kind"] = "checkout";
  if (process.env.POLYESTER_ROOT && root === process.env.POLYESTER_ROOT) kind = "env";
  else if (SYSTEM_ROOTS.includes(root)) kind = "system";
  else if (root.includes(path.join("vendor", "polyester"))) kind = "vendored";

  let version = "unknown";
  let stamp: Record<string, unknown> = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    version = pkg.version ?? "unknown";
    stamp = pkg.polyesterBundle ?? {};
  } catch {
    // A runtime with no readable package.json still works; it just cannot
    // identify itself, which is the state this whole mechanism exists to end.
  }

  return {
    root,
    kind,
    version,
    commit: stamp.commit as string | undefined,
    dirty: stamp.dirty as boolean | undefined,
    vendoredAt: stamp.vendoredAt as string | undefined,
  };
}

async function loadApi(extensionPath?: string): Promise<PolyApi> {
  if (cachedApi) return cachedApi;
  const info = describeRuntime(extensionPath);
  if (info) {
    const provenance = info.commit
      ? ` (${info.commit.slice(0, 8)}${info.dirty ? "-dirty" : ""})`
      : "";
    console.log(`[polyester] runtime: ${info.kind} ${info.version}${provenance} at ${info.root}`);
    if (info.kind === "vendored") {
      // Not an error: the bundle is the intended fallback. But it is a snapshot
      // frozen at package time, so it cannot track compiler fixes, and saying so
      // is cheaper than the alternative of finding out from a wrong render.
      console.warn(
        "[polyester] using the bundled runtime snapshot; install the polyester package " +
          "so previews track the compiler instead of the last packaged build",
      );
    }
  }
  const root = findPolyRoot(extensionPath);
  if (!root) {
    throw new Error(
      "Polyester runtime not found. Install the extension properly or ensure dist/index.js exists at the project root.",
    );
  }
  const entry = pathToFileURL(path.join(root, "dist", "index.js")).href;
  cachedApi = (await dynamicImport(entry)) as PolyApi;
  return cachedApi;
}

/** Compile a Polyester source string to a full standalone HTML document. */
export async function compile(
  source: string,
  opts: { sourceDir?: string; title?: string; theme?: string; style?: string; spacing?: string } = {},
  extensionPath?: string,
): Promise<string> {
  const api = await loadApi(extensionPath);
  return api.compilePolyDocument(source, opts);
}

/** List all bundled library items. */
export async function listLibraryItems(extensionPath?: string) {
  const api = await loadApi(extensionPath);
  return api.listLibrary();
}

/** Get the path to the library/ directory colocated with the polyester package. */
export function findLibraryRoot(extensionPath?: string): string | null {
  const root = findPolyRoot(extensionPath);
  if (!root) return null;
  const lib = path.join(root, "library");
  return fs.existsSync(lib) ? lib : null;
}
