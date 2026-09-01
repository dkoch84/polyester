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
import type { FontCache } from "./fonts.js";
import type { Diagnostic, DiagnosticSeverity } from "../../diagnostics.js";

export interface CompileOptions {
  /** Directory of the source `.poly` file — used to resolve relative imports. */
  sourceDir?: string;
  /** Include full HTML document wrapper */
  standalone?: boolean;
  /** Custom CSS to include */
  customCss?: string;
  /** Document title (for standalone mode) */
  title?: string;
  /** CSS for style tokens (design system colors, fonts, etc.) */
  styleCss?: string;
  /** CSS for spacing tokens */
  spacingCss?: string;
  /** CSS for syntax highlighting */
  syntaxCss?: string;
  /** Pre-resolved /font cache (Google Fonts + local fonts inlined as data URIs). */
  fontCache?: FontCache;
}

export interface PageSettings {
  pageless?: boolean;
  /** Document mode: "web" (continuous), "pdf" (paginated digital), "print" (paginated physical) */
  mode?: "web" | "pdf" | "print";
  size?: string;
  orientation?: string;
  margin?: string;
  theme?: string;
  style?: string;
  spacing?: string;
  pagebgs?: Array<{ pages: string; style: string }>;
}

export interface CompileResult {
  html: string;
  css: string;
  pageSettings: PageSettings;
  /**
   * Problems found while compiling. Collected rather than printed so callers
   * can report them once (every build path compiles twice) and fail the build
   * before writing output.
   */
  diagnostics: Diagnostic[];
}

// Page sizes in mm [width, height]
const PAGE_SIZES: Record<string, [number, number]> = {
  A3: [297, 420], A4: [210, 297], A5: [148, 210],
  Letter: [215.9, 279.4], Legal: [215.9, 355.6],
};

export class HtmlCompiler {
  private options: CompileOptions;
  private cssClasses: Set<string> = new Set();
  private customStyles: string[] = [];
  /**
   * CSS from the document's own /style blocks and /import statements, kept
   * apart from component CSS so it lands last in the cascade. Interleaved with
   * component CSS it lost to any component that injected its rules later,
   * which is why documents had to reach for !important to restyle one.
   */
  private userStyles: string[] = [];
  private pageSettings: PageSettings = {};
  private diagnostics: Diagnostic[] = [];

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
    this.userStyles = [];
    this.pageSettings = {};
    this.diagnostics = [];

    // Compile document body — top-level children get source-line annotations
    // so the MCP page-layout tool can map overflows back to .poly source lines.
    const bodyHtml = doc.children
      .map((child) => this.annotateSourceLine(this.compileNode(child), child.loc?.start.line))
      .join("\n");

    // Generate CSS
    const css = this.generateCss();

    // Build final HTML
    let html: string;
    if (this.options.standalone) {
      html = this.wrapStandalone(bodyHtml, css);
    } else {
      html = bodyHtml;
    }

