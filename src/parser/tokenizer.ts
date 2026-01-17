/**
 * Polyester Tokenizer
 *
 * Converts source text into tokens for the parser.
 *
 * Key insight: Commands start with `/` only when:
 * - At the start of a line (after newline or start of file)
 * - After `{`
 * - Not inside a quoted string
 *
 * Everything else is content (including `/` in URLs, etc.)
 */

import { Position, Location } from "./ast.js";

export type TokenType =
  | "COMMAND" // /name
  | "LBRACE" // {
  | "RBRACE" // }
  | "PIPE" // |
  | "LONG_FLAG" // --name
  | "SHORT_FLAG" // -n
  | "STRING" // "quoted" or 'quoted'
  | "VALUE" // unquoted value
  | "CONTENT" // text/markdown content
  | "NEWLINE" // \n
  | "EOF";

export interface Token {
  type: TokenType;
  value: string;
  loc: Location;
}

// Commands that should have their block content treated as raw text
const RAW_BLOCK_COMMANDS = new Set(["code", "style", "list"]);

export class Tokenizer {
  private source: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;
  private tokens: Token[] = [];

  // Track whether we can start a command (after newline, { or start)
  private canStartCommand: boolean = true;
  // Track whether we're in "command mode" (parsing a command line)
  private inCommandMode: boolean = false;
  // Current command name (for raw block detection)
  private currentCommand: string = "";

  constructor(source: string) {
    this.source = source;
  }

  tokenize(): Token[] {
    while (!this.isAtEnd()) {
      this.scanToken();
    }

    this.tokens.push({
      type: "EOF",
      value: "",
      loc: this.currentLocation(),
    });

    return this.tokens;
  }

  private scanToken(): void {
    const start = this.currentPosition();
    const char = this.peek();

    // Handle whitespace (except newlines)
    // Only skip whitespace when in command mode (between arguments)
    // At line start (canStartCommand=true), let scanContent capture it
    // so dedent can properly strip common indentation
    if (char === " " || char === "\t" || char === "\r") {
      if (this.inCommandMode || !this.canStartCommand) {
        this.advance();
        return;
      }
      // Fall through to scanContent to capture leading whitespace
    }

    // Newlines reset command start ability
    if (char === "\n") {
      this.advance();
      this.line++;
      this.column = 1;
      this.canStartCommand = true;
      this.inCommandMode = false;
      // Don't emit newline tokens for now, simplifies parsing
      return;
    }

    // Braces
    if (char === "{") {
      // Check if this is a raw block command (like /code or /style)
      if (RAW_BLOCK_COMMANDS.has(this.currentCommand)) {
        this.scanRawBlock(start);
        return;
      }
      this.advance();
      this.addToken("LBRACE", "{", start);
      this.canStartCommand = true;
      this.inCommandMode = false;
      return;
    }

    if (char === "}") {
      this.advance();
      this.addToken("RBRACE", "}", start);
      this.canStartCommand = true;
      this.inCommandMode = false;
      return;
    }

    // Command start: / at start of line or after {
    if (char === "/" && this.canStartCommand) {
      this.scanCommand(start);
      return;
    }

    // In command mode: parse flags, values, pipes, strings
    if (this.inCommandMode) {
      this.scanCommandPart(start);
      return;
    }

    // Otherwise, we're in content mode
    this.scanContent(start);
  }

  private scanCommand(start: Position): void {
    this.advance(); // consume /

    // Read command name
    let name = "";
    while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
      name += this.advance();
    }

    if (name === "") {
      throw this.error("Expected command name after /", start);
    }

