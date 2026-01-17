/**
 * Built-in HTML Components
 *
 * Each component receives a context and returns HTML.
 */

export interface ComponentContext {
  /** Parsed arguments (positional as _0, _1, etc; flags by name) */
  args: Record<string, string | boolean>;
  /** Compile the block children to HTML */
  compileChildren: () => string;
  /** Get raw content from block children (no markdown processing) */
  getRawContent: () => string;
  /** Render markdown text to HTML */
  renderMarkdown: (text: string) => string;
  /** Register a CSS class as used */
  addClass: (cls: string) => void;
  /** Add custom CSS */
  addStyle: (css: string) => void;
}

export interface ComponentResult {
  html: string;
}

export type Component = (ctx: ComponentContext) => ComponentResult;

// Get argument value with default
function getArg(
  args: Record<string, string | boolean>,
  name: string,
  defaultValue: string = ""
): string {
  const val = args[name];
  if (val === undefined || val === true) return defaultValue;
  return String(val);
}

// Get positional argument
function getPositional(
  args: Record<string, string | boolean>,
  index: number,
  defaultValue: string = ""
): string {
  return getArg(args, `_${index}`, defaultValue);
}

// Check if flag is set
function hasFlag(args: Record<string, string | boolean>, name: string): boolean {
  return args[name] === true || (typeof args[name] === "string" && args[name] !== "");
}

/**
 * /page - Document setup
 * Usage: /page A4 --margin 2cm --title "My Document"
 */
const page: Component = (ctx) => {
  const size = getPositional(ctx.args, 0, "A4");
  const margin = getArg(ctx.args, "margin", "2cm");
  const orientation = hasFlag(ctx.args, "landscape") ? "landscape" : "portrait";
  const maxWidth = getArg(ctx.args, "max-width", "");

  let extraStyles = "";
  if (maxWidth) {
    extraStyles = `
    .poly-document {
      max-width: ${maxWidth};
      padding: 0;
    }`;
  }

  ctx.addStyle(`
    @page {
      size: ${size} ${orientation};
      margin: ${margin};
    }
    @media print {
      .poly-document {
        max-width: none;
        padding: 0;
      }
    }${extraStyles}
  `);

  // /page doesn't produce direct HTML, just sets up styles
  return { html: "" };
};

/**
 * /columns - Multi-column layout
 * Usage: /columns 2 -g 1.5cm { content }
 */
const columns: Component = (ctx) => {
  const count = getPositional(ctx.args, 0, "2");
  const gap = getArg(ctx.args, "g", "") || getArg(ctx.args, "gap", "1.5rem");

  const style = `grid-template-columns: repeat(${count}, 1fr); gap: ${gap};`;
  const children = ctx.compileChildren();

  return {
    html: `<div class="poly-columns" style="${style}">${children}</div>`,
  };
};

/**
 * /grid - CSS Grid layout
 * Usage: /grid "1fr 2fr" --gap 1rem { content }
 */
const grid: Component = (ctx) => {
  const template = getPositional(ctx.args, 0, "1fr 1fr");
  const gap = getArg(ctx.args, "gap", "1rem");

  const style = `grid-template-columns: ${template}; gap: ${gap};`;
  const children = ctx.compileChildren();

  return {
    html: `<div class="poly-grid" style="${style}">${children}</div>`,
  };
};

/**
 * /region - Styled container
 * Usage: /region --bg #f0f0f0 --padding 2rem { content }
 */
const region: Component = (ctx) => {
  const bg = getArg(ctx.args, "bg", "");
  const padding = getArg(ctx.args, "padding", "") || getArg(ctx.args, "p", "");
  const margin = getArg(ctx.args, "margin", "") || getArg(ctx.args, "m", "");

  let style = "";
  if (bg) style += `background: ${bg}; `;
  if (padding) style += `padding: ${padding}; `;
  if (margin) style += `margin: ${margin}; `;

  const children = ctx.compileChildren();

  return {
    html: `<div class="poly-region" style="${style}">${children}</div>`,
  };
};

/**
 * /sidebar - Positioned sidebar
 * Usage: /sidebar left --rotate 90deg { content }
 */
const sidebar: Component = (ctx) => {
  const position = getPositional(ctx.args, 0, "left");
  const rotate = getArg(ctx.args, "rotate", "");

  let style = "";
  if (position === "left") {
    style += "left: 0; top: 50%; transform: translateY(-50%)";
    if (rotate) style += ` rotate(${rotate})`;
    style += "; ";
  } else if (position === "right") {
    style += "right: 0; top: 50%; transform: translateY(-50%)";
    if (rotate) style += ` rotate(${rotate})`;
    style += "; ";
  }

  const children = ctx.compileChildren();

  return {
    html: `<aside class="poly-sidebar" style="${style}">${children}</aside>`,
  };
};