    return { html, css, pageSettings: this.pageSettings, diagnostics: this.diagnostics };
  }

  private compileChildren(children: (Command | Content)[]): string {
    return children.map((child) => this.compileNode(child)).join("\n");
  }

  private annotateSourceLine(html: string, line: number | undefined): string {
    if (!line || !html) return html;
    // Inject data-source-line into the first tag of the rendered fragment.
    return html.replace(/^(\s*<[a-zA-Z][\w-]*)\b/, `$1 data-source-line="${line}"`);
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
    const dedented = this.dedent(content.value);
    const trimmed = dedented.trim();
    if (!trimmed) return "";

    // The Content's loc.start.line is the first line of the raw value. After
    // trimming leading blanks the actual markdown starts that many lines later,
    // so offset accordingly when annotating per-block source lines.
    const lines = dedented.split("\n");
    let leadingBlanks = 0;
    while (leadingBlanks < lines.length && lines[leadingBlanks].trim() === "") {
      leadingBlanks++;
    }
    const baseLine = (content.loc?.start.line ?? 1) + leadingBlanks;

    const html = this.renderMarkdown(trimmed, baseLine);
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
      this.report("error", `Unknown command: /${cmd.name}`, cmd.loc?.start.line);
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
      addUserStyle: (css: string) => this.userStyles.push(css),
      setPageSettings: (settings) => {
        if (settings.pagebgs) {
          const existing = this.pageSettings.pagebgs || [];
          this.pageSettings = { ...this.pageSettings, ...settings, pagebgs: [...existing, ...settings.pagebgs] };
        } else {
          this.pageSettings = { ...this.pageSettings, ...settings };
        }
      },
      sourceDir: this.options.sourceDir,
      fontCache: this.options.fontCache,
      report: (severity, message) =>
        this.report(severity, message, cmd.loc?.start.line),
    };

    // Execute component
    const result = component(ctx);

    return result.html;
  }

  private report(severity: DiagnosticSeverity, message: string, line?: number): void {
    this.diagnostics.push({ severity, message, ...(line !== undefined && { line }) });
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

  private renderMarkdown(text: string, baseLine: number = 1): string {
    // Annotate each top-level hast block with its source line in the .poly
    // file so the sim/reporter can map page positions back to source.
    const annotateSourceLines = () => (tree: any) => {
      if (tree?.type === "root" && Array.isArray(tree.children)) {
        for (const node of tree.children) {
          if (
            node?.type === "element" &&
            node.position?.start?.line &&
            !node.properties?.dataSourceLine
          ) {
            const sourceLine = baseLine + node.position.start.line - 1;
            node.properties = node.properties || {};
            node.properties.dataSourceLine = String(sourceLine);
          }
        }
      }
    };

    const result = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeHighlight, { detect: true })
      .use(annotateSourceLines)
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(text);
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
    // CSS cascade order:
    // 1. Spacing tokens   (:root { --poly-spacing-*: ...; })
    // 2. Style tokens     (:root { --poly-color-*, --poly-font-*, etc. })
    // 3. Base CSS         (uses var(--poly-*) with fallbacks)
    // 4. Component CSS    (uses var(--poly-*) with fallbacks)
    // 5. Syntax theme CSS (.hljs-* rules)
    // 6. User /style CSS  (full override power)

    const spacingCss = this.options.spacingCss || "";
    const styleCss = this.options.styleCss || "";
    const syntaxCss = this.options.syntaxCss || "";

    const baseCss = `
/* Polyester Base Styles */
.poly-document {
  font-family: var(--poly-font-body, system-ui, -apple-system, sans-serif);
  line-height: 1.6;
  color: var(--poly-color-text, #1a1a1a);
  background: var(--poly-color-bg, #ffffff);
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

/* Print styles for PDF generation */
@media print {
  .poly-document {
    max-width: none;
    padding: 0;
    orphans: 3;
    widows: 3;
  }
  .poly-content h1, .poly-content h2, .poly-content h3,
  h1, h2, h3 {
    break-after: avoid;
    page-break-after: avoid;
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .poly-content table, table, .poly-region, .poly-card, .poly-quote, .poly-code-block {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .poly-content li { break-inside: avoid; page-break-inside: avoid; }
}

.poly-content {
  margin-bottom: var(--poly-spacing-base, 1rem);
}

.poly-content p {
  margin: 0 0 1em 0;
}

.poly-content h1, .poly-content h2, .poly-content h3 {
  font-family: var(--poly-font-heading, system-ui, -apple-system, sans-serif);
  margin: 1.5em 0 0.5em 0;
  line-height: 1.3;
}

.poly-content h1 { font-size: 2rem; }
.poly-content h2 { font-size: 1.5rem; }
.poly-content h3 { font-size: 1.25rem; }

/* Component styles */
.poly-columns {
  display: grid;
  gap: var(--poly-spacing-column-gap, 1.5rem);
}

.poly-grid {
  display: grid;
  gap: var(--poly-spacing-column-gap, 1rem);
}

.poly-region {
  padding: var(--poly-spacing-block-padding, 1rem);
}

.poly-sidebar {
  position: absolute;
}

.poly-quote {
  border-left: 4px solid var(--poly-color-primary, #e5e5e5);
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
}

.poly-quote.pullquote {
  border: none;
  font-size: 1.5rem;
  text-align: center;
  padding: 2rem;
  color: var(--poly-color-text-muted, #666);
}

.poly-hero {
  padding: 4rem 2rem;
  text-align: center;
}

.poly-background {
  position: relative;
}

.poly-card {
  border: var(--poly-border-width, 1px) solid var(--poly-color-border, #e5e5e5);
  border-radius: var(--poly-radius, 0.5rem);
  padding: var(--poly-spacing-card-padding, 1.5rem);
  box-shadow: var(--poly-shadow-card, none);
}

.poly-card-accent {
  border-color: color-mix(in srgb, var(--poly-color-primary, #3b82f6) 45%, transparent);
  background: color-mix(in srgb, var(--poly-color-primary, #3b82f6) 7%, var(--poly-color-bg, #fff));
  box-shadow: none;
}

/* Card titles sit flush with the top of the card. */
.poly-card :where(.poly-content):first-child > :first-child {
  margin-top: 0;
}

.poly-text {
  display: inline;
}

/* Markdown content styles */
:where(.poly-content) ul, :where(.poly-content) ol {
  margin: 0 0 1em 0;
  padding-left: 1.5em;
}

:where(.poly-content) li {
  margin-bottom: 0.25em;
}

:where(.poly-content) code {
  background: var(--poly-color-surface, #f3f4f6);
  padding: 0.125em 0.25em;
  border-radius: var(--poly-radius, 0.25em);
  font-family: var(--poly-font-mono, ui-monospace, monospace);
  font-size: 0.9em;
}

.poly-content pre {
  background: #0d1117;
  color: #c9d1d9;
  padding: var(--poly-spacing-block-padding, 1rem);
  border-radius: var(--poly-radius, 0.5rem);
  overflow-x: auto;
  margin: 1em 0;
}

.poly-content pre code {
  background: none;
  padding: 0;
  color: inherit;
}

/* Syntax highlighting (GitHub Dark theme — overridden by syntax CSS) */
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
  border: var(--poly-border-width, 1px) solid var(--poly-color-border, #e5e7eb);
  padding: 0.5rem 0.75rem;
  text-align: left;
}

.poly-content th {
  background: var(--poly-color-surface, #f9fafb);
  font-weight: 600;
}

.poly-content blockquote {
  border-left: 4px solid var(--poly-color-primary, #e5e5e5);
  padding-left: 1rem;
  margin: 1em 0;
  color: var(--poly-color-text-muted, #666);
}

.poly-content a {
  color: var(--poly-color-link, #3b82f6);
  text-decoration: underline;
}

.poly-content img {
  max-width: 100%;
  height: auto;
}

.poly-content hr {
  border: none;
  border-top: var(--poly-border-width, 1px) solid var(--poly-color-border, #e5e7eb);
  margin: var(--poly-spacing-section-gap, 2em) 0;
}
`;

    // @page rule for print/PDF rendering. PDF generation skips the in-browser
    // pagination sim, so margins come from @page directly.
    let pageCss = "";
    if (this.pageSettings.size && !this.pageSettings.pageless) {
      const size = this.pageSettings.size || "A4";
      const orientation = this.pageSettings.orientation || "portrait";
      const margin = this.pageSettings.margin || "2cm";
      pageCss = `
@page {
  size: ${size} ${orientation};
  margin: ${margin};
}
`;
    }

    const pageSimCss = `
/* Screen-only page simulation styles */
@media screen {
  .poly-page-boundary {
    background: #e5e7eb;
    box-shadow: inset 0 6px 6px -6px rgba(0,0,0,0.12),
                inset 0 -6px 6px -6px rgba(0,0,0,0.12);
    z-index: 10;
  }
  .poly-page-boundary::after {
    content: attr(data-label);
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    font: 11px/1 system-ui, sans-serif;
    color: #9ca3af;
  }
  .poly-document[data-page-size] .poly-pagebreak {
    border-top: none;
    margin: 0;
    background: repeating-linear-gradient(-45deg,
      transparent, transparent 8px,
      rgba(0,0,0,0.02) 8px, rgba(0,0,0,0.02) 16px);
  }
  .poly-document[data-page-size] .poly-pagebreak::after {
    content: none;
  }
}
`;

    // Add custom styles from components
    const componentCss = this.customStyles.join("\n");

    // Cascade: spacing → style → page → base → pageSim → components → syntax → user
    return [
      spacingCss,
      styleCss,
      pageCss,
      baseCss,
      pageSimCss,
      componentCss,
      syntaxCss,
      this.options.customCss || "",
    ].filter(Boolean).join("\n");
  }

  private wrapStandalone(body: string, css: string): string {
    const title = this.options.title || "Polyester Document";
    const mode = this.pageSettings.mode || (this.pageSettings.size && !this.pageSettings.pageless ? "pdf" : "web");
    const isPaginated = mode !== "web" && !!this.pageSettings.size;

    // Build data attributes for paginated documents
    let dataAttrs = ` data-page-mode="${mode}"`;
    if (isPaginated) {
      dataAttrs += ` data-page-size="${this.pageSettings.size}"`;
      dataAttrs += ` data-page-orientation="${this.pageSettings.orientation || "portrait"}"`;
      dataAttrs += ` data-page-margin="${this.pageSettings.margin || "2cm"}"`;
      if (this.pageSettings.pagebgs && this.pageSettings.pagebgs.length > 0) {
        const escaped = JSON.stringify(this.pageSettings.pagebgs).replace(/"/g, "&quot;");
        dataAttrs += ` data-pagebgs="${escaped}"`;
      }
    }

    // Compute page dimension CSS variables at compile time
    let pageVarsCss = "";
    if (isPaginated) {
      const dims = PAGE_SIZES[this.pageSettings.size!] || PAGE_SIZES.A4;
      const isLandscape = this.pageSettings.orientation === "landscape";
      const pageW = isLandscape ? dims[1] : dims[0];
      const pageH = isLandscape ? dims[0] : dims[1];
      const margin = this.pageSettings.margin || "2cm";
      pageVarsCss = `
  .poly-document {
    --poly-page-width: calc(${pageW}mm - 2 * ${margin});
    --poly-page-height: calc(${pageH}mm - 2 * ${margin});
  }`;
    }

    const pageScript = isPaginated ? `\n  ${this.generatePageSimScript()}` : "";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
${css}${pageVarsCss}
  </style>
</head>
<body>
  <div class="poly-document"${dataAttrs}>
${body}
  </div>${pageScript}
</body>
</html>`;
  }

  /**
   * Generate a script that lays out the document into real, discrete fixed-size
   * page containers. Only runs on screen (not print). Natural overflow starts
   * a new page; /pagebreak forces a cut. Elements taller than a page are
   * allowed to overflow that page with a visible outline hint.
   */
  private generatePageSimScript(): string {
    return `<script>
(function() {
  if (window.matchMedia('print').matches) return;

  var PAGE_SIZES = {
    A3: [297, 420], A4: [210, 297], A5: [148, 210],
    Letter: [215.9, 279.4], Legal: [215.9, 355.6]
  };
  var MM_TO_PX = 96 / 25.4;

  function parseLength(val) {
    var m = String(val).match(/^([\\d.]+)\\s*(cm|mm|in|px|pt|rem|em)?$/);
    if (!m) return 0;
    var n = parseFloat(m[1]);
    switch (m[2]) {
      case 'cm': return n * 10 * MM_TO_PX;
      case 'mm': return n * MM_TO_PX;
      case 'in': return n * 96;
      case 'pt': return n * (96 / 72);
      case 'px': return n;
      default: return n * MM_TO_PX; // default to mm
    }
  }

  function run() {
    var doc = document.querySelector('.poly-document[data-page-size]');
    if (!doc) return;
    // Already paginated? (re-run on resize shouldn't re-wrap).
    if (doc.dataset.paginated === '1') return;

    var sizeName = doc.dataset.pageSize || 'A4';
    var orientation = doc.dataset.pageOrientation || 'portrait';
    var marginStr = doc.dataset.pageMargin || '2cm';

    var dims = PAGE_SIZES[sizeName] || PAGE_SIZES.A4;
    var w = dims[0], h = dims[1];
    if (orientation === 'landscape') { var tmp = w; w = h; h = tmp; }

    var pageWidthPx = w * MM_TO_PX;
    var pageHeightPx = h * MM_TO_PX;
    var marginPx = parseLength(marginStr);
    var contentWidth = pageWidthPx - 2 * marginPx;
    var contentHeight = pageHeightPx - 2 * marginPx;
    // Tolerance absorbs sub-pixel rounding drift accumulated across many stacked
    // blocks. Without it, two environments rendering the same HTML with the same
    // fonts can disagree by a fraction of a pixel per block, which adds up to a
    // single-line discrepancy on long pages and causes one-word overflow.
    // Half a body line at 16px base is conservative.
    var OVERFLOW_TOLERANCE = 24;

    // Reset document container: it's now a wrapper of page containers.
    doc.style.width = pageWidthPx + 'px';
    doc.style.maxWidth = 'none';
    doc.style.padding = '0';
    doc.style.background = 'transparent';
    doc.style.boxShadow = 'none';
    doc.style.setProperty('--poly-page-height', contentHeight + 'px');
    document.documentElement.style.setProperty('--poly-preview-bg', '#e8e8e8');
    document.body.style.background = 'var(--poly-preview-bg, #e8e8e8)';
    document.body.style.padding = '24px 0';
    document.body.style.margin = '0';
    document.body.style.overflowX = 'auto';
    document.body.style.display = 'flex';
    document.body.style.flexDirection = 'column';
    document.body.style.alignItems = 'center';

    // Snapshot children before wrapping. Filter out helper nodes from prior runs.
    // .poly-content wrappers are unwrapped so individual paragraphs/headings/lists
    // can be distributed across pages independently.
    var originalChildren = [];
    var kids = Array.prototype.slice.call(doc.children);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.classList && (
        k.classList.contains('poly-page') ||
        k.classList.contains('poly-page-overlay') ||
        k.classList.contains('poly-pagebg') ||
        k.classList.contains('poly-pb-gap')
      )) continue;
      if (k.classList && k.classList.contains('poly-content')) {
        var inner = Array.prototype.slice.call(k.children);
        // Propagate the wrapper's data-source-line to the first inner child so
        // unwrapped markdown still maps back to the .poly source.
        var wrapperLine = k.getAttribute('data-source-line');
        if (wrapperLine && inner.length && !inner[0].getAttribute('data-source-line')) {
          inner[0].setAttribute('data-source-line', wrapperLine);
        }
        for (var j = 0; j < inner.length; j++) originalChildren.push(inner[j]);
      } else {
        originalChildren.push(k);
      }
    }
    for (var i = 0; i < originalChildren.length; i++) {
      if (originalChildren[i].parentNode) {
        originalChildren[i].parentNode.removeChild(originalChildren[i]);
      }
    }
    // Remove the now-empty poly-content wrappers (and other non-helper direct children).
    kids = Array.prototype.slice.call(doc.children);
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (k.classList && (k.classList.contains('poly-page'))) continue;
      k.parentNode.removeChild(k);
    }

    // Parse pagebgs once.
    var pagebgEntries = [];
    try {
      if (doc.dataset.pagebgs) pagebgEntries = JSON.parse(doc.dataset.pagebgs);
    } catch (e) {}
    function pagebgStyleFor(pageNum) {
      var styles = [];
      for (var b = 0; b < pagebgEntries.length; b++) {
        var entry = pagebgEntries[b];
        var match = false;
        if (entry.pages === 'all') match = true;
        else if (entry.pages.indexOf('-') !== -1) {
          var parts = entry.pages.split('-');
          var start = parseInt(parts[0], 10);
          var end = parseInt(parts[1], 10);
          match = pageNum >= start && pageNum <= end;
        } else {
          match = parseInt(entry.pages, 10) === pageNum;
        }
        if (match) styles.push(entry.style);
      }
      return styles.join(';');
    }

    function makePage() {
      var pageNum = pages.length + 1;
      var page = document.createElement('div');
      page.className = 'poly-page';
      page.dataset.pageNumber = pageNum;
      page.style.cssText = [
        'width:' + pageWidthPx + 'px',
        'height:' + pageHeightPx + 'px',
        'padding:' + marginPx + 'px',
        'box-sizing:border-box',
        'background:white',
        'box-shadow:0 2px 8px rgba(0,0,0,0.12)',
        'position:relative',
        'margin-bottom:24px',
        'overflow:visible'
      ].join(';');
      var inner = document.createElement('div');
      inner.className = 'poly-page-content';
      inner.style.cssText = 'width:100%;height:100%;position:relative;';
      // Page background decoration — appended to page (not inner) so inset:0 covers
      // the full physical page including the margin padding area (full-bleed)
      var bgStyle = pagebgStyleFor(pageNum);
      if (bgStyle) {
        var bg = document.createElement('div');
        bg.className = 'poly-pagebg';
        bg.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;' + bgStyle;
        page.appendChild(bg);
      }
      // Content wrapper sits above page bg
      var contentWrap = document.createElement('div');
      contentWrap.className = 'poly-page-flow poly-content';
      contentWrap.style.cssText = 'position:relative;z-index:1;';
      inner.appendChild(contentWrap);
      page.appendChild(inner);
      // Page label
      var label = document.createElement('div');
      label.className = 'poly-page-label';
      label.textContent = 'Page ' + pageNum;
      label.style.cssText = 'position:absolute;top:-18px;right:4px;font:10px/1 ui-monospace,monospace;color:#9ca3af;pointer-events:none;';
      page.appendChild(label);
      doc.appendChild(page);
      pages.push({ page: page, flow: contentWrap });
      return pages[pages.length - 1];
    }

    var pages = [];
    var current = makePage();

    function currentContentHeight() {
      return current.flow.getBoundingClientRect().height;
    }

    function isEmpty(p) { return p.flow.children.length === 0; }
    function isList(el) { return el && (el.tagName === 'UL' || el.tagName === 'OL'); }
    function isHeading(el) {
      if (!el || !el.tagName) return false;
      return /^H[1-6]$/.test(el.tagName);
    }
    // When a block is about to be pushed to a new page, also pull any heading
    // that ended up trailing the previous page. Prevents orphan headings.
    function pullTrailingHeading() {
      var last = current.flow.lastElementChild;
      if (last && isHeading(last)) {
        current.flow.removeChild(last);
        return last;
      }
      return null;
    }
    function isTextBlock(el) {
      if (!el || !el.tagName) return false;
      var t = el.tagName;
      if (t !== 'P' && t !== 'BLOCKQUOTE' && t !== 'LI') return false;
      // Allow simple inline formatting; split where possible.
      return true;
    }
    function markOversize(el) {
      // Authoring hint only — the dashed outline is styled screen-only (see
      // pageSimCss) so it never leaks into printed/PDF output.
      el.setAttribute('data-poly-oversize', '1');
    }
    // Binary-search for how many leading text nodes/words fit on the current page.
    // Returns a continuation element containing the rest, or null if splitting is impossible.
    function splitTextBlock(child) {
      // Flatten descendants into ordered list of text nodes.
      var walker = document.createTreeWalker(child, NodeFilter.SHOW_TEXT, null);
      var textNodes = [];
      var n;
      while ((n = walker.nextNode())) textNodes.push(n);
      if (textNodes.length === 0) return null;
      // Build a word list with backreferences: [{ node, start, end, text }]
      var tokens = [];
      for (var i = 0; i < textNodes.length; i++) {
        var tn = textNodes[i];
        var text = tn.nodeValue || '';
        var re = /\\S+\\s*|\\s+/g, m;
        while ((m = re.exec(text)) !== null) {
          tokens.push({ node: tn, start: m.index, end: m.index + m[0].length, text: m[0] });
        }
      }
      if (tokens.length < 4) return null;
      // Clone BEFORE mutation so the continuation has original content to work from.
      var pristineClone = child.cloneNode(true);
      // Save original text per node so we can restore/truncate.
      var originalValues = textNodes.map(function(t) { return t.nodeValue; });
      function truncateTo(tokenIdx) {
        // Keep tokens [0, tokenIdx), clear content in later nodes.
        var lastKept = tokenIdx - 1;
        if (lastKept < 0) lastKept = 0;
        var lastToken = tokens[lastKept];
        for (var i = 0; i < textNodes.length; i++) {
          var tn = textNodes[i];
          if (tn === lastToken.node) {
            tn.nodeValue = (originalValues[i] || '').slice(0, lastToken.end);
          } else if (textNodes.indexOf(lastToken.node) > i) {
            tn.nodeValue = originalValues[i];
          } else {
            tn.nodeValue = '';
          }
        }
      }
      function restore() {
        for (var i = 0; i < textNodes.length; i++) textNodes[i].nodeValue = originalValues[i];
      }
      // Identify sentence-boundary token indices (after a token whose trimmed
      // text ends in . ! or ?). Splitting only at these prevents mid-sentence
      // breaks that read as rendering bugs.
      var sentenceBoundaries = [];
      for (var bi = 0; bi < tokens.length; bi++) {
        var trimmed = tokens[bi].text.replace(/\\s+$/, '');
        if (/[.!?]$/.test(trimmed)) sentenceBoundaries.push(bi + 1);
      }
      // Need at least 2 sentences total AND a non-final boundary to split at.
      // If the only boundary is at the end, there's nothing to split on.
      if (sentenceBoundaries.length < 2) { restore(); return null; }
      // Drop the trailing boundary (end of last sentence) — splitting there
      // means everything stays on this page, nothing to spill.
      var splitCandidates = sentenceBoundaries.slice(0, -1);
      // Binary search for the largest sentence-boundary index that fits.
      var lo = 0, hi = splitCandidates.length - 1, best = -1;
      while (lo <= hi) {
        var mid = (lo + hi) >> 1;
        truncateTo(splitCandidates[mid]);
        if (currentContentHeight() <= contentHeight + OVERFLOW_TOLERANCE) {
          best = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }
      if (best < 0) { restore(); return null; }
      // Anti-straggler: both sides must have at least 2 sentences. The kept
      // side has best+1 sentences; the spill side has totalSentences - kept.
      var totalSentences = sentenceBoundaries.length;
      // If the paragraph's last token doesn't end in a terminator, count an
      // additional partial sentence on the spill side.
      var lastTrimmed = tokens[tokens.length - 1].text.replace(/\\s+$/, '');
      if (!/[.!?]$/.test(lastTrimmed)) totalSentences += 1;
      var keptSentences = best + 1;
      var spillSentences = totalSentences - keptSentences;
      if (keptSentences <= 1 || spillSentences <= 1) {
        restore();
        return null;
      }
      var splitTokenIdx = splitCandidates[best];
      lo = splitTokenIdx;
      // Apply the chosen truncation to the original child.
      truncateTo(lo);
      // Use the pristine clone as the continuation; strip off the parts that fit on the current page.
      var clone = pristineClone;
      var cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null);
      var cloneTextNodes = [];
      var cn;
      while ((cn = cloneWalker.nextNode())) cloneTextNodes.push(cn);
      // Determine the break point in the clone matching the original.
      var breakToken = tokens[lo - 1];
      var breakNodeIdx = textNodes.indexOf(breakToken.node);
      for (var i = 0; i < cloneTextNodes.length; i++) {
        var tn = cloneTextNodes[i];
        if (i < breakNodeIdx) tn.nodeValue = '';
        else if (i === breakNodeIdx) {
          tn.nodeValue = (originalValues[i] || '').slice(breakToken.end).replace(/^\\s+/, '');
        }
        // else: keep as is (original clone content)
      }
      // If clone has no remaining non-whitespace text, it's trivial — drop it.
      if (!(clone.textContent || '').trim()) return null;
      return clone;
    }

    function appendWithSplit(child) {
      current.flow.appendChild(child);
      if (currentContentHeight() <= contentHeight + OVERFLOW_TOLERANCE) return; // fits

      // Overflow — try to split if it's a list.
      if (isList(child)) {
        current.flow.removeChild(child);
        var firstHalf = child.cloneNode(false);
        current.flow.appendChild(firstHalf);
        var items = Array.prototype.slice.call(child.children);
        var firstCount = 0;
        for (var i = 0; i < items.length; i++) {
          firstHalf.appendChild(items[i]);
          if (currentContentHeight() > contentHeight + OVERFLOW_TOLERANCE) {
            firstHalf.removeChild(items[i]);
            break;
          }
          firstCount++;
        }
        if (firstCount === 0) {
          // Nothing fits on this page. If page is otherwise empty, overflow whole list here.
          current.flow.removeChild(firstHalf);
          if (current.flow.children.length === 0) {
            current.flow.appendChild(child);
            markOversize(child);
            current = makePage();
          } else {
            var widowHeading = pullTrailingHeading();
            current = makePage();
            if (widowHeading) current.flow.appendChild(widowHeading);
            appendWithSplit(child);
          }
          return;
        }
        var remaining = items.slice(firstCount);
        if (remaining.length) {
          var secondHalf = child.cloneNode(false);
          for (var j = 0; j < remaining.length; j++) secondHalf.appendChild(remaining[j]);
          if (secondHalf.tagName === 'OL') {
            var startAttr = parseInt(child.getAttribute('start') || '1', 10);
            secondHalf.setAttribute('start', String(startAttr + firstCount));
          }
          current = makePage();
          appendWithSplit(secondHalf);
        }
        return;
      }

      // Try splitting text block (paragraph/li) across pages.
      if (isTextBlock(child)) {
        var rest = splitTextBlock(child);
        if (rest) {
          current = makePage();
          appendWithSplit(rest);
          return;
        }
      }

      // Non-list, non-splittable overflow
      if (current.flow.children.length === 1) {
        markOversize(child);
        current = makePage();
      } else {
        current.flow.removeChild(child);
        var widowHeading2 = pullTrailingHeading();
        current = makePage();
        if (widowHeading2) current.flow.appendChild(widowHeading2);
        appendWithSplit(child);
      }
    }

    for (var i = 0; i < originalChildren.length; i++) {
      var child = originalChildren[i];
      if (child.classList && child.classList.contains('poly-pagebreak')) {
        if (!isEmpty(current)) current = makePage();
        continue;
      }
      appendWithSplit(child);
    }
    // Trim trailing empty page.
    if (pages.length > 1 && isEmpty(pages[pages.length - 1])) {
      var last = pages.pop();
      last.page.parentNode.removeChild(last.page);
    }

    // Zero out first-child margin-top and last-child margin-bottom on each page
    // so content sits flush against the page's top/bottom margins.
    for (var p = 0; p < pages.length; p++) {
      var f = pages[p].flow;
      if (f.firstElementChild) f.firstElementChild.style.marginTop = '0';
      if (f.lastElementChild) f.lastElementChild.style.marginBottom = '0';
    }

    doc.dataset.paginated = '1';
    doc.dataset.totalPages = pages.length;

    renderHints(pages);
  }

  function hintsEnabled() {
    try {
      var params = new URLSearchParams(window.location.search);
      if (params.get('hints') === '1') return true;
      if (params.get('hints') === '0') return false;
      return localStorage.getItem('poly-layout-hints') === '1';
    } catch (e) { return false; }
  }

  function setHints(on) {
    try { localStorage.setItem('poly-layout-hints', on ? '1' : '0'); } catch (e) {}
  }

  function renderHints(pages) {
    // Clear any prior hint badges and oversize outlines.
    var prior = document.querySelectorAll('.poly-hint-badge');
    for (var i = 0; i < prior.length; i++) prior[i].remove();
    var marked = document.querySelectorAll('[data-poly-oversize]');
    for (var m = 0; m < marked.length; m++) marked[m].style.outline = '';
    // Hints are off by default (and during PDF export), so the dashed
    // oversize outline below only ever shows in the live, hints-on preview.
    if (!hintsEnabled()) return;
    for (var p = 0; p < pages.length; p++) {
      var pageNum = p + 1;
      var flow = pages[p].flow;
      var kids = flow.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.classList.contains('poly-pagebg')) continue;
        if (el.classList.contains('poly-hint-badge')) continue;
        var srcLine = el.getAttribute('data-source-line');
        var oversize = el.hasAttribute('data-poly-oversize');
        if (!srcLine && !oversize) continue;
        if (oversize) el.style.outline = '2px dashed rgba(239,68,68,0.5)';
        var badge = document.createElement('div');
        badge.className = 'poly-hint-badge';
        var label = (srcLine ? 'L' + srcLine + ' · ' : '') + 'p' + pageNum + (oversize ? ' ⚠' : '');
        badge.textContent = label;
        badge.style.cssText = 'position:absolute;top:' + (el.offsetTop + 2) + 'px;left:-64px;font:10px/1.4 ui-monospace,monospace;background:' + (oversize ? '#ef4444' : 'rgba(0,0,0,0.6)') + ';color:#fff;padding:1px 6px;border-radius:3px;pointer-events:none;z-index:5;white-space:nowrap;';
        flow.appendChild(badge);
      }
    }
  }

  function ensureToggleButton() {
    if (document.querySelector('.poly-hint-toggle')) return;
    var btn = document.createElement('button');
    btn.className = 'poly-hint-toggle';
    btn.type = 'button';
    function refresh() {
      btn.textContent = hintsEnabled() ? '◉ Hints' : '○ Hints';
      btn.style.background = hintsEnabled() ? '#ef4444' : 'rgba(0,0,0,0.6)';
    }
    btn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:1000;color:#fff;border:0;border-radius:4px;padding:4px 10px;font:11px/1.4 ui-monospace,monospace;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,0.25);';
    btn.addEventListener('click', function() {
      setHints(!hintsEnabled());
      refresh();
      // Re-run hints without re-paginating.
      var doc = document.querySelector('.poly-document[data-page-size]');
      if (!doc) return;
      var pageEls = doc.querySelectorAll('.poly-page');
      var pageList = [];
      for (var i = 0; i < pageEls.length; i++) pageList.push({ page: pageEls[i], flow: pageEls[i].querySelector('.poly-page-flow') });
      renderHints(pageList);
    });
    refresh();
    document.body.appendChild(btn);
  }

  function start() {
    // Force every declared @font-face to load before measuring. document.fonts.ready
    // alone only resolves for faces *currently used* by the layout — but as the sim
    // walks content, headings/bold/italic text trigger lazy loads of other weights,
    // shifting metrics after the sim has already measured. Explicit f.load() ensures
    // all weights/styles are loaded up front so measurements are stable.
    var loadAll = Promise.resolve();
    if (document.fonts && document.fonts.forEach) {
      var loads = [];
      document.fonts.forEach(function(f) { try { loads.push(f.load()); } catch (e) {} });
      loadAll = Promise.all(loads).catch(function() {});
    }
    loadAll.then(function() {
      var ready = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      ready.then(function() {
        requestAnimationFrame(function() { run(); ensureToggleButton(); });
      });
    });
  }
  if (document.readyState === 'complete') {
    start();
  } else {
    window.addEventListener('load', start);
  }
})();
</script>`;
  }
}

export function compileToHtml(doc: Document, options?: CompileOptions): CompileResult {
  const compiler = new HtmlCompiler(options);
  return compiler.compile(doc);
}
