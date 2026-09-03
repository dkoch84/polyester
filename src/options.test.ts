import { describe, it, expect } from "vitest";
import { assertKnownOptions } from "./options.js";
import { compilePolyDocument } from "./build.js";
import { compileToHtml } from "./backends/html/compiler.js";
import { parse } from "./parser/parser.js";

describe("assertKnownOptions", () => {
  it("accepts a known subset, including an empty object", () => {
    expect(() => assertKnownOptions({}, ["a", "b"], "fn")).not.toThrow();
    expect(() => assertKnownOptions({ a: 1 }, ["a", "b"], "fn")).not.toThrow();
  });

  it("names the offending key and the valid ones", () => {
    expect(() => assertKnownOptions({ nope: 1 }, ["a", "b"], "fn")).toThrow(
      /Unknown option for fn: "nope"\. Valid options: a, b\./,
    );
  });

  it("pluralizes when several are wrong", () => {
    expect(() => assertKnownOptions({ x: 1, y: 2 }, ["a"], "fn")).toThrow(/Unknown options for fn: "x", "y"/);
  });
});

describe("public entry points reject unknown options", () => {
  it("compilePolyDocument rejects an option it does not have", async () => {
    // The real case: compileToHtml takes `standalone`, this does not, and the
    // call used to succeed while quietly returning a standalone document.
    await expect(compilePolyDocument("# Hi\n", { standalone: false } as never)).rejects.toThrow(
      /Unknown option for compilePolyDocument: "standalone"/,
    );
  });

  it("compileToHtml rejects themeCss's near-miss", () => {
    expect(() => compileToHtml(parse("# Hi\n"), { theme: "corporate" } as never)).toThrow(
      /Unknown option for compileToHtml: "theme"/,
    );
  });

  it("leaves a valid call alone", async () => {
    const html = await compilePolyDocument("# Hi\n", { title: "T" });
    expect(html).toContain("<title>T</title>");
  });
});
