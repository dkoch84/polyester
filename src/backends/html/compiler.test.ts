import { describe, it, expect } from "vitest";
import { parse } from "../../parser/parser.js";
import { compileToHtml } from "./compiler.js";

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