/**
 * /text - Styled inline text
 * Usage: /text "Hello" --bold --color red
 */
const text: Component = (ctx) => {
  const content = getPositional(ctx.args, 0, "");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "");
  const size = getArg(ctx.args, "size", "");
  const isBold = hasFlag(ctx.args, "bold") || hasFlag(ctx.args, "b");
  const isItalic = hasFlag(ctx.args, "italic") || hasFlag(ctx.args, "i");
  const rotate = getArg(ctx.args, "rotate", "");
  const tracking = getArg(ctx.args, "tracking", "");

  let style = "";
  if (color) style += `color: ${color}; `;
  if (size) style += `font-size: ${size}; `;
  if (isBold) style += `font-weight: bold; `;
  if (isItalic) style += `font-style: italic; `;
  if (rotate) style += `transform: rotate(${rotate}); display: inline-block; `;
  if (tracking) {
    const trackingValue = tracking === "wide" ? "0.1em" : tracking;
    style += `letter-spacing: ${trackingValue}; `;
  }

  return {
    html: `<span class="poly-text" style="${style}">${content}</span>`,
  };
};

/**
 * /quote - Blockquote or pullquote
 * Usage: /quote pull "The only way out is through."
 */
const quote: Component = (ctx) => {
  const style = getPositional(ctx.args, 0, "");
  const content = getPositional(ctx.args, 1, "") || ctx.compileChildren();

  const classes = ["poly-quote"];
  if (style === "pull" || style === "pullquote") {
    classes.push("pullquote");
  }

  return {
    html: `<blockquote class="${classes.join(" ")}">${content}</blockquote>`,
  };
};

/**
 * /hero - Hero section
 * Usage: /hero --bg blue { content }
 */
const hero: Component = (ctx) => {
  const bg = getArg(ctx.args, "bg", "");

  let style = "";
  if (bg) {
    if (bg.includes("gradient")) {
      style += `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; `;
    } else {
      style += `background: ${bg}; `;
    }
  }

  const children = ctx.compileChildren();

  return {
    html: `<section class="poly-hero" style="${style}">${children}</section>`,
  };
};

/**
 * /card - Card component
 * Usage: /card --icon rocket { content }
 */
const card: Component = (ctx) => {
  const icon = getArg(ctx.args, "icon", "");
  const children = ctx.compileChildren();

  let iconHtml = "";
  if (icon) {
    // Simple emoji mapping for common icons
    const iconMap: Record<string, string> = {
      rocket: "🚀",
      shield: "🛡️",
      heart: "❤️",
      star: "⭐",
      check: "✓",
      bolt: "⚡",
    };
    iconHtml = `<div class="poly-card-icon">${iconMap[icon] || icon}</div>`;
  }

  return {
    html: `<div class="poly-card">${iconHtml}${children}</div>`,
  };
};

/**
 * /button - Button element
 * Usage: /button primary "Click me"
 */
const button: Component = (ctx) => {
  const variant = getPositional(ctx.args, 0, "");
  const label = getPositional(ctx.args, 1, "") || ctx.compileChildren();

  const classes = ["poly-button"];
  if (variant === "primary") {
    classes.push("poly-button-primary");
  } else if (variant === "secondary") {
    classes.push("poly-button-secondary");
  }

  ctx.addStyle(`
    .poly-button {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      border-radius: 0.375rem;
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: 1px solid #e5e5e5;
      background: white;
    }
    .poly-button-primary {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }
    .poly-button-secondary {
      background: #f3f4f6;
      color: #374151;
    }
  `);

  return {
    html: `<button class="${classes.join(" ")}">${label}</button>`,
  };
};

/**
 * /center - Center content
 * Usage: /center { content }
 */
const center: Component = (ctx) => {
  const children = ctx.compileChildren();
  return {
    html: `<div style="text-align: center; display: flex; align-items: center; justify-content: center; flex-direction: column;">${children}</div>`,
  };
};

/**
 * /vcenter - Vertical and horizontal centering
 * Usage: /vcenter --height 100vh { content }
 */
