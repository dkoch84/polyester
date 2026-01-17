import { describe, it, expect } from "vitest";
import { tokenize } from "./tokenizer.js";
import { parse } from "./parser.js";

describe("Tokenizer", () => {
  it("tokenizes a simple command", () => {
    const tokens = tokenize("/page A4");
    expect(tokens.map((t) => t.type)).toEqual(["COMMAND", "VALUE", "EOF"]);
    expect(tokens[0].value).toBe("page");
    expect(tokens[1].value).toBe("A4");
  });

  it("tokenizes flags", () => {
    const tokens = tokenize("/page --margin 2cm -p 1cm");
    expect(tokens.map((t) => t.type)).toEqual([
      "COMMAND",
      "LONG_FLAG",
      "VALUE",
      "SHORT_FLAG",
      "VALUE",
      "EOF",
    ]);
    expect(tokens[1].value).toBe("margin");
    expect(tokens[3].value).toBe("p");
  });

  it("tokenizes quoted strings", () => {
    const tokens = tokenize('/text "Hello World"');
    expect(tokens.map((t) => t.type)).toEqual(["COMMAND", "STRING", "EOF"]);
    expect(tokens[1].value).toBe("Hello World");
  });

  it("tokenizes blocks", () => {
    const tokens = tokenize("/columns { content }");
    expect(tokens.map((t) => t.type)).toEqual([
      "COMMAND",
      "LBRACE",
      "CONTENT",
      "RBRACE",
      "EOF",
    ]);
  });

  it("tokenizes content with embedded slashes", () => {
    const tokens = tokenize("Visit https://example.com for more info");
    expect(tokens.map((t) => t.type)).toEqual(["CONTENT", "EOF"]);
    expect(tokens[0].value).toContain("https://example.com");
  });

  it("recognizes commands only at line start", () => {
    const tokens = tokenize(`some text
/command here`);
    expect(tokens.map((t) => t.type)).toEqual([
      "CONTENT",
      "COMMAND",
      "VALUE",
      "EOF",
    ]);
  });

  it("tokenizes pipes", () => {
    const tokens = tokenize("/text hello | bold | color red");
    expect(tokens.map((t) => t.type)).toEqual([
      "COMMAND",
      "VALUE",
      "PIPE",
      "VALUE",
      "PIPE",
      "VALUE",
      "VALUE",
      "EOF",
    ]);
  });
});

describe("Parser", () => {
  it("parses an empty document", () => {
    const ast = parse("");
    expect(ast.type).toBe("document");
    expect(ast.children).toEqual([]);
  });

  it("parses a simple command", () => {
    const ast = parse("/page A4");
    expect(ast.children.length).toBe(1);
    expect(ast.children[0].type).toBe("command");

    const cmd = ast.children[0] as any;
    expect(cmd.name).toBe("page");
    expect(cmd.args.length).toBe(1);
    expect(cmd.args[0].type).toBe("positional");
    expect(cmd.args[0].value).toBe("A4");
  });

  it("parses flags", () => {
    const ast = parse("/page --margin 2cm -p 1cm");
    const cmd = ast.children[0] as any;
    expect(cmd.args.length).toBe(2);

    expect(cmd.args[0].type).toBe("flag");
    expect(cmd.args[0].name).toBe("margin");
    expect(cmd.args[0].short).toBe(false);
    expect(cmd.args[0].value).toBe("2cm");

    expect(cmd.args[1].type).toBe("flag");
    expect(cmd.args[1].name).toBe("p");
    expect(cmd.args[1].short).toBe(true);
    expect(cmd.args[1].value).toBe("1cm");
  });

  it("parses boolean flags", () => {
    const ast = parse("/text --bold");
    const cmd = ast.children[0] as any;
    expect(cmd.args[0].type).toBe("flag");
    expect(cmd.args[0].name).toBe("bold");
    expect(cmd.args[0].value).toBeUndefined();
  });

  it("parses blocks", () => {
    const ast = parse("/columns { content here }");
    const cmd = ast.children[0] as any;
    expect(cmd.block).toBeDefined();
    expect(cmd.block.type).toBe("block");
    expect(cmd.block.children.length).toBe(1);
    expect(cmd.block.children[0].type).toBe("content");
  });

  it("parses nested commands", () => {
    const ast = parse(`/columns {
  /text "Hello"
}`);
    const cmd = ast.children[0] as any;
    expect(cmd.block.children.length).toBe(1);
    expect(cmd.block.children[0].type).toBe("command");
    expect(cmd.block.children[0].name).toBe("text");
  });

  it("parses content", () => {
    const ast = parse("Just some markdown **content** here.");
    expect(ast.children.length).toBe(1);
    expect(ast.children[0].type).toBe("content");
    expect((ast.children[0] as any).value).toContain("markdown **content**");
  });

  it("parses mixed content and commands", () => {
    const ast = parse(`# Heading

Some intro text.

/hero {
  ## Welcome
}

More text.`);

    // Content before command is one block, command, then content after
    expect(ast.children.length).toBe(3);
    expect(ast.children[0].type).toBe("content"); // # Heading + Some intro text
    expect(ast.children[1].type).toBe("command"); // /hero
    expect((ast.children[1] as any).name).toBe("hero");
    expect(ast.children[2].type).toBe("content"); // More text
  });

  it("parses pipes", () => {
    const ast = parse("/text hello | bold | color red");
    const cmd = ast.children[0] as any;
    expect(cmd.pipes).toBeDefined();
    expect(cmd.pipes.length).toBe(2);
    expect(cmd.pipes[0].name).toBe("bold");
    expect(cmd.pipes[1].name).toBe("color");
    expect(cmd.pipes[1].args[0].value).toBe("red");
  });

  it("parses complex document", () => {
    const source = `/page A4 --margin 2cm

/columns 2 -g 1.5cm {
  ## The Journey Begins

  Lorem ipsum dolor sit amet.

  /quote --style pull "The only way out is through."

  More content here.
}`;

    const ast = parse(source);
    expect(ast.children.length).toBe(2);

    // First command: /page
    const page = ast.children[0] as any;
    expect(page.name).toBe("page");
    expect(page.args[0].value).toBe("A4");
    expect(page.args[1].name).toBe("margin");

    // Second command: /columns with block
    const columns = ast.children[1] as any;
    expect(columns.name).toBe("columns");
    expect(columns.args[0].value).toBe("2");
    expect(columns.args[1].name).toBe("g");
    expect(columns.block).toBeDefined();

    // Block contains content and a nested command
    const block = columns.block;
    expect(block.children.length).toBe(3);
    expect(block.children[0].type).toBe("content"); // ## heading + lorem
    expect(block.children[1].type).toBe("command"); // /quote
    expect(block.children[2].type).toBe("content"); // More content
  });
});
