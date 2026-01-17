/**
 * HTML Backend Compiler
 *
 * Compiles Polyester AST to HTML + CSS.
 */

import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkRehype from "remark-rehype";
import rehypeHighlight from "rehype-highlight";
import rehypeStringify from "rehype-stringify";
import {
  Document,
  Command,
  Content,
  Block,
  Argument,
  isCommand,
  isContent,
  isBlock,
} from "../../parser/ast.js";
import { components, ComponentContext, ComponentResult } from "./components.js";

// Create reusable Markdown processor with syntax highlighting
const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm) // GitHub Flavored Markdown: tables, strikethrough, etc.
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeHighlight, { detect: true }) // Auto-detect language if not specified
  .use(rehypeStringify, { allowDangerousHtml: true });

export interface CompileOptions {
  /** Include full HTML document wrapper */
  standalone?: boolean;
  /** Custom CSS to include */
  customCss?: string;
  /** Document title (for standalone mode) */
  title?: string;
}

export interface CompileResult {
  html: string;
  css: string;
}

export class HtmlCompiler {
  private options: CompileOptions;
  private cssClasses: Set<string> = new Set();
  private customStyles: string[] = [];

  constructor(options: CompileOptions = {}) {
    this.options = {
      standalone: true,
      ...options,
    };
  }

  compile(doc: Document): CompileResult {
    // Reset state
    this.cssClasses = new Set();
    this.customStyles = [];

    // Compile document body
    const bodyHtml = this.compileChildren(doc.children);

    // Generate CSS
    const css = this.generateCss();

    // Build final HTML
    let html: string;
    if (this.options.standalone) {
      html = this.wrapStandalone(bodyHtml, css);
    } else {
      html = bodyHtml;
    }

    return { html, css };
  }

  private compileChildren(children: (Command | Content)[]): string {
    return children.map((child) => this.compileNode(child)).join("\n");
  }

  private compileNode(node: Command | Content): string {
    if (isContent(node)) {
      return this.compileContent(node);
    }
    if (isCommand(node)) {
      return this.compileCommand(node);
    }
    return "";
  }

  private compileContent(content: Content): string {
    const text = this.dedent(content.value).trim();
    if (!text) return "";

    // Convert Markdown to HTML using remark
    const html = this.renderMarkdown(text);
    return `<div class="poly-content">${html}</div>`;
  }

  /**
   * Remove common leading indentation from all lines.
   * This prevents indented block content from being treated as code blocks.
   */
  private dedent(text: string): string {
    const lines = text.split("\n");

    // Find minimum indentation (ignoring empty lines)
    let minIndent = Infinity;
    for (const line of lines) {
      if (line.trim() === "") continue;
      const match = line.match(/^(\s*)/);
      if (match) {
        minIndent = Math.min(minIndent, match[1].length);
      }
    }

    if (minIndent === Infinity || minIndent === 0) {
      return text;
    }

    // Remove the common indentation from all lines
    return lines.map(line => line.slice(minIndent)).join("\n");
  }

  private compileCommand(cmd: Command): string {
    const component = components[cmd.name];

    if (!component) {
      console.warn(`Unknown command: /${cmd.name}`);
      return `<!-- Unknown command: /${cmd.name} -->`;
    }

    // Build context - merge pipe args into main args
    const args = this.parseArgs(cmd.args);

    // Apply pipes as additional args/transforms
    if (cmd.pipes) {
      for (const pipe of cmd.pipes) {
        // Pipes like | bold become flags
        if (pipe.args.length === 0) {
          args[pipe.name] = true;
        } else {
          // Pipes like | color red become flag with value
          const value = pipe.args.map(a =>
            a.type === "positional" ? a.value : ""
          ).join(" ");
          args[pipe.name] = value;
        }
      }
    }

    const ctx: ComponentContext = {
      args,
      compileChildren: cmd.block
        ? () => this.compileChildren(cmd.block!.children)
        : () => "",
      getRawContent: cmd.block
        ? () => this.extractRawContent(cmd.block!.children)
        : () => "",
      renderMarkdown: (text: string) => this.renderMarkdown(text),
      addClass: (cls: string) => this.cssClasses.add(cls),
      addStyle: (css: string) => this.customStyles.push(css),
    };

    // Execute component
    const result = component(ctx);

    return result.html;
  }

  private parseArgs(args: Argument[]): Record<string, string | boolean> {
    const result: Record<string, string | boolean> = {};
    let positionalIndex = 0;

    for (const arg of args) {
      if (arg.type === "positional") {
        result[`_${positionalIndex}`] = arg.value;
        positionalIndex++;
      } else if (arg.type === "flag") {
        result[arg.name] = arg.value ?? true;
      }
    }

    return result;
  }

  private renderMarkdown(text: string): string {
    // Use remark to convert Markdown to HTML
    const result = markdownProcessor.processSync(text);
    return String(result);
  }

