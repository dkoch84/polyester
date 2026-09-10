import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "../../parser/parser.js";
import { compileToHtml } from "./compiler.js";
import { parseMargins } from "./components.js";

function compileDoc(source: string) {
  return compileToHtml(parse(source), { standalone: true });
}

function compile(source: string) {
  return compileToHtml(parse(source), { standalone: false });
}

/** Task 650. */
describe("base stylesheet specificity", () => {
  it("wraps base selectors in :where() so they carry no specificity", () => {
    const { css } = compile("# Hi\n");
    expect(css).toContain(":where(.poly-content) h1");
    expect(css).toContain(":where(.poly-document)");
    // The unwrapped forms are what a theme's plain `h1` rule used to lose to.
    expect(css).not.toMatch(/^\.poly-content h1/m);
  });

  it("declares inheritable typography on body, not on .poly-document", () => {
    const { css } = compile("# Hi\n");
    // A property set directly on .poly-document beats one inherited from body
    // at any specificity, so a plain body rule could never win while the base
    // declared the font there.
    const baseDoc = /:where\(\.poly-document\) \{([^}]*)\}/.exec(css);
    expect(baseDoc).not.toBeNull();
    expect(baseDoc![1]).not.toContain("font-family");

    const baseBody = /:where\(body\) \{([^}]*)\}/.exec(css);
    expect(baseBody).not.toBeNull();
    expect(baseBody![1]).toContain("font-family");
    expect(baseBody![1]).toContain("--poly-font-body");
  });

  it("puts document /style after component CSS so a document always wins", () => {
    const { css } = compile("/style {\n  h1 { color: red; }\n}\n\n/card {\nHi\n}\n");
    expect(css.indexOf("h1 { color: red; }")).toBeGreaterThan(css.indexOf(".poly-card"));
  });
});

/** Task 648. */
describe("/table markup", () => {
  const source = '/table --header {\n  A | B\n  1 | 2\n}\n';

  it("does not leak a poly-content wrapper into the table", () => {
    const { html } = compile(source);
    expect(html).not.toContain("poly-content");
    expect(html).not.toContain("<p");
  });

  it("emits balanced thead and tbody cells", () => {
    const { html } = compile(source);
    expect(html).toContain("<thead><tr><th style=\"\">A</th><th style=\"\">B</th></tr></thead>");
    expect(html).toContain("<tbody><tr><td style=\"\">1</td><td style=\"\">2</td></tr></tbody>");
  });

  it("renders inline markdown inside cells without wrapping them in a paragraph", () => {
    const { html } = compile('/table --header {\n  Name | Note\n  **Bold** | `code`\n}\n');
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("<code>code</code>");
    expect(html).not.toContain("<p>");
  });

  it("honours column alignment", () => {
    const { html } = compile('/table --header --align "lcr" {\n  A | B | C\n  1 | 2 | 3\n}\n');
    expect(html).toContain('text-align: left');
    expect(html).toContain('text-align: center');
    expect(html).toContain('text-align: right');
  });
});

/** Task 652. */
describe("/page --width", () => {
  it("carries a pageless paper width into page settings", () => {
    const { pageSettings, diagnostics } = compile("/page --pageless --width 1100px\n");
    expect(pageSettings.width).toBe("1100px");
    expect(diagnostics).toEqual([]);
  });

  it("treats a bare number as px", () => {
    expect(compile("/page --pageless --width 1100\n").pageSettings.width).toBe("1100px");
  });

  it("accepts physical units", () => {
    expect(compile("/page --pageless --width 25cm\n").pageSettings.width).toBe("25cm");
  });

  it("leaves the width unset when the document does not ask for one", () => {
    expect(compile("/page --pageless\n").pageSettings.width).toBeUndefined();
  });

  it("errors on a value that is not a length", () => {
    const { diagnostics, pageSettings } = compile('/page --pageless --width "wide"\n');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].severity).toBe("error");
    expect(diagnostics[0].message).toContain("not a length");
    expect(pageSettings.width).toBeUndefined();
  });
});

describe("paginated page background", () => {
  it("paints the sheet with the document background, not hardcoded white", () => {
    // A dark style set --poly-color-text on the content but never reached the
    // page sheet, so a paginated dark document rendered light text on white.
    const { html } = compileToHtml(parse("/page A4\n\n# Hi\n"), { standalone: true });
    expect(html).toContain("background:var(--poly-color-bg, white)");
    expect(html).not.toContain("'background:white'");
  });
});

