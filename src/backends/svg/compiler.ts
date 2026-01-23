/**
 * SVG Backend Compiler
 *
 * Compiles Polyester AST to SVG for README embedding.
 * Unlike HTML, SVG requires explicit positioning, so we track
 * layout state as we render.
 */

import {
  Document,
  Command,
  Content,
  Argument,
  isCommand,
  isContent,
} from "../../parser/ast.js";
import { components, SvgComponentContext, SvgComponentResult } from "./components.js";

export interface SvgCompileOptions {
  /** Document width in pixels */
  width?: number;
  /** Document height (auto-calculated if not provided) */
  height?: number;
  /** Base font size in pixels */
  fontSize?: number;
  /** Font family */
  fontFamily?: string;
  /** Background color */
  background?: string;
  /** Add clickable links */
  enableLinks?: boolean;
}

export interface SvgCompileResult {
  svg: string;
  width: number;
  height: number;
}

export interface LayoutState {
  x: number;
  y: number;
  width: number;
  maxWidth: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  lineHeight: number;
  indent: number;
}

export class SvgCompiler {
  private options: Required<SvgCompileOptions>;
  private defs: string[] = [];
  private elements: string[] = [];
  private layout: LayoutState;
  private defIds: Set<string> = new Set();

  constructor(options: SvgCompileOptions = {}) {
    this.options = {
      width: options.width ?? 800,
      height: options.height ?? 0, // Will be calculated
      fontSize: options.fontSize ?? 16,
      fontFamily: options.fontFamily ?? "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      background: options.background ?? "#ffffff",
      enableLinks: options.enableLinks ?? true,
    };

    this.layout = {
      x: 40,
      y: 40,
      width: this.options.width - 80,
      maxWidth: this.options.width - 80,
      fontSize: this.options.fontSize,
      fontFamily: this.options.fontFamily,
      color: "#1a1a1a",
      lineHeight: 1.6,
      indent: 0,
    };
  }

  compile(doc: Document): SvgCompileResult {
    // Reset state
    this.defs = [];
    this.elements = [];
    this.defIds = new Set();
    this.layout.y = 40;

    // Add gradient definitions
    this.addGradientDef();

    // Compile all nodes
    this.compileChildren(doc.children);

    // Calculate final height
    const finalHeight = this.options.height || this.layout.y + 40;

    // Build SVG
    const svg = this.buildSvg(finalHeight);

    return {
      svg,
      width: this.options.width,
      height: finalHeight,
    };
  }

  private addGradientDef(): void {
    if (!this.defIds.has("polyGradient")) {
      this.defs.push(`
    <linearGradient id="polyGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea"/>
      <stop offset="100%" style="stop-color:#764ba2"/>
    </linearGradient>`);
      this.defIds.add("polyGradient");
    }
  }

  private compileChildren(children: (Command | Content)[]): void {
    for (const child of children) {
      this.compileNode(child);
    }
  }

  private compileNode(node: Command | Content): void {
    if (isContent(node)) {
      this.compileContent(node);
    } else if (isCommand(node)) {
      this.compileCommand(node);
    }
  }

  private compileContent(content: Content): void {
    const text = this.dedent(content.value).trim();
    if (!text) return;

    // Parse markdown-like content and render
    const lines = text.split("\n");
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        this.layout.y += this.layout.fontSize * 0.5;
        continue;
      }

      // Headings
      if (trimmed.startsWith("## ")) {
        if (inList) {
          inList = false;
          this.layout.y += this.layout.fontSize * 0.5;
        }
        this.layout.y += this.layout.fontSize * 1.5;
        this.renderHeading(trimmed.slice(3), 2);
        continue;
      }
      if (trimmed.startsWith("### ")) {
        if (inList) {
          inList = false;
          this.layout.y += this.layout.fontSize * 0.5;
        }
        this.layout.y += this.layout.fontSize;
        this.renderHeading(trimmed.slice(4), 3);
        continue;
      }

      // Horizontal rule
      if (trimmed === "---" || trimmed === "***") {
        this.layout.y += this.layout.fontSize;
        this.elements.push(
          `<line x1="${this.layout.x}" y1="${this.layout.y}" x2="${this.layout.x + this.layout.width}" y2="${this.layout.y}" stroke="#e5e7eb" stroke-width="1"/>`
        );
        this.layout.y += this.layout.fontSize;
        continue;
      }

      // List items
      if (trimmed.startsWith("- ")) {
        if (!inList) {
          inList = true;
          this.layout.y += this.layout.fontSize * 0.5;
        }
        this.renderListItem(trimmed.slice(2));
        continue;
      }

