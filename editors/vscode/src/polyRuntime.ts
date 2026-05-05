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

/**
 * Locate the polyester package root. Search order:
 *   1. VSIX install: <extensionPath>/vendor/polyester/
 *   2. Dev mode: walk up from __dirname to find a dir containing dist/index.js
 *   3. An open workspace folder containing dist/index.js
 */
export function findPolyRoot(extensionPath?: string): string | null {
  if (cachedRoot && fs.existsSync(path.join(cachedRoot, "dist", "index.js"))) {
    return cachedRoot;
  }

  const candidates: string[] = [];

  if (extensionPath) {
    candidates.push(path.join(extensionPath, "vendor", "polyester"));
  }

  // Walk up from __dirname (out/ in installed, out/ in dev) looking for dist/index.js
  let dir = __dirname;
  for (let i = 0; i < 6; i++) {
    candidates.push(dir);
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "dist", "index.js"))) {
      cachedRoot = c;
      return c;
    }
  }

  return null;
}

async function loadApi(extensionPath?: string): Promise<PolyApi> {
  if (cachedApi) return cachedApi;
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