/** Task 681. */
describe("page margins", () => {
  it("expands a CSS shorthand into four sides", () => {
    expect(parseMargins("2cm")).toEqual({ top: "2cm", right: "2cm", bottom: "2cm", left: "2cm" });
    expect(parseMargins("1cm 2cm")).toEqual({ top: "1cm", right: "2cm", bottom: "1cm", left: "2cm" });
    expect(parseMargins("1cm 2cm 3cm")).toEqual({ top: "1cm", right: "2cm", bottom: "3cm", left: "2cm" });
    expect(parseMargins("1cm 2cm 3cm 4cm")).toEqual({ top: "1cm", right: "2cm", bottom: "3cm", left: "4cm" });
  });

  it("rejects anything that is not 1-4 lengths", () => {
    expect(parseMargins("not-a-length")).toBeNull();
    expect(parseMargins("1cm 2cm 3cm 4cm 5cm")).toBeNull();
    expect(parseMargins("")).toBeNull();
  });

  it("never interpolates a raw shorthand into calc()", () => {
    // The original bug: `calc(210mm - 2 * 1.25cm 1.25cm 2.2cm 1.25cm)`. Invalid
    // at computed-value time, so the custom property silently never applied and
    // the page lost its width constraint in HTML as well as PDF.
    const { html } = compileDoc('/page A4 --margin "1.25cm 1.25cm 2.2cm 1.25cm"\n\n# H\n');
    expect(html).toContain("--poly-page-width: calc(210mm - 1.25cm - 1.25cm)");
    expect(html).toContain("--poly-page-height: calc(297mm - 1.25cm - 2.2cm)");
    expect(html).not.toMatch(/calc\([^)]*\d\s+\d/);
  });

  it("emits a whitespace split, not a literal 's', into the page sim", () => {
    // The sim is built inside a TS template literal, so a single-backslash \s is
    // eaten as an escape and ships as /s+/, which splits on the letter s. The
    // margin string contains no s, so all four sides parsed to 0 and every page
    // rendered with no padding at all while the CSS above looked correct.
    const { html } = compileDoc("/page A4 --margin 2cm\n\n# H\n");
    expect(html).toContain("split(/\\s+/)");
    expect(html).not.toContain("split(/s+/)");
  });
});

/** Task 678. */
describe("assets in pass-through HTML", () => {
  const fixtures = resolve(__dirname, "..", "..", "..", "test-fixtures-678");

  beforeAll(() => {
    mkdirSync(join(fixtures, "assets"), { recursive: true });
    writeFileSync(
      join(fixtures, "assets", "dot.svg"),
      '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="4"></svg>',
    );
  });
  afterAll(() => rmSync(fixtures, { recursive: true, force: true }));

  function compileIn(source: string) {
    return compileToHtml(parse(source), { standalone: true, sourceDir: fixtures });
  }

  it("inlines a relative src written as raw HTML", () => {
    // Every output path hands the document to the renderer via setContent with
    // no base URL, so rewriting the path cannot work: inlining is the only
    // mechanism that resolves in both HTML and PDF.
    const { html } = compileIn('/page A4\n\n<img src="assets/dot.svg" alt="d">\n');
    expect(html).toContain("src=\"data:image/svg+xml;base64,");
    expect(html).not.toContain('src="assets/dot.svg"');
  });

  it("warns rather than silently emitting a broken image", () => {
    const { diagnostics } = compileIn('/page A4\n\n<img src="assets/gone.svg">\n');
    const warning = diagnostics.find((d) => d.message.includes("image not found"));
    expect(warning?.severity).toBe("warning");
    // Naming the resolved path matters: paths resolve against the .poly file
    // rather than the cwd, which is the usual reason a correct-looking path fails.
    expect(warning?.message).toContain("assets/gone.svg");
  });

  it("leaves remote and data URIs alone", () => {
    const { html } = compileIn(
      '/page A4\n\n<img src="https://example.com/a.png">\n<img src="data:image/gif;base64,R0lGOD">\n',
    );
    expect(html).toContain('src="https://example.com/a.png"');
    expect(html).toContain('src="data:image/gif;base64,R0lGOD"');
  });
});

/** Task 682. */
describe("@page written by the document", () => {
  it("warns on paginated output, where it cannot take effect", () => {
    // Three emitters used to fight over @page and the document always lost, so
    // the rule was accepted, ignored, and never mentioned.
    const { diagnostics } = compileDoc("/page A4\n\n/style {\n  @page { margin-bottom: 2cm; }\n}\n\n# H\n");
    const warning = diagnostics.find((d) => d.message.includes("@page"));
    expect(warning?.severity).toBe("warning");
    // Naming the flag that does work is the point: without it the reader is
    // left knowing only that their CSS was discarded.
    expect(warning?.message).toContain("/page --margin");
  });

  it("stays quiet in web mode, where the browser really does honour @page", () => {
    const { diagnostics } = compileDoc("/style {\n  @page { margin: 1cm; }\n}\n\n# H\n");
    expect(diagnostics.find((d) => d.message.includes("@page"))).toBeUndefined();
  });

  it("stays quiet when the document writes no @page rule", () => {
    const { diagnostics } = compileDoc("/page A4\n\n/style { .x { color: red; } }\n\n# H\n");
    expect(diagnostics).toHaveLength(0);
  });
});
