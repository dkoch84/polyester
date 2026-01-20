#!/usr/bin/env node

/**
 * Polyester Language Server
 *
 * Provides IDE features for .poly files:
 * - Diagnostics (parse errors, unknown commands)
 * - Autocomplete (commands, flags)
 * - Hover information
 */

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeParams,
  InitializeResult,
  TextDocumentSyncKind,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkupKind,
  Diagnostic,
  DiagnosticSeverity,
  Position,
} from "vscode-languageserver/node.js";

import { TextDocument } from "vscode-languageserver-textdocument";
import { parse, ParseError } from "../parser/parser.js";
import { COMMAND_DOCS, getCommandCompletions, getFlagCompletions, getCommandHoverDoc } from "./completions.js";

/**
 * Designer-friendly glossary data for hover tooltips
 */
const UNIT_GLOSSARY: Record<string, { term: string; short: string; full: string; example?: string }> = {
  px: {
    term: "Pixels",
    short: "Screen dots",
    full: "Pixels are the tiny dots that make up your screen. 16px is about one line of text.",
    example: "16px = body text, 24px = small heading, 48px = large heading",
  },
  rem: {
    term: "Root Em",
    short: "Text-size units",
    full: "Relative to base text size (usually 16px). 1rem = base size, 2rem = double.",
    example: "1rem ≈ 16px, 1.5rem ≈ 24px, 2rem ≈ 32px",
  },
  em: {
    term: "Em",
    short: "Parent-relative size",
    full: "Relative to the parent's text size. Scales with surrounding text.",
    example: "1em = same as parent, 0.5em = half, 2em = double",
  },
  "%": {
    term: "Percent",
    short: "Fraction of container",
    full: "Percentage of the containing element's size.",
    example: "50% = half, 100% = full width",
  },
  vh: {
    term: "Viewport Height",
    short: "% of screen height",
    full: "Percentage of the browser window height. 100vh = full screen height.",
    example: "100vh = full screen, 50vh = half screen",
  },
  vw: {
    term: "Viewport Width",
    short: "% of screen width",
    full: "Percentage of the browser window width. 100vw = full screen width.",
    example: "100vw = full screen width",
  },
  cm: {
    term: "Centimeters",
    short: "Real-world cm",
    full: "Physical centimeters. Best for print documents.",
    example: "2.54cm = 1 inch",
  },
  mm: {
    term: "Millimeters",
    short: "Real-world mm",
    full: "Physical millimeters. 10mm = 1cm.",
  },
  pt: {
    term: "Points",
    short: "Print points (1/72 inch)",
    full: "Traditional typographic points. Same as point sizes in Illustrator/InDesign.",
    example: "12pt = typical body text, 72pt = 1 inch",
  },
};

const HTML_ELEMENT_GLOSSARY: Record<string, { term: string; short: string; full: string }> = {
  h1: { term: "Heading 1", short: "Main title", full: "The main title/headline. Biggest, most important heading." },
  h2: { term: "Heading 2", short: "Section title", full: "Second-level heading for major sections." },
  h3: { term: "Heading 3", short: "Subsection title", full: "Third-level heading for subsections." },
  h4: { term: "Heading 4", short: "Minor heading", full: "Fourth-level heading for minor sections." },
  h5: { term: "Heading 5", short: "Small heading", full: "Fifth-level heading, rarely used." },
  h6: { term: "Heading 6", short: "Smallest heading", full: "Sixth-level heading, the smallest." },
  p: { term: "Paragraph", short: "Body text", full: "Standard paragraph text for body content." },
  body: { term: "Body", short: "Entire document", full: "The whole document. Styles here affect everything." },
  div: { term: "Division", short: "Container", full: "A generic container for grouping content." },
  span: { term: "Span", short: "Inline wrapper", full: "Inline text wrapper, doesn't create a new line." },
  a: { term: "Anchor", short: "Link", full: "A hyperlink that users can click." },
  ul: { term: "Unordered List", short: "Bullet list", full: "A bulleted list." },
  ol: { term: "Ordered List", short: "Numbered list", full: "A numbered list." },
  li: { term: "List Item", short: "List entry", full: "One item in a list." },
  blockquote: { term: "Block Quote", short: "Quote block", full: "A highlighted quotation block." },
  pre: { term: "Preformatted", short: "Code block", full: "Fixed-width text preserving spaces." },
  code: { term: "Code", short: "Inline code", full: "Inline code in monospace font." },
};

