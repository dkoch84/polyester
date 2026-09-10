import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Browser } from "puppeteer";
import { launchBrowser } from "../../browser.js";
import { compilePolyDocument } from "../../build.js";

/**
 * Task 683: /header and /footer.
 *
 * The contract is not "the content repeats". `position: fixed` already
 * repeated, and it anchored to the content box, so a footer's rule drew
 * straight through whatever block landed at the bottom of a page. The contract
 * is that the band RESERVES ITS SPACE: the flow stops short of it.
 *
 * Asserted by measuring rendered geometry, because every part of this is a
 * layout property. A markup assertion would pass against a build that renders
 * the band directly on top of the text.
 */

const BODY = Array.from(
  { length: 60 },
  (_, i) => `Paragraph ${i + 1} with enough text to push the flow across several pages.`,
).join("\n\n");

let browser: Browser;
beforeAll(async () => { browser = await launchBrowser(); }, 60_000);
afterAll(async () => { await browser?.close(); });

/** Paginate a document and report per-page band geometry. */
async function layout(bands: string) {
  const html = await compilePolyDocument(`/page A4 --margin 2cm\n\n${bands}\n\n${BODY}\n`, {
    sourceDir: process.cwd(),
    title: "bands",
  });
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1400, height: 2000 });
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () =>
        (document.querySelector(".poly-document[data-page-size]") as HTMLElement | null)
          ?.dataset.paginated === "1",
      { timeout: 15000 },
    );
    return await page.evaluate(() => {
      const pages = [...document.querySelectorAll(".poly-page")];
      return {
        pageCount: pages.length,
        headers: document.querySelectorAll(".poly-page-header").length,
        footers: document.querySelectorAll(".poly-page-footer").length,
        // Worst-case intrusion of flow content into the footer band, in px.
        // Positive means something is drawn on top of the footer.
        worstFooterOverlap: Math.max(
          ...pages.map((p) => {
            const band = p.querySelector(".poly-page-footer");
            const blocks = [...p.querySelectorAll(".poly-page-flow > *")];
            if (!band || blocks.length === 0) return -Infinity;
            const bandTop = band.getBoundingClientRect().top;
            return Math.max(...blocks.map((b) => b.getBoundingClientRect().bottom - bandTop));
          }),
        ),
      };
    });
  } finally {
    await page.close();
  }
}

describe("/header and /footer", () => {
  it("repeats the band on every page", async () => {
    const r = await layout("/footer {\n**Confidential**\n}");
    expect(r.pageCount).toBeGreaterThan(1);
    expect(r.footers).toBe(r.pageCount);
  }, 90_000);

  it("keeps flow content out of the footer band on every page", async () => {
    // The band is anchored to the page, not to the flow, and the pagination
    // tolerance (which permits overflow past the nominal content height) is
    // reserved alongside it. Both are needed: while the band lived inside the
    // content box it moved down with each subtraction and the overlap survived.
    const r = await layout("/footer {\n**Confidential**\n}");
    expect(r.worstFooterOverlap).toBeLessThanOrEqual(0);
  }, 90_000);

  it("supports a header and a footer together", async () => {
    const r = await layout("/header {\nAcme\n}\n\n/footer {\n**Confidential**\n}");
    expect(r.headers).toBe(r.pageCount);
    expect(r.footers).toBe(r.pageCount);
    expect(r.worstFooterOverlap).toBeLessThanOrEqual(0);
  }, 90_000);

  it("costs the flow nothing when the band fits inside the margin", async () => {
    // A band that fits in the margin is free: the margin already reserved that
    // space. Charging the full band height again would silently shorten every
    // page for no reason.
    const plain = await layout("");
    const withHeader = await layout("/header {\nAcme\n}");
    expect(withHeader.pageCount).toBe(plain.pageCount);
  }, 120_000);
});
