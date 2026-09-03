import { describe, it, expect } from "vitest";
import { parse } from "../parser/parser.js";
import { compileToHtml } from "../backends/html/compiler.js";
import { describeUnknownFlag } from "./registry.js";

function build(source: string) {
  return compileToHtml(parse(source), { standalone: false });
}

describe("unknown flags", () => {
  it("fails the build, naming the valid flags", () => {
    const { diagnostics } = build("/code --lang bash {\necho hi\n}\n");

    const problem = diagnostics.find((d) => d.message.includes("--lang"));
    expect(problem?.severity).toBe("error");
    expect(problem?.message).toContain("--language");
    expect(problem?.line).toBe(1);
  });

  it("lists short forms by their long name", () => {
    // /code declares -l for --lines; reporting it as --l would be a flag that
    // does not exist.
    const message = describeUnknownFlag("code", "nope")!;
    expect(message).toContain("--lines");
    expect(message).not.toContain("--l,");
  });

  it("says nothing about a component that is not in the registry", () => {
    expect(describeUnknownFlag("notacomponent", "anything")).toBeNull();
  });

  it("catches a flag on a command nested in a block", () => {
    const { diagnostics } = build('/region {\n/frame --margin 0 {\ncontent\n}\n}\n');
    expect(diagnostics.some((d) => d.message.includes("--margin"))).toBe(true);
  });
});

describe("named form of a positional argument", () => {
  it("accepts the argument's name as a flag", () => {
    const named = build("/code --language bash {\necho hi\n}\n");
    const positional = build("/code bash {\necho hi\n}\n");

    expect(named.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(named.html).toBe(positional.html);
  });

  it("leaves an explicit positional alone", () => {
    const { html } = build("/code bash {\necho hi\n}\n");
    expect(html).toContain("language-bash");
  });
});