const CSS_PROPERTY_GLOSSARY: Record<string, { term: string; short: string; full: string }> = {
  margin: { term: "Margin", short: "Space outside", full: "Empty space around the outside. Pushes other elements away." },
  padding: { term: "Padding", short: "Space inside", full: "Space between content and border. Like internal cushioning." },
  gap: { term: "Gap", short: "Space between items", full: "Space between items in a grid/column layout. Like gutters." },
  "border-radius": { term: "Border Radius", short: "Corner roundness", full: "How rounded the corners are. 0 = sharp, higher = rounder." },
  "font-size": { term: "Font Size", short: "Text size", full: "The size of the text." },
  "font-weight": { term: "Font Weight", short: "Boldness", full: "How bold the text is. 400 = normal, 700 = bold." },
  "line-height": { term: "Line Height", short: "Line spacing", full: "Vertical space between lines. 1.5 = comfortable reading." },
  "letter-spacing": { term: "Letter Spacing", short: "Character spacing", full: "Space between letters. Like tracking in InDesign." },
  color: { term: "Color", short: "Text color", full: "The color of the text." },
  "background-color": { term: "Background Color", short: "Fill color", full: "The background fill color." },
  background: { term: "Background", short: "Background fill", full: "Background color, gradient, or image." },
  border: { term: "Border", short: "Edge line", full: "A line around the element (width, style, color)." },
  width: { term: "Width", short: "Horizontal size", full: "The horizontal size of an element." },
  height: { term: "Height", short: "Vertical size", full: "The vertical size of an element." },
  "text-align": { term: "Text Align", short: "Alignment", full: "Horizontal alignment: left, center, right, justify." },
  opacity: { term: "Opacity", short: "Transparency", full: "How transparent. 1 = solid, 0 = invisible." },
  "box-shadow": { term: "Box Shadow", short: "Drop shadow", full: "Shadow effect around the element." },
  transform: { term: "Transform", short: "Rotate/scale/move", full: "Transform: rotate, scale, translate, skew." },
};

// Create connection using Node IPC
const connection = createConnection(ProposedFeatures.all);

// Document manager
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize((params: InitializeParams): InitializeResult => {
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        triggerCharacters: ["/", "-", " "],
        resolveProvider: false,
      },
      hoverProvider: true,
    },
  };
});

// Validate document on open and change
documents.onDidChangeContent((change) => {
  validateDocument(change.document);
});

/**
 * Validate a document and send diagnostics
 */
function validateDocument(document: TextDocument): void {
  const text = document.getText();
  const diagnostics: Diagnostic[] = [];

  try {
    // Try to parse the document
    const ast = parse(text);

    // Check for unknown commands
    for (const node of ast.children) {
      if (node.type === "command") {
        if (!COMMAND_DOCS[node.name]) {
          // Use location if available
          let range = {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          };

          if (node.loc) {
            range = {
              start: { line: node.loc.start.line - 1, character: node.loc.start.column - 1 },
              end: { line: node.loc.end.line - 1, character: node.loc.end.column - 1 },
            };
          }

          diagnostics.push({
            severity: DiagnosticSeverity.Warning,
            range,
            message: `Unknown command: /${node.name}`,
            source: "polyester",
          });
        }
      }
    }
  } catch (err) {
    if (err instanceof ParseError) {
      // Convert parse error to diagnostic
      let range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 10 },
      };

      if (err.loc) {
        range = {
          start: { line: err.loc.start.line - 1, character: err.loc.start.column - 1 },
          end: { line: err.loc.end.line - 1, character: err.loc.end.column },
        };
      }

      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range,
        message: err.message,
        source: "polyester",
      });
    } else {
      // Unknown error
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 1 },
        },
        message: `Parse error: ${(err as Error).message}`,
        source: "polyester",
      });
    }
  }

  // Send diagnostics to client
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

/**
 * Provide completions
 */
connection.onCompletion((params): CompletionItem[] => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const text = document.getText();
  const offset = document.offsetAt(params.position);

  // Get current line up to cursor
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineText = text.slice(lineStart, offset);

  // Check if we're after a command and should suggest flags
  const commandMatch = lineText.match(/^(\s*)\/(\w+)\s+(.*)$/);
  if (commandMatch) {
    const commandName = commandMatch[2];
    const afterCommand = commandMatch[3];

    // If typing a flag (starts with -)
    if (afterCommand.match(/-\w*$/)) {
      return getFlagCompletions(commandName);
    }
  }

  // Check if starting a command (line starts with / or just typed /)
  if (lineText.match(/^\s*\/?$/) || lineText.endsWith("/")) {
    return getCommandCompletions();
  }

  return [];
});

/**
 * Provide hover information
 */
