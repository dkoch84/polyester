#!/usr/bin/env node
/**
 * Build reference guide .poly files to HTML
 *
 * Compiles all .poly files in reference/ to out/reference/
 * for use by the VS Code extension.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const REFERENCE_DIR = path.join(__dirname, "..", "reference");
const OUT_DIR = path.join(__dirname, "..", "out", "reference");
const CLI_PATH = path.join(__dirname, "..", "..", "..", "dist", "cli", "index.js");

// Ensure output directory exists
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

// Get all .poly files
const polyFiles = fs.readdirSync(REFERENCE_DIR).filter(f => f.endsWith(".poly"));

console.log(`Building ${polyFiles.length} reference files...`);

for (const file of polyFiles) {
  const inputPath = path.join(REFERENCE_DIR, file);
  const outputPath = path.join(OUT_DIR, file.replace(".poly", ".html"));

  try {
    execSync(`node "${CLI_PATH}" build "${inputPath}" -o "${outputPath}"`, {
      stdio: "pipe"
    });
    console.log(`  ✓ ${file} → ${path.basename(outputPath)}`);
  } catch (error) {
    console.error(`  ✗ ${file}: ${error.message}`);
    process.exit(1);
  }
}

console.log("Done!");
