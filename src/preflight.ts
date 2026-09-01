/**
 * Entry point launcher.
 *
 * Every binary is a thin module that hands its real entry point to `launch`.
 * That indirection is the whole point: ESM resolves and links a module's static
 * imports before any of its code runs, so a missing dependency crashes before a
 * check inside the module could ever execute. Loading the real entry point
 * dynamically puts a try/catch around linking.
 *
 * The failure this exists for: `poly` is usually a global symlink into a
 * checkout, so an absent node_modules there breaks the command everywhere with
 * `Cannot find package 'unified'`. Over stdio it is worse, because the MCP
 * client never completes a handshake and the user sees only
 * `MCP error -32000: Connection closed`, which names neither the package nor
 * the directory.
 */

import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Walk up from a starting directory to the nearest package.json. */
function findPackageRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function isModuleNotFound(err: unknown): err is Error & { code?: string } {
  if (!(err instanceof Error)) return false;
  const code = (err as { code?: string }).code;
  return code === "ERR_MODULE_NOT_FOUND" || /Cannot find (package|module)/.test(err.message);
}

/**
 * Load and run a binary's real entry point, turning a dependency-resolution
 * failure into a message that names the fix.
 *
 * @param moduleUrl `import.meta.url` of the calling launcher, used to locate
 *   the installation whose dependencies are missing.
 * @param load Imports the real entry point.
 */
export async function launch(moduleUrl: string, load: () => Promise<unknown>): Promise<void> {
  try {
    await load();
  } catch (err) {
    if (!isModuleNotFound(err)) throw err;

    const root = findPackageRoot(dirname(fileURLToPath(moduleUrl)));
    const missing = /'([^']+)'/.exec((err as Error).message)?.[1];

    // stderr, not stdout: for the MCP server stdout is the JSON-RPC channel.
    console.error(
      `Error: Polyester's dependencies are not installed${missing ? ` (missing "${missing}")` : ""}.`,
    );
    if (root) {
      console.error(`Run: npm install --prefix ${root}`);
      console.error(`Then: npm run build --prefix ${root}`);
    } else {
      console.error("Run 'npm install' in the Polyester checkout.");
    }
    console.error(
      "A globally linked 'poly' points into that checkout, so this breaks the command everywhere.",
    );
    process.exit(1);
  }
}