const vcenter: Component = (ctx) => {
  const height = getArg(ctx.args, "height", "") || getArg(ctx.args, "h", "100%");
  const children = ctx.compileChildren();

  return {
    html: `<div style="display: flex; align-items: center; justify-content: center; flex-direction: column; height: ${height}; min-height: ${height};">${children}</div>`,
  };
};

/**
 * /frame - Bordered frame/box container
 * Usage: /frame --border "2px solid blue" { content }
 */
const frame: Component = (ctx) => {
  const border = getArg(ctx.args, "border", "") || getArg(ctx.args, "b", "1px solid #e5e5e5");
  const radius = getArg(ctx.args, "radius", "") || getArg(ctx.args, "r", "4px");
  const padding = getArg(ctx.args, "padding", "") || getArg(ctx.args, "p", "1rem");
  const bg = getArg(ctx.args, "bg", "");
  const children = ctx.compileChildren();

  let style = `border: ${border}; border-radius: ${radius}; padding: ${padding};`;
  if (bg) style += ` background: ${bg};`;

  return {
    html: `<div class="poly-frame" style="${style}">${children}</div>`,
  };
};

/**
 * /code - Enhanced code block with line numbers
 * Usage: /code typescript --lines { const x = 1; }
 */
const code: Component = (ctx) => {
  const language = getPositional(ctx.args, 0, "");
  const showLines = hasFlag(ctx.args, "lines") || hasFlag(ctx.args, "l");
  const startLine = parseInt(getArg(ctx.args, "start", "1"), 10);
  const title = getArg(ctx.args, "title", "") || getArg(ctx.args, "t", "");
  const highlight = getArg(ctx.args, "highlight", "");

  // Get raw content from block without markdown processing
  const content = ctx.getRawContent();

  // Parse highlight ranges
  const highlightLines = new Set<number>();
  if (highlight) {
    for (const part of highlight.split(",")) {
      if (part.includes("-")) {
        const [start, end] = part.split("-").map((n) => parseInt(n.trim(), 10));
        for (let i = start; i <= end; i++) highlightLines.add(i);
      } else {
        highlightLines.add(parseInt(part.trim(), 10));
      }
    }
  }

  ctx.addStyle(`
    .poly-code-block {
      position: relative;
      margin: 1rem 0;
    }
    .poly-code-title {
      font-family: ui-monospace, monospace;
      font-size: 0.85em;
      padding: 0.5rem 1rem;
      background: #2d2d2d;
      color: #a0a0a0;
      border-radius: 6px 6px 0 0;
      border-bottom: 1px solid #404040;
    }
    .poly-code-title + pre {
      margin-top: 0;
      border-radius: 0 0 6px 6px;
    }
    .poly-code-block pre {
      margin: 0;
      padding: 1rem;
      background: #1e1e1e;
      color: #e6e6e6;
      border-radius: 6px;
      overflow-x: auto;
    }
    .poly-code-block code {
      font-family: ui-monospace, monospace;
      font-size: 0.9em;
      color: #e6e6e6;
    }
    .poly-code-lines {
      display: table;
      width: 100%;
    }
    .poly-code-line {
      display: table-row;
    }
    .poly-code-line-number {
      display: table-cell;
      text-align: right;
      padding-right: 1rem;
      user-select: none;
      color: #606060;
      width: 1%;
      white-space: nowrap;
    }
    .poly-code-line-content {
      display: table-cell;
      white-space: pre;
      color: #e6e6e6;
    }
    .poly-code-line.highlighted {
      background: rgba(255, 255, 0, 0.1);
    }
    /* Polyester syntax highlighting */
    .poly-hl-command { color: #ff7b72; font-weight: 500; }
    .poly-hl-flag { color: #79c0ff; }
    .poly-hl-string { color: #a5d6ff; }
    .poly-hl-pipe { color: #ffa657; font-weight: 500; }
    .poly-hl-brace { color: #d2a8ff; }
  `);

  const langClass = language ? `language-${language}` : "";
  const lines = content.split("\n");
  const isPolyester = language === "polyester" || language === "poly";

  // Helper to highlight a line of code
  const highlightLine = (line: string): string => {
    return isPolyester ? highlightPolyester(line) : escapeHtml(line);
  };

  let codeHtml: string;
  if (showLines) {
    const lineHtml = lines
      .map((line, i) => {
        const lineNum = startLine + i;
        const isHighlighted = highlightLines.has(lineNum);
        const highlightClass = isHighlighted ? " highlighted" : "";
        return `<div class="poly-code-line${highlightClass}"><span class="poly-code-line-number">${lineNum}</span><span class="poly-code-line-content">${highlightLine(line)}</span></div>`;
      })
      .join("");
    codeHtml = `<div class="poly-code-lines">${lineHtml}</div>`;
  } else {
    codeHtml = isPolyester ? highlightPolyester(content) : escapeHtml(content);
  }

  const titleHtml = title ? `<div class="poly-code-title">${escapeHtml(title)}</div>` : "";

  return {
    html: `<div class="poly-code-block">${titleHtml}<pre><code class="${langClass}">${codeHtml}</code></pre></div>`,
  };
};

