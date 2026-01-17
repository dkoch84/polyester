/**
 * Polyester Parser
 *
 * Recursive descent parser that converts tokens into an AST.
 *
 * Grammar (simplified):
 *   document = (command | content)*
 *   command  = COMMAND args? block? pipes?
 *   args     = (flag | value)*
 *   block    = LBRACE (command | content)* RBRACE
 *   pipes    = (PIPE name args*)+
 *   content  = CONTENT
 */

import { Token, TokenType, tokenize } from "./tokenizer.js";
import {
  Document,
  Command,
  Block,
  Content,
  Argument,
  PositionalArg,
  FlagArg,
  Pipe,
  Location,
} from "./ast.js";

export class ParseError extends Error {
  constructor(
    message: string,
    public loc?: Location
  ) {
    super(message);
    this.name = "ParseError";
  }
}

export class Parser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Document {
    const children = this.parseChildren();
    return {
      type: "document",
      children,
    };
  }

  private parseChildren(): (Command | Content)[] {
    const children: (Command | Content)[] = [];

    while (!this.isAtEnd() && !this.check("RBRACE")) {
      if (this.check("COMMAND")) {
        children.push(this.parseCommand());
      } else if (this.check("CONTENT")) {
        children.push(this.parseContent());
      } else if (this.check("LBRACE")) {
        throw this.error("Unexpected { without command");
      } else {
        // Skip unexpected tokens
        this.advance();
      }
    }

    return children;
  }

  private parseCommand(): Command {
    const commandToken = this.consume("COMMAND", "Expected command name");
    const name = commandToken.value;
    const loc = commandToken.loc;

    // Parse arguments
    const args = this.parseArgs();

    // Parse optional block
    let block: Block | undefined;
    if (this.check("LBRACE")) {
      block = this.parseBlock();
    }

    // Parse optional pipes (for commands without blocks)
    let pipes: Pipe[] | undefined;
    if (!block && this.check("PIPE")) {
      pipes = this.parsePipes();
    }

    return {
      type: "command",
      name,
      args,
      block,
      pipes,
      loc,
    };
  }

  private parseArgs(): Argument[] {
    const args: Argument[] = [];

    while (!this.isAtEnd()) {
      // Stop at block start, pipe, or content/command
      if (
        this.check("LBRACE") ||
        this.check("PIPE") ||
        this.check("CONTENT") ||
        this.check("COMMAND") ||
        this.check("RBRACE")
      ) {
        break;
      }

      if (this.check("LONG_FLAG")) {
        const flag = this.advance();
        const value = this.parseOptionalValue();
        args.push({
          type: "flag",
          name: flag.value,
          short: false,
          value,
          loc: flag.loc,
        } as FlagArg);
      } else if (this.check("SHORT_FLAG")) {
        const flag = this.advance();
        const value = this.parseOptionalValue();
        args.push({
          type: "flag",
          name: flag.value,
          short: true,
          value,
          loc: flag.loc,
        } as FlagArg);
      } else if (this.check("VALUE") || this.check("STRING")) {
        const val = this.advance();
        args.push({
          type: "positional",
          value: val.value,
          loc: val.loc,
        } as PositionalArg);
      } else {
        break;
      }
    }

    return args;
  }

  private parseOptionalValue(): string | undefined {
    if (this.check("VALUE") || this.check("STRING")) {
      return this.advance().value;
    }
    return undefined;
  }

  private parseBlock(): Block {
    const lbrace = this.consume("LBRACE", "Expected {");
    const children = this.parseChildren();
    const rbrace = this.consume("RBRACE", "Expected }");

    return {
      type: "block",
      children,
      loc: {
        start: lbrace.loc.start,
        end: rbrace.loc.end,
      },
    };
  }

  private parsePipes(): Pipe[] {
    const pipes: Pipe[] = [];

    while (this.check("PIPE")) {
      this.advance(); // consume |

      // Pipe name
      const nameToken = this.consume("VALUE", "Expected pipe name after |");
      const name = nameToken.value;

      // Pipe args
      const args = this.parsePipeArgs();

      pipes.push({
        type: "pipe",
        name,
        args,
        loc: nameToken.loc,
      });
    }

    return pipes;
  }

  private parsePipeArgs(): Argument[] {
    const args: Argument[] = [];

    while (!this.isAtEnd()) {
      // Stop at next pipe, content, command, or brace
      if (
        this.check("PIPE") ||
        this.check("CONTENT") ||
        this.check("COMMAND") ||
        this.check("LBRACE") ||
        this.check("RBRACE")
      ) {
        break;
      }

      if (this.check("VALUE") || this.check("STRING")) {
        const val = this.advance();
        args.push({
          type: "positional",
          value: val.value,
          loc: val.loc,
        } as PositionalArg);
      } else {
        break;
      }
    }

    return args;
  }

  private parseContent(): Content {
    const token = this.consume("CONTENT", "Expected content");
    return {
      type: "content",
      value: token.value,
      loc: token.loc,
    };
  }

  // Helper methods
  private isAtEnd(): boolean {
    return this.peek().type === "EOF";
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private check(type: TokenType): boolean {
    return this.peek().type === type;
  }

  private advance(): Token {
    if (!this.isAtEnd()) {
      this.pos++;
    }
    return this.tokens[this.pos - 1];
  }

  private consume(type: TokenType, message: string): Token {
    if (this.check(type)) {
      return this.advance();
    }
    throw this.error(`${message}, got ${this.peek().type}`);
  }

  private error(message: string): ParseError {
    const token = this.peek();
    const loc = token.loc;
    return new ParseError(
      `${message} at line ${loc.start.line}, column ${loc.start.column}`,
      loc
    );
  }
}

export function parse(source: string): Document {
  const tokens = tokenize(source);
  const parser = new Parser(tokens);
  return parser.parse();
}