    this.addToken("COMMAND", name, start);
    this.canStartCommand = false;
    this.inCommandMode = true;
    this.currentCommand = name;
  }

  private scanCommandPart(start: Position): void {
    const char = this.peek();

    // Pipe
    if (char === "|") {
      this.advance();
      this.addToken("PIPE", "|", start);
      return;
    }

    // Long flag: --name
    if (char === "-" && this.peekNext() === "-") {
      this.advance(); // -
      this.advance(); // -
      let name = "";
      while (!this.isAtEnd() && this.isIdentifierChar(this.peek())) {
        name += this.advance();
      }
      if (name === "") {
        throw this.error("Expected flag name after --", start);
      }
      this.addToken("LONG_FLAG", name, start);
      return;
    }

    // Short flag: -n
    if (char === "-" && this.isLetter(this.peekNext())) {
      this.advance(); // -
      const flag = this.advance();
      this.addToken("SHORT_FLAG", flag, start);
      return;
    }

    // Quoted string
    if (char === '"' || char === "'") {
      this.scanString(start);
      return;
    }

    // Opening brace ends command mode
    if (char === "{") {
      // Let the main scanner handle it
      this.inCommandMode = false;
      this.canStartCommand = true;
      return;
    }

    // Unquoted value (stops at whitespace, {, |, newline)
    if (this.isValueChar(char)) {
      let value = "";
      while (!this.isAtEnd() && this.isValueChar(this.peek())) {
        value += this.advance();
      }
      this.addToken("VALUE", value, start);
      return;
    }

    // Unknown character in command mode
    throw this.error(`Unexpected character '${char}' in command`, start);
  }

  /**
   * Scan a raw block for commands like /code and /style.
   * Content inside braces is treated as literal text, not tokenized.
   */
  private scanRawBlock(start: Position): void {
    this.advance(); // consume opening {
    this.addToken("LBRACE", "{", start);

    // Track brace nesting to find the matching closing brace
    let depth = 1;
    let content = "";
    const contentStart = this.currentPosition();

    while (!this.isAtEnd() && depth > 0) {
      const char = this.peek();

      if (char === "{") {
        depth++;
        content += this.advance();
      } else if (char === "}") {
        depth--;
        if (depth > 0) {
          content += this.advance();
        }
        // Don't consume the final } here, we'll handle it below
      } else if (char === "\n") {
        content += this.advance();
        this.line++;
        this.column = 1;
      } else {
        content += this.advance();
      }
    }

    // Trim only leading/trailing blank lines, preserving indentation structure
    // This allows dedent() in the compiler to work correctly
    const trimmedContent = this.trimBlankLines(content);
    if (trimmedContent.length > 0) {
      this.addToken("CONTENT", trimmedContent, contentStart);
    }

    // Consume and emit the closing brace
    if (!this.isAtEnd() && this.peek() === "}") {
      const closeStart = this.currentPosition();
      this.advance();
      this.addToken("RBRACE", "}", closeStart);
    }

    this.canStartCommand = true;
    this.inCommandMode = false;
    this.currentCommand = "";
  }

  private scanString(start: Position): void {
    const quote = this.advance(); // consume opening quote
    let value = "";

    while (!this.isAtEnd() && this.peek() !== quote) {
      if (this.peek() === "\\") {
        this.advance(); // consume backslash
        if (!this.isAtEnd()) {
          const escaped = this.advance();
          switch (escaped) {
            case "n":
              value += "\n";
              break;
            case "t":
              value += "\t";
              break;
            case "\\":
              value += "\\";
              break;
            case '"':
              value += '"';
              break;
            case "'":
              value += "'";
              break;
            default:
              value += escaped;
          }
        }
      } else if (this.peek() === "\n") {
        value += this.advance();
        this.line++;
        this.column = 1;
      } else {
        value += this.advance();
      }
    }

    if (this.isAtEnd()) {
      throw this.error("Unterminated string", start);
    }

    this.advance(); // consume closing quote
    this.addToken("STRING", value, start);
  }

  private scanContent(start: Position): void {
    let content = "";
    let inCodeFence = false;

    while (!this.isAtEnd()) {
      const char = this.peek();

      // Check for code fence start/end (```)
      if (char === "`" && this.canStartCommand && this.matchCodeFence()) {
        content += this.consumeCodeFence();
        inCodeFence = !inCodeFence;
        this.canStartCommand = false;
        continue;
      }

      // Inside code fence, consume everything until closing fence
      if (inCodeFence) {
        if (char === "\n") {
          content += this.advance();
          this.line++;
          this.column = 1;
          this.canStartCommand = true;
        } else {
          content += this.advance();
          this.canStartCommand = false;
        }
        continue;
      }

      // Handle inline code (single backticks) - consume until closing backtick
      if (char === "`") {
        content += this.advance(); // opening `
        while (!this.isAtEnd() && this.peek() !== "`" && this.peek() !== "\n") {
          content += this.advance();
        }
        if (this.peek() === "`") {
          content += this.advance(); // closing `
        }
        this.canStartCommand = false;
        continue;
      }

      // Stop at braces (only outside code)
      if (char === "{" || char === "}") {
        break;
      }

      // Check if / starts a command (at start of line, allowing leading whitespace)
      if (char === "/" && this.canStartCommand) {
        break;
      }

      // Newlines reset command start ability
      if (char === "\n") {
        content += this.advance();
        this.line++;
        this.column = 1;
        this.canStartCommand = true;
        continue;
      }

      // Whitespace at start of line doesn't prevent command detection
      if ((char === " " || char === "\t") && this.canStartCommand) {
        content += this.advance();
        continue;
      }

      content += this.advance();
      this.canStartCommand = false;
    }

    // Only emit content token if it contains non-whitespace
    if (content.trim().length > 0) {
      this.addToken("CONTENT", content, start);
    }
  }

  // Check if we're at the start of a code fence (```)
  private matchCodeFence(): boolean {
    return (
      this.source[this.pos] === "`" &&
      this.source[this.pos + 1] === "`" &&
      this.source[this.pos + 2] === "`"
    );
  }

  // Consume the code fence and any language identifier on the same line
  private consumeCodeFence(): string {
    let fence = "";
    // Consume the three backticks
    fence += this.advance(); // `
    fence += this.advance(); // `
    fence += this.advance(); // `

    // Consume any language identifier (until newline)
    while (!this.isAtEnd() && this.peek() !== "\n") {
      fence += this.advance();
    }

    return fence;
  }

  // Helper methods
  private isAtEnd(): boolean {
    return this.pos >= this.source.length;
  }

  private peek(): string {
    return this.source[this.pos] ?? "\0";
  }

  private peekNext(): string {
    return this.source[this.pos + 1] ?? "\0";
  }

  private advance(): string {
    const char = this.source[this.pos];
    this.pos++;
    this.column++;
    return char;
  }

  private isIdentifierChar(char: string): boolean {
    return /[a-zA-Z0-9_-]/.test(char);
  }

  private isLetter(char: string): boolean {
    return /[a-zA-Z]/.test(char);
  }

  private isValueChar(char: string): boolean {
    // Values stop at whitespace, braces, pipes, newlines
    return !/[\s{}\|\n]/.test(char);
  }

  private currentPosition(): Position {
    return {
      line: this.line,
      column: this.column,
      offset: this.pos,
    };
  }

  private currentLocation(): Location {
    const pos = this.currentPosition();
    return { start: pos, end: pos };
  }

  private addToken(type: TokenType, value: string, start: Position): void {
    this.tokens.push({
      type,
      value,
      loc: {
        start,
        end: this.currentPosition(),
      },
    });
  }

  private error(message: string, pos: Position): Error {
    return new Error(`${message} at line ${pos.line}, column ${pos.column}`);
  }

  /**
   * Trim only leading/trailing blank lines from content.
   * Unlike trim(), this preserves the indentation structure of the content.
   */
  private trimBlankLines(text: string): string {
    const lines = text.split("\n");

    // Remove leading blank lines
    while (lines.length > 0 && lines[0].trim() === "") {
      lines.shift();
    }

    // Remove trailing blank lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }

    return lines.join("\n");
  }
}

export function tokenize(source: string): Token[] {
  return new Tokenizer(source).tokenize();
}
