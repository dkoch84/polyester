/**
 * MCP Resources
 *
 * Static and template resources exposing Polyester knowledge to LLMs.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

// ─── Syntax Guide ──────────────────────────────────────────────

export const SYNTAX_GUIDE = `# Polyester Syntax Guide

Polyester is a document authoring language that uses \`/command\` syntax with Markdown content.

## Basic Structure

A Polyester document is a mix of commands and Markdown content:

\`\`\`polyester
/page A4 --margin 2cm

# Hello World

This is regular **Markdown** content.

/columns 2 {
  Left column content.

  Right column content.
}
\`\`\`

## Commands

Commands start with \`/\` at the beginning of a line:

\`\`\`
/command arg1 "arg2 with spaces" --flag value { block content }
\`\`\`

### Arguments

- **Positional**: \`/page A4\` — \`A4\` is the first positional argument
- **Quoted**: \`/text "Hello World"\` — quotes allow spaces
- **Flags**: \`--name value\` or \`-n value\` — named parameters
- **Boolean flags**: \`--landscape\` — flags without values are boolean true

### Blocks

Blocks contain nested commands or Markdown:

\`\`\`polyester
/card --icon rocket {
  ## Card Title
  Card content with **Markdown** support.

  /button primary "Click me"
}
\`\`\`

### Pipes

Transform chains using \`|\`:

\`\`\`polyester
/text "Hello" | bold | color red
\`\`\`

Pipes are syntactic sugar — \`| bold\` is equivalent to adding \`--bold\`, and \`| color red\` adds \`--color red\`.

## Markdown

Between commands, standard Markdown is rendered normally:

- Headings (\`#\`, \`##\`, \`###\`)
- Bold (\`**text**\`), Italic (\`*text*\`)
- Links (\`[text](url)\`)
- Lists, tables (GitHub Flavored Markdown)
- Code blocks, inline code
- Images (\`![alt](url)\`)

## Page Setup

Always start documents with \`/page\` to set size and margins:

\`\`\`polyester
/page A4 --margin 2cm
/page letter --landscape
/page --pageless
\`\`\`

## Design Theming

Polyester has a composable design system with three modules:
- **Style**: colors, fonts, borders, shadows, hero appearance
- **Spacing**: density, gaps, margins, padding
- **Syntax**: code block syntax highlighting colors

Apply via \`/page\` flags or CLI:

\`\`\`polyester
/page A4 --theme acme
/page A4 --style corporate --spacing compact
\`\`\`

CLI: \`poly build doc.poly --style corporate --spacing compact\`

Built-in styles: default, corporate, minimal, playful, dark
Built-in spacing: compact, default, spacious

## File Extension

\`.poly\` files
`;

// ─── Examples loader ───────────────────────────────────────────

export function getExamplesDir(): string {
  // Look relative to this file's location in dist/
  const candidates = [
    join(__dirname, "..", "..", "examples"),     // dist/mcp/ → examples/
    join(process.cwd(), "examples"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) { return dir; }
  }
  return "";
}

export function listExamples(): string[] {
  const dir = getExamplesDir();
  if (!dir) { return []; }
  return readdirSync(dir).filter(f => f.endsWith(".poly")).map(f => basename(f, ".poly"));
}

export function readExample(name: string): string | null {
  const dir = getExamplesDir();
  if (!dir) { return null; }
  const filePath = join(dir, `${name}.poly`);
  if (!existsSync(filePath)) { return null; }
  return readFileSync(filePath, "utf-8");
}
