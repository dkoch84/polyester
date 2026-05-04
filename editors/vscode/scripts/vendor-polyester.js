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

fs.writeFileSync(
  path.join(vendorRoot, "package.json"),
  JSON.stringify({ name: "polyester", version: "bundled", type: "module", main: "dist/index.js" }, null, 2),
);

const bundleSize = (fs.statSync(path.join(vendorRoot, "dist", "index.js")).size / 1024).toFixed(1);
console.log(`Vendored polyester runtime → ${vendorRoot} (${bundleSize} KB)`);
