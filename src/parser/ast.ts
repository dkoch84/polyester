/**
 * Polyester AST Node Types
 *
 * A Polyester document consists of:
 * - Commands: /command args { block }
 * - Content: Plain text and Markdown
 * - Pipes: | transform
 */

export interface Position {
  line: number;
  column: number;
  offset: number;
}

export interface Location {
  start: Position;
  end: Position;
}

export interface BaseNode {
  type: string;
  loc?: Location;
}

// Root document node
export interface Document extends BaseNode {
  type: "document";
  children: (Command | Content)[];
}

// A command: /name args { block }
export interface Command extends BaseNode {
  type: "command";
  name: string;
  args: Argument[];
  block?: Block;
  pipes?: Pipe[];
}

// Command arguments
export type Argument = PositionalArg | FlagArg;

export interface PositionalArg extends BaseNode {
  type: "positional";
  value: string;
}

export interface FlagArg extends BaseNode {
  type: "flag";
  name: string;
  short: boolean; // -f vs --flag
  value?: string; // undefined for boolean flags
}

// A block: { children }
export interface Block extends BaseNode {
  type: "block";
  children: (Command | Content)[];
}

// Pipe transformation: | name args
export interface Pipe extends BaseNode {
  type: "pipe";
  name: string;
  args: Argument[];
}

// Text/Markdown content between commands
export interface Content extends BaseNode {
  type: "content";
  value: string;
  // Will be parsed as Markdown later
}

// Inline command within text (for pipes): "text" | bold
export interface InlineCommand extends BaseNode {
  type: "inline_command";
  text: string;
  pipes: Pipe[];
}

// Union of all node types
export type Node =
  | Document
  | Command
  | Block
  | Pipe
  | Content
  | InlineCommand
  | PositionalArg
  | FlagArg;

// Helper type guards
export function isCommand(node: Node): node is Command {
  return node.type === "command";
}

export function isContent(node: Node): node is Content {
  return node.type === "content";
}

export function isBlock(node: Node): node is Block {
  return node.type === "block";
}

// Helper to create nodes with location
export function createNode<T extends BaseNode>(
  type: T["type"],
  props: Omit<T, "type">,
  loc?: Location
): T {
  return { type, ...props, loc } as T;
}