      // Regular paragraph
      if (inList) {
        inList = false;
        this.layout.y += this.layout.fontSize * 0.5;
      }
      this.renderParagraph(trimmed);
    }

    this.layout.y += this.layout.fontSize;
  }

  private compileCommand(cmd: Command): void {
    const component = components[cmd.name];

    if (!component) {
      console.warn(`Unknown command for SVG: /${cmd.name}`);
      return;
    }

    const args = this.parseArgs(cmd.args);

    // Apply pipes as additional args
    if (cmd.pipes) {
      for (const pipe of cmd.pipes) {
        if (pipe.args.length === 0) {
          args[pipe.name] = true;
        } else {
          const value = pipe.args
            .map((a) => (a.type === "positional" ? a.value : ""))
            .join(" ");
          args[pipe.name] = value;
        }
      }
    }

    const ctx: SvgComponentContext = {
      args,
      layout: { ...this.layout },
      compileChildren: cmd.block
        ? () => {
            const savedLayout = { ...this.layout };
            this.compileChildren(cmd.block!.children);
            return this.layout.y - savedLayout.y;
          }
        : () => 0,
      getRawContent: cmd.block
        ? () => this.extractRawContent(cmd.block!.children)
        : () => "",
      addElement: (el: string) => this.elements.push(el),
      insertElementAt: (index: number, el: string) => this.elements.splice(index, 0, el),
      getElementCount: () => this.elements.length,
      addDef: (id: string, def: string) => {
        if (!this.defIds.has(id)) {
          this.defs.push(def);
          this.defIds.add(id);
        }
      },
      updateLayout: (updates: Partial<LayoutState>) => {
        Object.assign(this.layout, updates);
      },
      wrapLink: (content: string, href: string) => {
        if (this.options.enableLinks && href) {
          return `<a href="${this.escapeAttr(href)}" target="_blank">${content}</a>`;
        }
        return content;
      },
      escapeText: (text: string) => this.escapeXml(text),
      escapeAttr: (text: string) => this.escapeAttr(text),
      renderText: (text: string, x: number, y: number, opts?: TextRenderOptions) =>
        this.renderTextElement(text, x, y, opts),
    };

    component(ctx);
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

  private extractRawContent(children: (Command | Content)[]): string {
    const raw = children
      .filter(isContent)
      .map((c) => c.value)
      .join("\n");
    return this.dedent(this.trimBlankLines(raw));
  }

  private dedent(text: string): string {
    const lines = text.split("\n");
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

    return lines.map((line) => line.slice(minIndent)).join("\n");
  }

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

  private renderHeading(text: string, level: number): void {
    const sizes: Record<number, number> = { 1: 2, 2: 1.5, 3: 1.25 };
    const size = this.layout.fontSize * (sizes[level] || 1);

    this.layout.y += size;
    this.elements.push(
      `<text x="${this.layout.x}" y="${this.layout.y}" font-family="${this.layout.fontFamily}" font-size="${size}" font-weight="600" fill="${this.layout.color}">${this.escapeXml(this.processInlineMarkdown(text))}</text>`
    );
    this.layout.y += size * 0.5;
  }

  private renderParagraph(text: string): void {
    const processed = this.processInlineMarkdown(text);
    const words = processed.split(" ");
    let currentLine = "";
    const maxWidth = this.layout.width - this.layout.indent;
    const lines: string[] = [];

    // Simple word wrapping (approximate)
    const charWidth = this.layout.fontSize * 0.5;

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = testLine.length * charWidth;

      if (testWidth > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    for (const line of lines) {
      this.layout.y += this.layout.fontSize * this.layout.lineHeight;
      this.elements.push(
        `<text x="${this.layout.x + this.layout.indent}" y="${this.layout.y}" font-family="${this.layout.fontFamily}" font-size="${this.layout.fontSize}" fill="${this.layout.color}">${this.escapeXml(line)}</text>`
      );
    }
  }

  private renderListItem(text: string): void {
    const bulletX = this.layout.x + 10;
    const textX = this.layout.x + 25;

    this.layout.y += this.layout.fontSize * this.layout.lineHeight;

    // Bullet
    this.elements.push(
      `<circle cx="${bulletX}" cy="${this.layout.y - this.layout.fontSize * 0.35}" r="3" fill="${this.layout.color}"/>`
    );

    // Text
    this.elements.push(
      `<text x="${textX}" y="${this.layout.y}" font-family="${this.layout.fontFamily}" font-size="${this.layout.fontSize}" fill="${this.layout.color}">${this.escapeXml(this.processInlineMarkdown(text))}</text>`
    );
  }

  private renderTextElement(
    text: string,
    x: number,
    y: number,
    opts: TextRenderOptions = {}
  ): string {
    const fontSize = opts.fontSize ?? this.layout.fontSize;
    const fontFamily = opts.fontFamily ?? this.layout.fontFamily;
    const fill = opts.fill ?? this.layout.color;
    const fontWeight = opts.bold ? "600" : opts.fontWeight ?? "normal";
    const fontStyle = opts.italic ? "italic" : "normal";
    const anchor = opts.anchor ?? "start";

    let attrs = `x="${x}" y="${y}" font-family="${fontFamily}" font-size="${fontSize}" fill="${fill}" font-weight="${fontWeight}"`;
    if (fontStyle !== "normal") attrs += ` font-style="${fontStyle}"`;
    if (anchor !== "start") attrs += ` text-anchor="${anchor}"`;

    return `<text ${attrs}>${this.escapeXml(text)}</text>`;
  }

  private processInlineMarkdown(text: string): string {
    // Strip markdown formatting for SVG (can't easily render bold/italic inline)
    // Just remove the markers for now
    return text
      .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold
      .replace(/\*([^*]+)\*/g, "$1") // Italic
      .replace(/`([^`]+)`/g, "$1") // Code
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // Links (text only)
  }

  private escapeXml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  private escapeAttr(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  private buildSvg(height: number): string {
    const width = this.options.width;

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>${this.defs.join("")}
  </defs>
  <rect width="100%" height="100%" fill="${this.options.background}"/>
${this.elements.join("\n")}
</svg>`;
  }
}

export interface TextRenderOptions {
  fontSize?: number;
  fontFamily?: string;
  fill?: string;
  bold?: boolean;
  italic?: boolean;
  fontWeight?: string;
  anchor?: "start" | "middle" | "end";
}

export function compileToSvg(
  doc: Document,
  options?: SvgCompileOptions
): SvgCompileResult {
  const compiler = new SvgCompiler(options);
  return compiler.compile(doc);
}
