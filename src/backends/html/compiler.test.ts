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
