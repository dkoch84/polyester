import { describe, it, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "./parser/parser.js";
import { compileToHtml } from "./backends/html/compiler.js";
import { prefetchFonts } from "./backends/html/fonts.js";
import { hasErrors, assertNoErrors, PolyBuildError } from "./diagnostics.js";
import { ThemeError, loadStyle, loadSpacing, resolveTheme, tryResolveModules } from "./themes/loader.js";
import { DEFAULT_STYLE } from "./themes/types.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("build diagnostics", () => {
  it("reports an unknown command as an error, once", () => {
    const { diagnostics } = compileToHtml(parse('/fnot "x"\n\n# Hi\n'));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("/fnot");
    expect(diagnostics[0].line).toBe(1);
  });

  it("reports no diagnostics for a valid document", () => {
    const { diagnostics } = compileToHtml(parse("# Hello\n\nSome **text**.\n"));
    expect(diagnostics).toEqual([]);
  });

  it("errors when /font names no source", () => {
    const { diagnostics } = compileToHtml(parse('/font "Helvetica Neue" --body\n'));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    // The old message asked "did the prefetch step run?", which an author
    // cannot act on. It has to name the missing flags instead.
    expect(diagnostics[0].message).toMatch(/--src|--google/);
  });

  it("errors once per unloadable /font, not once per compile pass", async () => {
    const doc = parse(
      '/font "A" --src "no-a.woff2" --body\n/font "B" --src "no-b.woff2" --heading\n',
    );
    const { cache, diagnostics: fontDiagnostics } = await prefetchFonts(doc, repoRoot);

    expect(fontDiagnostics).toHaveLength(2);
    expect(fontDiagnostics.every((d) => d.severity === "error")).toBe(true);
    expect(fontDiagnostics[0].message).toContain("ENOENT");

    // The component must stay silent about a font the prefetch pass already
    // reported, or every failure is stated twice with the vaguer message last.
    const { diagnostics } = compileToHtml(doc, { fontCache: cache });
    expect(diagnostics).toEqual([]);
  });

  it("throws PolyBuildError on errors and passes warnings through", () => {
    expect(() => assertNoErrors([{ severity: "error", message: "boom", line: 3 }])).toThrow(
      PolyBuildError,
    );
    expect(() => assertNoErrors([{ severity: "warning", message: "hmm" }])).not.toThrow();

    try {
      assertNoErrors([{ severity: "error", message: "boom", line: 3 }]);
    } catch (err) {
      expect((err as PolyBuildError).message).toContain("boom");
      expect((err as PolyBuildError).message).toContain("line 3");
      expect((err as PolyBuildError).diagnostics).toHaveLength(1);
    }
  });

  it("hasErrors ignores warnings", () => {
    expect(hasErrors([{ severity: "warning", message: "hmm" }])).toBe(false);
    expect(hasErrors([{ severity: "error", message: "boom" }])).toBe(true);
  });
});

/**
 * A named theme that does not resolve used to warn and render the built-in
 * default at exit 0, which is the same silent style substitution as a font
 * falling back: the document is wrong and the build says it succeeded.
 */
describe("theme resolution", () => {
  it("throws ThemeError for an unknown theme, style or spacing name", () => {
    expect(() => resolveTheme("no-such-theme")).toThrow(ThemeError);
    expect(() => loadStyle("no-such-style")).toThrow(ThemeError);
    expect(() => loadSpacing("no-such-spacing")).toThrow(ThemeError);
  });

  it("names the available options in the error", () => {
    // A typo is the common case, so the error has to be a menu, not a denial.
    expect(() => loadStyle("corporat")).toThrow(/corporate/);
    expect(() => loadSpacing("compct")).toThrow(/compact/);
  });

  it("still resolves built-ins and defaults", () => {
    expect(loadStyle("corporate").colors.primary).toBeDefined();
    expect(loadSpacing("compact").base).toBeDefined();
    expect(resolveTheme("default").name).toBe("default");
  });

  it("collects the failure and falls back so the rest of the build still reports", () => {
    const { resolved, diagnostics } = tryResolveModules({ theme: "no-such-theme" });

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("no-such-theme");
    // Defaults, so the caller can finish compiling and report every other
    // problem in the same run instead of stopping at the first.
    expect(resolved.style.colors.primary).toBe(DEFAULT_STYLE.colors.primary);
  });

  it("reports nothing for a resolvable request", () => {
    const { diagnostics } = tryResolveModules({ style: "minimal", spacing: "compact" });
    expect(diagnostics).toEqual([]);
  });
});
