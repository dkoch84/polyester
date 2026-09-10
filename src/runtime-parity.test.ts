import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { Browser } from "puppeteer";
import { launchBrowser } from "./browser.js";

/**
 * Cascade parity across every compiler generation this project can ship through.
 *
 * The bug this pins: between June and September the base heading rule moved from
 * `.poly-content h1` (0,1,1) to `:where(.poly-content) h1` (0,0,1). At (0,1,1) it
 * beat a user's own `.brand` rule at (0,1,0), so a heading the document coloured
 * white rendered in the theme's heading colour instead.
 *
 * Two things make this test catch that where the obvious version does not:
 *
 *  1. It asserts the COMPUTED colour in a real page, not the presence of a rule.
 *     The user's rule survived into the broken output byte-identical; it simply
 *     lost the cascade. Any grep-the-HTML assertion goes green on a blue render.
 *
 *  2. It runs against every runtime present on disk, not just `dist/`. The bug
 *     lived in the bundle the VS Code preview resolves, which no suite exercised,
 *     so `dist/` stayed correct for three months while the preview was wrong.
 */

/** A compiler generation this project can render through. */
interface Runtime {
  label: string;
  entry: string;
}

function discoverRuntimes(): Runtime[] {
  const repoRoot = resolve(__dirname, "..");
  const found: Runtime[] = [];

  // The CLI / public API. Always required: it is what `poly build` renders with.
  found.push({ label: "repo dist (CLI)", entry: join(repoRoot, "dist", "index.js") });

  // The bundle vendored into the extension source tree.
  const vendored = join(repoRoot, "editors", "vscode", "vendor", "polyester", "dist", "index.js");
  if (existsSync(vendored)) found.push({ label: "repo vendor (extension source)", entry: vendored });

  // The system package, which is the only copy carrying a real version.
  const system = "/usr/lib/polyester/dist/index.js";
  if (existsSync(system)) found.push({ label: "system package (/usr/lib/polyester)", entry: system });

  // Whatever is actually installed, which is what a preview resolves in normal
  // use. This is the one that was wrong, and the one nothing was watching.
  //
  // Highest version only: VS Code can leave an old version directory behind
  // through an upgrade, and asserting over every match would report a stale
  // leftover as a failure that looks exactly like the bug this pins but isn't.
  const extRoot = join(homedir(), ".vscode", "extensions");
  if (existsSync(extRoot)) {
    const installed = readdirSync(extRoot)
      .filter((dir) => dir.includes("polyester"))
      .map((dir) => ({ dir, entry: join(extRoot, dir, "vendor", "polyester", "dist", "index.js") }))
      .filter(({ entry }) => existsSync(entry))
      .sort((a, b) => versionOf(b.dir).localeCompare(versionOf(a.dir), undefined, { numeric: true }));

    if (installed.length > 0) {
      found.push({ label: `installed ${installed[0].dir}`, entry: installed[0].entry });
    }
  }

  return found;
}

/** Trailing semver from an extension directory name, e.g. `…-vscode-0.4.0`. */
function versionOf(dir: string): string {
  return /-(\d+(?:\.\d+)*)$/.exec(dir)?.[1] ?? "0";
}

/**
 * Theme-independent on purpose: the heading colour is declared inline rather than
 * pulled from a user theme, so the fixture asserts the same contract on a machine
 * with no themes configured.
 */
const FIXTURE = `/page A4

/style {
  :root { --poly-color-heading: #4b6cf9; }
  .brand { color: #ffffff; }
}

# Unstyled Heading

<h1 class="brand">Branded Heading</h1>
`;

const WHITE = "rgb(255, 255, 255)";
const BRAND = "rgb(75, 108, 249)";

const runtimes = discoverRuntimes();
let browser: Browser;

beforeAll(async () => {
  browser = await launchBrowser();
}, 60_000);

afterAll(async () => {
  await browser?.close();
});

async function computedHeadingColours(entry: string): Promise<{ styled: string; unstyled: string }> {
  const mod = await import(pathToFileURL(entry).href);
  const html = await mod.compilePolyDocument(FIXTURE, { sourceDir: process.cwd(), title: "parity" });

  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    return await page.evaluate(() => {
      const pick = (el: Element | null) =>
        el ? getComputedStyle(el).color : "(element not found)";
      const headings = Array.from(document.querySelectorAll("h1"));
      return {
        styled: pick(document.querySelector("h1.brand")),
        unstyled: pick(headings.find((h) => !h.classList.contains("brand")) ?? null),
      };
    });
  } finally {
    await page.close();
  }
}

describe("cascade parity across shipped runtimes", () => {
  it("discovers at least the CLI runtime", () => {
    expect(runtimes.length).toBeGreaterThan(0);
    expect(existsSync(runtimes[0].entry)).toBe(true);
  });

  for (const { label, entry } of runtimes) {
    describe(label, () => {
      it("lets a document's own rule win over the base heading colour", async () => {
        const { styled } = await computedHeadingColours(entry);
        expect(styled).toBe(WHITE);
      }, 60_000);

      // Without this, dropping heading colour from the base sheet entirely would
      // "fix" the test above while silently unstyling every document.
      it("still applies the theme heading colour to an unstyled heading", async () => {
        const { unstyled } = await computedHeadingColours(entry);
        expect(unstyled).toBe(BRAND);
      }, 60_000);
    });
  }
});
