#!/usr/bin/env node
/**
 * Copy the polyester package's dist/ and library/ directories into
 * editors/vscode/vendor/polyester/ so the VSIX ships a self-contained
 * in-process Polyester runtime.
 */

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const repoRoot = path.resolve(__dirname, "..", "..", "..");
const vendorRoot = path.resolve(__dirname, "..", "vendor", "polyester");

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

fs.rmSync(vendorRoot, { recursive: true, force: true });
fs.mkdirSync(path.join(vendorRoot, "dist"), { recursive: true });

// Bundle the polyester programmatic API into a single ESM file with all
// dependencies inlined. Excludes puppeteer (PDF still uses the CLI) and
// other runtime-only deps not reachable from the compile/library paths.
esbuild.buildSync({
  entryPoints: [path.join(repoRoot, "dist", "index.js")],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
  outfile: path.join(vendorRoot, "dist", "index.js"),
  external: ["puppeteer", "vscode-languageserver", "vscode-languageserver-textdocument", "@modelcontextprotocol/sdk"],
  logLevel: "warning",
});

copyDir(path.join(repoRoot, "library"), path.join(vendorRoot, "library"));
// Ship the lucide-static icons dir so in-process renders can embed SVG icons.
copyDir(
  path.join(repoRoot, "node_modules", "lucide-static", "icons"),
  path.join(vendorRoot, "icons"),
);

// Stamp the snapshot with what it actually is.
//
// This used to write `version: "bundled"`, which made a vendored copy
// unidentifiable: there was no way to tell a fresh bundle from one four months
// stale, and the extension manifest's own version kept matching the repo the
// whole time. That is exactly how a June compiler kept rendering previews while
// the CLI had moved on since September, with nothing reporting it.
//
// A stamp that cannot move at the rate the artifact moves is worse than none at
// all, because a confident wrong version stops people looking. So this records
// the source tree state, not a literal.
function gitOutput(args, fallback) {
  try {
    return require("child_process")
      .execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim();
  } catch {
    return fallback;
  }
}

const sourceVersion = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
).version;
const commit = gitOutput(["rev-parse", "HEAD"], "unknown");
const dirty = gitOutput(["status", "--porcelain"], "") !== "";

fs.writeFileSync(
  path.join(vendorRoot, "package.json"),
  JSON.stringify(
    {
      name: "polyester",
      version: sourceVersion,
      type: "module",
      main: "dist/index.js",
      polyesterBundle: {
        vendoredAt: new Date().toISOString(),
        sourceVersion,
        commit,
        // A bundle built from a dirty tree matches no commit, so `commit` alone
        // would overstate its provenance.
        dirty,
      },
    },
    null,
    2,
  ),
);

const bundleSize = (fs.statSync(path.join(vendorRoot, "dist", "index.js")).size / 1024).toFixed(1);
console.log(`Vendored polyester runtime → ${vendorRoot} (${bundleSize} KB)`);