  private extractRawContent(children: (Command | Content)[]): string {
    // Extract raw text content without markdown processing
    // Used for components like /code that need unprocessed text
    const raw = children
      .filter(isContent)
      .map((c) => c.value)
      .join("\n");
    // Trim blank lines but preserve indentation, then dedent
    return this.dedent(this.trimBlankLines(raw));
  }

  /**
   * Trim only leading/trailing blank lines from content.
   * Unlike trim(), this preserves the indentation structure.
   */
  private trimBlankLines(text: string): string {
    const lines = text.split("\n");
    while (lines.length > 0 && lines[0].trim() === "") {
      lines.shift();
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    return lines.join("\n");
  }

  private generateCss(): string {
    const baseCss = `
/* Polyester Base Styles */
.poly-document {
  font-family: system-ui, -apple-system, sans-serif;
  line-height: 1.6;
  color: #1a1a1a;
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

/* Print styles for PDF generation */
@media print {
  .poly-document {
    max-width: none;
    padding: 0;
  }
}

.poly-content {
  margin-bottom: 1rem;
}

.poly-content p {
  margin: 0 0 1em 0;
}

.poly-content h1, .poly-content h2, .poly-content h3 {
  margin: 1.5em 0 0.5em 0;
  line-height: 1.3;
}

.poly-content h1 { font-size: 2rem; }
.poly-content h2 { font-size: 1.5rem; }
.poly-content h3 { font-size: 1.25rem; }

/* Component styles */
.poly-columns {
  display: grid;
  gap: 1.5rem;
}

.poly-grid {
  display: grid;
  gap: 1rem;
}

.poly-region {
  padding: 1rem;
}

.poly-sidebar {
  position: absolute;
}

.poly-quote {
  border-left: 4px solid #e5e5e5;
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
}

.poly-quote.pullquote {
  border: none;
  font-size: 1.5rem;
  text-align: center;
  padding: 2rem;
  color: #666;
}

.poly-hero {
  padding: 4rem 2rem;
  text-align: center;
}

.poly-card {
  border: 1px solid #e5e5e5;
  border-radius: 0.5rem;
  padding: 1.5rem;
}

.poly-text {
  display: inline;
}

/* Markdown content styles */
.poly-content ul, .poly-content ol {
  margin: 0 0 1em 0;
  padding-left: 1.5em;
}

.poly-content li {
  margin-bottom: 0.25em;
}

.poly-content code {
  background: #f3f4f6;
  padding: 0.125em 0.25em;
  border-radius: 0.25em;
  font-size: 0.9em;
}

.poly-content pre {
  background: #0d1117;
  color: #c9d1d9;
  padding: 1rem;
  border-radius: 0.5rem;
  overflow-x: auto;
  margin: 1em 0;
}

.poly-content pre code {
  background: none;
  padding: 0;
  color: inherit;
}

/* Syntax highlighting (GitHub Dark theme) */
.hljs-comment,
.hljs-quote { color: #8b949e; }

.hljs-keyword,
.hljs-selector-tag,
.hljs-type { color: #ff7b72; }

.hljs-string,
.hljs-attr,
.hljs-symbol,
.hljs-bullet,
.hljs-addition { color: #a5d6ff; }

.hljs-title,
.hljs-section,
.hljs-function { color: #d2a8ff; }

.hljs-variable,
.hljs-template-variable { color: #ffa657; }

.hljs-literal,
.hljs-number { color: #79c0ff; }

.hljs-built_in,
.hljs-class .hljs-title { color: #ffa657; }

.hljs-attr { color: #79c0ff; }

.hljs-params { color: #c9d1d9; }

.hljs-meta { color: #8b949e; }

.hljs-name,
.hljs-tag { color: #7ee787; }

.hljs-attribute { color: #79c0ff; }

.hljs-selector-id,
.hljs-selector-class { color: #7ee787; }

.hljs-deletion { color: #ffa198; background: #490202; }
.hljs-addition { color: #aff5b4; background: #033a16; }

.poly-content table {
  border-collapse: collapse;
  width: 100%;
  margin: 1em 0;
}

.poly-content th, .poly-content td {
  border: 1px solid #e5e7eb;
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.poly-content th {
  background: #f9fafb;
  font-weight: 600;
}

.poly-content blockquote {
  border-left: 4px solid #e5e5e5;
  padding-left: 1rem;
  margin: 1em 0;
  color: #666;
}

.poly-content a {
  color: #3b82f6;
  text-decoration: underline;
}

.poly-content img {
  max-width: 100%;
  height: auto;
}

.poly-content hr {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 2em 0;
}
`;

    // Add custom styles from components
    const customCss = this.customStyles.join("\n");

    return baseCss + "\n" + customCss + "\n" + (this.options.customCss || "");
  }

  private wrapStandalone(body: string, css: string): string {
    const title = this.options.title || "Polyester Document";
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
${css}
  </style>
</head>
<body>
  <div class="poly-document">
${body}
  </div>
</body>
</html>`;
  }
}

export function compileToHtml(doc: Document, options?: CompileOptions): CompileResult {
  const compiler = new HtmlCompiler(options);
  return compiler.compile(doc);
}