// Helper to escape HTML
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Custom syntax highlighter for Polyester code
 */
function highlightPolyester(code: string): string {
  let result = "";
  let i = 0;
  const len = code.length;

  while (i < len) {
    const char = code[i];
    const rest = code.slice(i);

    // Commands: /name at line start or after { or whitespace
    if (char === "/" && (i === 0 || /[\s{]/.test(code[i - 1]))) {
      let cmd = "/";
      i++;
      while (i < len && /[a-zA-Z0-9_-]/.test(code[i])) {
        cmd += code[i];
        i++;
      }
      if (cmd.length > 1) {
        result += `<span class="poly-hl-command">${escapeHtml(cmd)}</span>`;
        continue;
      }
      result += escapeHtml(cmd);
      continue;
    }

    // Long flags: --name
    if (rest.startsWith("--") && /[a-zA-Z]/.test(code[i + 2] || "")) {
      let flag = "--";
      i += 2;
      while (i < len && /[a-zA-Z0-9_-]/.test(code[i])) {
        flag += code[i];
        i++;
      }
      result += `<span class="poly-hl-flag">${escapeHtml(flag)}</span>`;
      continue;
    }

    // Short flags: -x (single letter)
    if (char === "-" && /[a-zA-Z]/.test(code[i + 1] || "") && !/[a-zA-Z0-9]/.test(code[i + 2] || "")) {
      const flag = "-" + code[i + 1];
      i += 2;
      result += `<span class="poly-hl-flag">${escapeHtml(flag)}</span>`;
      continue;
    }

    // Strings: "..." or '...'
    if (char === '"' || char === "'") {
      const quote = char;
      let str = char;
      i++;
      while (i < len && code[i] !== quote) {
        if (code[i] === "\\" && i + 1 < len) {
          str += code[i] + code[i + 1];
          i += 2;
        } else {
          str += code[i];
          i++;
        }
      }
      if (i < len) {
        str += code[i];
        i++;
      }
      result += `<span class="poly-hl-string">${escapeHtml(str)}</span>`;
      continue;
    }

    // Pipes: |
    if (char === "|") {
      result += `<span class="poly-hl-pipe">${escapeHtml(char)}</span>`;
      i++;
      continue;
    }

    // Braces: { }
    if (char === "{" || char === "}") {
      result += `<span class="poly-hl-brace">${escapeHtml(char)}</span>`;
      i++;
      continue;
    }

    // Comments: # at start of line (markdown headings, but also could be comments)
    // For now, treat # lines as markdown/content, don't highlight specially

    // Default: escape and add
    result += escapeHtml(char);
    i++;
  }

  return result;
}

/**
 * /table - Styled table
 * Usage: /table --header --striped { Name | Age\nJohn | 30 }
 */
const table: Component = (ctx) => {
  const hasHeader = hasFlag(ctx.args, "header");
  const striped = hasFlag(ctx.args, "striped");
  const bordered = hasFlag(ctx.args, "bordered");
  const dark = hasFlag(ctx.args, "dark");
  const align = getArg(ctx.args, "align", "");

  let content = ctx.compileChildren();
  // Strip any wrapping paragraphs from markdown processing
  content = content.replace(/<\/?p>/g, "").trim();

  ctx.addStyle(`
    .poly-table {
      width: 100%;
      border-collapse: collapse;
      margin: 1rem 0;
    }
    .poly-table th,
    .poly-table td {
      padding: 0.75rem 1rem;
      text-align: left;
    }
    .poly-table thead th {
      font-weight: 600;
      border-bottom: 2px solid #e5e5e5;
    }
    .poly-table.bordered th,
    .poly-table.bordered td {
      border: 1px solid #e5e5e5;
    }
    .poly-table.striped tbody tr:nth-child(odd) {
      background: #f9f9f9;
    }
    .poly-table.dark {
      color: #e6e6e6;
    }
    .poly-table.dark thead th {
      border-bottom-color: #4a5568;
    }
    .poly-table.dark.bordered th,
    .poly-table.dark.bordered td {
      border-color: #4a5568;
    }
    .poly-table.dark.striped tbody tr:nth-child(odd) {
      background: rgba(255, 255, 255, 0.05);
    }
  `);

  const classes = ["poly-table"];
  if (striped) classes.push("striped");
  if (bordered) classes.push("bordered");
  if (dark) classes.push("dark");

  // Parse table content: rows separated by newlines, cells by |
  const rows = content.split("\n").filter((r) => r.trim());
  const alignments = align.split("").map((c) => {
    if (c === "c") return "center";
    if (c === "r") return "right";
    return "left";
  });

  let html = `<table class="${classes.join(" ")}">`;

  rows.forEach((row, rowIndex) => {
    const cells = row.split("|").map((c) => c.trim());
    const isHeader = hasHeader && rowIndex === 0;

    if (isHeader) {
      html += "<thead><tr>";
      cells.forEach((cell, i) => {
        const style = alignments[i] ? `text-align: ${alignments[i]}` : "";
        html += `<th style="${style}">${cell}</th>`;
      });
      html += "</tr></thead><tbody>";
    } else {
      html += "<tr>";
      cells.forEach((cell, i) => {
        const style = alignments[i] ? `text-align: ${alignments[i]}` : "";
        html += `<td style="${style}">${cell}</td>`;
      });
      html += "</tr>";
    }
  });

  if (hasHeader) {
    html += "</tbody>";
  }
  html += "</table>";

  return { html };
};

/**
 * /list - Custom list with markers
 * Usage: /list --marker ">" { item 1\nitem 2 }
 */
const list: Component = (ctx) => {
  const marker = getArg(ctx.args, "marker", "") || getArg(ctx.args, "m", "");
  const ordered = hasFlag(ctx.args, "ordered") || hasFlag(ctx.args, "o");
  const start = parseInt(getArg(ctx.args, "start", "1"), 10);

  // Use raw content to avoid markdown wrapper divs
  const content = ctx.getRawContent();

  ctx.addStyle(`
    .poly-list {
      margin: 1rem 0;
      padding-left: 0;
      list-style: none;
    }
    .poly-list li {
      position: relative;
      padding-left: 1.5em;
      margin-bottom: 0.5em;
    }
    .poly-list li::before {
      position: absolute;
      left: 0;
    }
  `);

  const items = content.split("\n").filter((item) => item.trim());

  // Helper to render item markdown and strip wrapping <p> tags
  const renderItem = (text: string): string => {
    const html = ctx.renderMarkdown(text.trim());
    // Remove wrapping <p>...</p> for inline display
    return html.replace(/^<p>(.*)<\/p>\s*$/s, "$1");
  };

  if (ordered) {
    const itemsHtml = items
      .map((item, i) => `<li style="list-style: none;"><span style="position: absolute; left: 0;">${start + i}.</span> ${renderItem(item)}</li>`)
      .join("");
    return { html: `<ol class="poly-list" start="${start}">${itemsHtml}</ol>` };
  } else {
    const markerChar = marker || "•";
    const itemsHtml = items
      .map((item) => `<li><span style="position: absolute; left: 0;">${markerChar}</span> ${renderItem(item)}</li>`)
      .join("");
    return { html: `<ul class="poly-list">${itemsHtml}</ul>` };
  }
};

/**
 * /checkbox - Task list checkbox
 * Usage: /checkbox "Task name" --checked
 */
const checkbox: Component = (ctx) => {
  const label = getPositional(ctx.args, 0, "");
  const checked = hasFlag(ctx.args, "checked") || hasFlag(ctx.args, "x");

  ctx.addStyle(`
    .poly-checkbox {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0.25rem 0;
    }
    .poly-checkbox input {
      width: 1.1em;
      height: 1.1em;
      margin: 0;
    }
    .poly-checkbox.checked label {
      text-decoration: line-through;
      opacity: 0.7;
    }
  `);

  const checkedAttr = checked ? "checked" : "";
  const checkedClass = checked ? " checked" : "";
  const id = `cb-${Math.random().toString(36).slice(2, 9)}`;

  return {
    html: `<div class="poly-checkbox${checkedClass}"><input type="checkbox" id="${id}" ${checkedAttr} disabled><label for="${id}">${escapeHtml(label)}</label></div>`,
  };
};

/**
 * /image - Image with sizing
 * Usage: /image "photo.jpg" --width 50%
 */
const image: Component = (ctx) => {
  const path = getPositional(ctx.args, 0, "");
  const width = getArg(ctx.args, "width", "") || getArg(ctx.args, "w", "");
  const height = getArg(ctx.args, "height", "") || getArg(ctx.args, "h", "");
  const alt = getArg(ctx.args, "alt", "");
  const caption = getArg(ctx.args, "caption", "");
  const align = getArg(ctx.args, "align", "center");

  ctx.addStyle(`
    .poly-figure {
      margin: 1.5rem 0;
    }
    .poly-figure.align-center {
      text-align: center;
    }
    .poly-figure.align-left {
      text-align: left;
    }
    .poly-figure.align-right {
      text-align: right;
    }
    .poly-figure img {
      max-width: 100%;
      height: auto;
    }
    .poly-figure figcaption {
      margin-top: 0.5rem;
      font-size: 0.9em;
      color: #666;
      font-style: italic;
    }
  `);

  let style = "";
  if (width) style += `width: ${width};`;
  if (height) style += `height: ${height};`;

  const imgHtml = `<img src="${escapeHtml(path)}" alt="${escapeHtml(alt)}" style="${style}">`;
  const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";

  return {
    html: `<figure class="poly-figure align-${align}">${imgHtml}${captionHtml}</figure>`,
  };
};

/**
 * /fold - Collapsible section
 * Usage: /fold "Click to expand" { content }
 */
const fold: Component = (ctx) => {
  const title = getPositional(ctx.args, 0, "Details");
  const open = hasFlag(ctx.args, "open");
  const children = ctx.compileChildren();

  ctx.addStyle(`
    .poly-fold {
      margin: 1rem 0;
      border: 1px solid #e5e5e5;
      border-radius: 4px;
    }
    .poly-fold summary {
      padding: 0.75rem 1rem;
      cursor: pointer;
      font-weight: 500;
      background: #f9f9f9;
      border-radius: 4px;
    }
    .poly-fold[open] summary {
      border-bottom: 1px solid #e5e5e5;
      border-radius: 4px 4px 0 0;
    }
    .poly-fold .poly-fold-content {
      padding: 1rem;
    }
  `);

  const openAttr = open ? " open" : "";

  return {
    html: `<details class="poly-fold"${openAttr}><summary>${escapeHtml(title)}</summary><div class="poly-fold-content">${children}</div></details>`,
  };
};

/**
 * /style - Custom CSS injection
 * Usage: /style { .my-class { color: red; } }
 */
const style: Component = (ctx) => {
  const css = ctx.getRawContent();
  ctx.addStyle(css);
  return { html: "" };
};

/**
 * /shape - Basic shapes
 * Usage: /shape circle --size 50px --fill red
 */
const shape: Component = (ctx) => {
  const type = getPositional(ctx.args, 0, "rect");
  const size = getArg(ctx.args, "size", "") || getArg(ctx.args, "s", "100px");
  const width = getArg(ctx.args, "width", "") || getArg(ctx.args, "w", size);
  const height = getArg(ctx.args, "height", "") || getArg(ctx.args, "h", size);
  const fill = getArg(ctx.args, "fill", "") || getArg(ctx.args, "f", "transparent");
  const stroke = getArg(ctx.args, "stroke", "");
  const strokeWidth = getArg(ctx.args, "stroke-width", "1px");

  ctx.addStyle(`
    .poly-shape {
      display: inline-block;
    }
  `);

  if (type === "circle") {
    const diameter = size;
    let style = `width: ${diameter}; height: ${diameter}; border-radius: 50%; background: ${fill};`;
    if (stroke) style += ` border: ${strokeWidth} solid ${stroke};`;
    return { html: `<div class="poly-shape" style="${style}"></div>` };
  } else if (type === "line") {
    let style = `width: ${width}; height: ${strokeWidth}; background: ${stroke || fill || "#000"};`;
    return { html: `<div class="poly-shape" style="${style}"></div>` };
  } else {
    // Default: rect
    let style = `width: ${width}; height: ${height}; background: ${fill};`;
    if (stroke) style += ` border: ${strokeWidth} solid ${stroke};`;
    return { html: `<div class="poly-shape" style="${style}"></div>` };
  }
};

// Export all components
export const components: Record<string, Component> = {
  page,
  columns,
  grid,
  region,
  sidebar,
  text,
  quote,
  hero,
  card,
  button,
  center,
  vcenter,
  frame,
  code,
  table,
  list,
  checkbox,
  image,
  fold,
  shape,
  style,
};