connection.onHover((params): Hover | null => {
  const document = documents.get(params.textDocument.uri);
  if (!document) return null;

  const text = document.getText();
  const offset = document.offsetAt(params.position);
  const position = params.position;

  // Get the current line
  const lineStart = text.lastIndexOf("\n", offset - 1) + 1;
  const lineEnd = text.indexOf("\n", offset);
  const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
  const charInLine = offset - lineStart;

  // Check for unit values (e.g., 2rem, 16px, 50%)
  const unitHover = getUnitHover(line, charInLine);
  if (unitHover) {
    return unitHover;
  }

  // Check if we're in a /style block for HTML element and CSS property hovers
  const styleBlockCheck = isInStyleBlock(text, offset);
  if (styleBlockCheck) {
    // Check for HTML element selectors (h1, h2, p, etc.)
    const elementHover = getHtmlElementHover(line, charInLine);
    if (elementHover) {
      return elementHover;
    }

    // Check for CSS properties
    const propertyHover = getCssPropertyHover(line, charInLine);
    if (propertyHover) {
      return propertyHover;
    }
  }

  // Find if we're hovering over a command
  // Look backward and forward for command boundaries
  let start = offset;
  let end = offset;

  // Find start of potential command
  while (start > 0 && text[start - 1] !== "/" && text[start - 1] !== "\n") {
    start--;
  }

  // Check if this is a command
  if (start > 0 && text[start - 1] === "/") {
    start--; // Include the /

    // Find end of command name
    end = start + 1;
    while (end < text.length && /\w/.test(text[end])) {
      end++;
    }

    const commandText = text.slice(start, end);
    const match = commandText.match(/^\/(\w+)$/);

    if (match) {
      const commandName = match[1];
      const hoverDoc = getCommandHoverDoc(commandName);

      if (hoverDoc) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `### /${commandName}\n\n${hoverDoc}`,
          },
        };
      }
    }
  }

  return null;
});

/**
 * Check if cursor is inside a /style block
 */
function isInStyleBlock(text: string, offset: number): boolean {
  // Look backwards for /style command
  const beforeCursor = text.slice(0, offset);
  const styleMatch = beforeCursor.lastIndexOf("/style");
  if (styleMatch === -1) return false;

  // Check if there's an opening brace after /style and before cursor
  const afterStyle = text.slice(styleMatch, offset);
  const openBrace = afterStyle.indexOf("{");
  if (openBrace === -1) return false;

  // Count braces to see if we're still inside
  let depth = 0;
  for (let i = styleMatch; i < offset; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;
  }
  return depth > 0;
}

/**
 * Get hover info for CSS units
 */
function getUnitHover(line: string, charPos: number): Hover | null {
  // Match number + unit patterns
  const unitPattern = /(\d+(?:\.\d+)?)(px|rem|em|%|vh|vw|cm|mm|pt|in)\b/g;
  let match;

  while ((match = unitPattern.exec(line)) !== null) {
    const start = match.index;
    const end = start + match[0].length;

    if (charPos >= start && charPos <= end) {
      const value = match[1];
      const unit = match[2];
      const glossary = UNIT_GLOSSARY[unit] || UNIT_GLOSSARY["%"];

      if (glossary) {
        let markdown = `### ${glossary.term} (${unit})\n\n`;
        markdown += `${glossary.full}\n\n`;

        // Add calculated value for rem
        if (unit === "rem") {
          const numValue = parseFloat(value);
          markdown += `**${value}${unit}** ≈ ${Math.round(numValue * 16)}px\n\n`;
        }

        if (glossary.example) {
          markdown += `*Examples: ${glossary.example}*`;
        }

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdown,
          },
        };
      }
    }
  }

  return null;
}

/**
 * Get hover info for HTML elements in style blocks
 */
function getHtmlElementHover(line: string, charPos: number): Hover | null {
  // Match element selectors like "h1 {", "p {", "body {"
  const elementPattern = /\b(h[1-6]|p|body|div|span|a|ul|ol|li|blockquote|pre|code)\s*\{/g;
  let match;

  while ((match = elementPattern.exec(line)) !== null) {
    const element = match[1];
    const start = match.index;
    const end = start + element.length;

    if (charPos >= start && charPos <= end) {
      const glossary = HTML_ELEMENT_GLOSSARY[element];

      if (glossary) {
        let markdown = `### ${glossary.term} (\`<${element}>\`)\n\n`;
        markdown += `${glossary.full}\n\n`;
        markdown += `*In Polyester, this styles ${glossary.short.toLowerCase()} elements.*`;

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdown,
          },
        };
      }
    }
  }

  return null;
}

/**
 * Get hover info for CSS properties
 */
function getCssPropertyHover(line: string, charPos: number): Hover | null {
  // Match CSS properties like "margin:", "padding:", "border-radius:"
  const propertyPattern = /\b(margin|padding|gap|border-radius|font-size|font-weight|line-height|letter-spacing|color|background-color|background|border|width|height|text-align|opacity|box-shadow|transform)(?:\s*:)/g;
  let match;

  while ((match = propertyPattern.exec(line)) !== null) {
    const property = match[1];
    const start = match.index;
    const end = start + property.length;

    if (charPos >= start && charPos <= end) {
      const glossary = CSS_PROPERTY_GLOSSARY[property];

      if (glossary) {
        let markdown = `### ${glossary.term}\n\n`;
        markdown += `${glossary.full}`;

        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: markdown,
          },
        };
      }
    }
  }

  return null;
}

// Start listening
documents.listen(connection);
connection.listen();
