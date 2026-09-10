import { describe, it, expect } from "vitest";
import { compileDocument } from "./tools.js";

/**
 * Task 677: compile_document used to call compileToHtml with no theme modules
 * at all, so a document declaring `/page A4 --theme <name>` came back with the
 * palette entirely absent and no warning. The compile succeeded.
 *
 * That mattered more than a normal defect because the server's own instructions
 * tell agents to author and validate through it: a visual check performed there
 * could not see anything a theme controls, while appearing to pass.
 *
 * Assertions here avoid naming a specific theme. Themes live in user config, so
 * a test that expected a particular palette would be testing whose machine it
 * ran on rather than the contract.
 */
describe("compile_document theme resolution", () => {
  /** Definitions, not the `var(--poly-color-x, fallback)` references in the base sheet. */
  const definedTokens = (html: string) =>
    [...new Set(html.match(/--poly-color-[a-z-]+:/g) ?? [])];

  it("emits palette token definitions, which it previously omitted entirely", () => {
    const result = compileDocument("/page A4\n\n# Heading\n\nBody.\n");
    expect(result.isError).toBeFalsy();
    expect(definedTokens(result.content[0].text).length).toBeGreaterThan(0);
  });

  it("reports which theme resolved, instead of leaving machine state invisible", () => {
    // Reading user config makes output depend on the machine. The honest answer
    // is to say which state was used, not to pretend there is none.
    const result = compileDocument("/page A4\n\n# Heading\n");
    expect(result.content).toHaveLength(2);
    expect(result.content[1].text).toMatch(/theme/i);
  });

  it("keeps the HTML as the first content block", () => {
    // Callers write content[0] straight to a file; the note is appended so it
    // cannot corrupt that.
    const result = compileDocument("/page A4\n\n# Heading\n");
    expect(result.content[0].text.trimStart()).toMatch(/^<!DOCTYPE html>/i);
  });

  it("refuses an unresolved theme name rather than falling back silently", () => {
    // Handing back a document in the wrong design is the defect this call
    // exists to avoid, so a bad name is an error and not a default.
    const result = compileDocument("/page A4 --theme definitely-not-a-real-theme\n\n# H\n");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("definitely-not-a-real-theme");
  });

  it("still refuses a document with compile errors", () => {
    const result = compileDocument("/page A4 --margin not-a-length\n\n# H\n");
    expect(result.isError).toBe(true);
  });
});
