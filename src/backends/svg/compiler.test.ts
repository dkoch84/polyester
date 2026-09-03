import { describe, it, expect } from "vitest";
import { parse } from "../../parser/parser.js";
import { compileToSvg } from "./compiler.js";

function compile(source: string) {
  return compileToSvg(parse(source)).svg;
}

describe("code block whitespace", () => {
  it("preserves whitespace in highlighted tokens", () => {
    const svg = compile('/code polyester {\n/command positional --flag value\n}\n');

    // Tokens carry significant leading/trailing spaces and are positioned with an
    // absolute x that assumes every character is drawn. Without xml:space the SVG
    // whitespace rules strip those spaces and adjacent tokens render jammed
    // together ("/commandpositional").
    for (const tag of svg.match(/<text[^>]*>[^<]* [^<]*<\/text>/g) ?? []) {
      expect(tag).toContain('xml:space="preserve"');
    }
  });

  it("preserves leading indentation in unhighlighted code", () => {
    const svg = compile('/code json {\n{\n  "a": 1\n}\n}\n');

    const indented = svg.match(/<text[^>]*>\s+"a": 1<\/text>/)?.[0];
    expect(indented).toBeDefined();
    expect(indented).toContain('xml:space="preserve"');
  });
});
