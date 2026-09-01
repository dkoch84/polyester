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
