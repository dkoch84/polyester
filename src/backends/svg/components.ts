/**
 * SVG Components
 *
 * Each component receives context and adds SVG elements.
 */

import { LayoutState, TextRenderOptions } from "./compiler.js";

export interface SvgComponentContext {
  args: Record<string, string | boolean>;
  layout: LayoutState;
  compileChildren: () => number; // Returns height consumed
  getRawContent: () => string;
  addElement: (element: string) => void;
  insertElementAt: (index: number, element: string) => void;
  getElementCount: () => number;
  addDef: (id: string, def: string) => void;
  updateLayout: (updates: Partial<LayoutState>) => void;
  wrapLink: (content: string, href: string) => string;
  escapeText: (text: string) => string;
  escapeAttr: (text: string) => string;
  renderText: (text: string, x: number, y: number, opts?: TextRenderOptions) => string;
}

export interface SvgComponentResult {
  height: number;
}

export type SvgComponent = (ctx: SvgComponentContext) => SvgComponentResult;

// Helper functions
function getArg(
  args: Record<string, string | boolean>,
  name: string,
  defaultValue: string = ""
): string {
  const val = args[name];
  if (val === undefined || val === true) return defaultValue;
  return String(val);
}

function getPositional(
  args: Record<string, string | boolean>,
  index: number,
  defaultValue: string = ""
): string {
  return getArg(args, `_${index}`, defaultValue);
}

function hasFlag(args: Record<string, string | boolean>, name: string): boolean {
  return args[name] === true || (typeof args[name] === "string" && args[name] !== "");
}

/**
 * /page - Document setup (mostly ignored in SVG, but we can use it for sizing)
 */
const page: SvgComponent = (ctx) => {
  // Page doesn't render anything directly in SVG
  return { height: 0 };
};

/**
 * /hero - Hero section with gradient background
 */
const hero: SvgComponent = (ctx) => {
  const bg = getArg(ctx.args, "bg", "");
  const startY = ctx.layout.y;
  const padding = 60;

  // Save layout state and element position
  const savedColor = ctx.layout.color;
  const bgInsertIndex = ctx.getElementCount();

  // Determine fill
  let fill = bg || "#f8fafc";
  if (bg.includes("gradient")) {
    fill = "url(#polyGradient)";
  }

  // Prepare for children
  ctx.updateLayout({
    y: startY + padding,
    color: "#ffffff",
  });

  // Compile children to get height
  const childHeight = ctx.compileChildren();

  const totalHeight = childHeight + padding * 2;
  const endY = startY + totalHeight;

  // Insert background rect at the position before children
  ctx.insertElementAt(
    bgInsertIndex,
    `<rect x="0" y="${startY}" width="${ctx.layout.width + 80}" height="${totalHeight}" fill="${fill}"/>`
  );

  // Restore color and update Y
  ctx.updateLayout({
    y: endY + 20,
    color: savedColor,
  });

  return { height: totalHeight };
};

/**
 * /text - Styled text
 */
const text: SvgComponent = (ctx) => {
  const content = getPositional(ctx.args, 0, "");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "");
  const size = getArg(ctx.args, "size", "");
  const isBold = hasFlag(ctx.args, "bold") || hasFlag(ctx.args, "b");
  const isItalic = hasFlag(ctx.args, "italic") || hasFlag(ctx.args, "i");

  // Parse size (e.g., "3rem", "24px", "1.5rem")
  let fontSize = ctx.layout.fontSize;
  if (size) {
    if (size.endsWith("rem")) {
      fontSize = parseFloat(size) * ctx.layout.fontSize;
    } else if (size.endsWith("px")) {
      fontSize = parseFloat(size);
    } else if (size.endsWith("em")) {
      fontSize = parseFloat(size) * ctx.layout.fontSize;
    }
  }

  const fill = color || ctx.layout.color;
  const centerX = ctx.layout.x + ctx.layout.width / 2;

  // Calculate text position (baseline) - add fontSize for the text height
  const textY = ctx.layout.y + fontSize;

  const textEl = ctx.renderText(content, centerX, textY, {
    fontSize,
    fill,
    bold: isBold,
    italic: isItalic,
    anchor: "middle",
  });

  ctx.addElement(textEl);

  // Update layout for next element: text baseline + spacing
  const nextY = textY + fontSize * 0.5;
  ctx.updateLayout({ y: nextY });

  return { height: fontSize * 1.5 };
};

/**
 * /button - Clickable button
 */
const button: SvgComponent = (ctx) => {
  const variant = getPositional(ctx.args, 0, "primary");
  const label = getPositional(ctx.args, 1, "Button");
  const href = getArg(ctx.args, "href", "");

  const buttonHeight = 44;
  const buttonWidth = Math.max(140, label.length * 10 + 48);
  const centerX = ctx.layout.x + ctx.layout.width / 2;
  const buttonX = centerX - buttonWidth / 2;
  const buttonY = ctx.layout.y + 15; // Add spacing from previous element

  // Colors based on variant
  const isPrimary = variant === "primary";
  const bgColor = isPrimary ? "#8b5cf6" : "transparent";
  const textColor = isPrimary ? "#ffffff" : "#8b5cf6";
  const stroke = isPrimary ? "none" : "#8b5cf6";
  const strokeWidth = isPrimary ? 0 : 2;

  let buttonSvg = `<rect x="${buttonX}" y="${buttonY}" width="${buttonWidth}" height="${buttonHeight}" rx="8" fill="${bgColor}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
  <text x="${centerX}" y="${buttonY + buttonHeight / 2 + 5}" font-family="${ctx.layout.fontFamily}" font-size="15" fill="${textColor}" text-anchor="middle" font-weight="600">${ctx.escapeText(label)}</text>`;

  if (href) {
    buttonSvg = ctx.wrapLink(buttonSvg, href);
  }

  ctx.addElement(buttonSvg);

  // Update layout for next element
  const nextY = buttonY + buttonHeight + 15;
  ctx.updateLayout({ y: nextY });

  return { height: buttonHeight + 30 };
};

/**
 * /code - Code block
 */
const code: SvgComponent = (ctx) => {
  const language = getPositional(ctx.args, 0, "");
  const content = ctx.getRawContent();
  const lines = content.split("\n");

  const padding = 16;
  const lineHeight = 20;
  const codeHeight = lines.length * lineHeight + padding * 2;
  const startY = ctx.layout.y + 10;

  // Background
  ctx.addElement(
    `<rect x="${ctx.layout.x}" y="${startY}" width="${ctx.layout.width}" height="${codeHeight}" rx="8" fill="#1e1e1e"/>`
  );

  // Code lines
  const codeX = ctx.layout.x + padding;
  let codeY = startY + padding + 14; // baseline offset

  for (const line of lines) {
    // Apply Polyester syntax highlighting if applicable
    if (language === "polyester" || language === "poly") {
      ctx.addElement(renderPolyesterLine(line, codeX, codeY, ctx));
    } else {
      ctx.addElement(
        `<text x="${codeX}" y="${codeY}" font-family="ui-monospace, monospace" font-size="14" fill="#e6e6e6">${ctx.escapeText(line)}</text>`
      );
    }
    codeY += lineHeight;
  }

  ctx.updateLayout({ y: startY + codeHeight + 20 });

  return { height: codeHeight + 30 };
};

function renderPolyesterLine(line: string, x: number, y: number, ctx: SvgComponentContext): string {
  // Simple Polyester syntax highlighting
  const elements: string[] = [];
  let currentX = x;
  const charWidth = 8.4; // Approximate monospace char width at 14px

  // Tokenize the line
  const tokens = tokenizePolyester(line);

  for (const token of tokens) {
    const color = getTokenColor(token.type);
    const width = token.text.length * charWidth;

    elements.push(
      `<text x="${currentX}" y="${y}" font-family="ui-monospace, monospace" font-size="14" fill="${color}">${ctx.escapeText(token.text)}</text>`
    );
    currentX += width;
  }

  return elements.join("");
}

interface Token {
  type: "command" | "flag" | "string" | "pipe" | "brace" | "text";
  text: string;
}

function tokenizePolyester(line: string): Token[] {
  const tokens: Token[] = [];
  let remaining = line;

  while (remaining.length > 0) {
    // Command
    if (remaining.match(/^\/[a-zA-Z][\w-]*/)) {
      const match = remaining.match(/^\/[a-zA-Z][\w-]*/)!;
      tokens.push({ type: "command", text: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Flag
    if (remaining.match(/^--?[a-zA-Z][\w-]*/)) {
      const match = remaining.match(/^--?[a-zA-Z][\w-]*/)!;
      tokens.push({ type: "flag", text: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // String
    if (remaining.match(/^"[^"]*"/)) {
      const match = remaining.match(/^"[^"]*"/)!;
      tokens.push({ type: "string", text: match[0] });
      remaining = remaining.slice(match[0].length);
      continue;
    }

    // Pipe
    if (remaining.startsWith("|")) {
      tokens.push({ type: "pipe", text: "|" });
      remaining = remaining.slice(1);
      continue;
    }

    // Braces
    if (remaining.startsWith("{") || remaining.startsWith("}")) {
      tokens.push({ type: "brace", text: remaining[0] });
      remaining = remaining.slice(1);
      continue;
    }

    // Regular text (consume until next special char)
    const match = remaining.match(/^[^/\-"|{}]+/);
    if (match) {
      tokens.push({ type: "text", text: match[0] });
      remaining = remaining.slice(match[0].length);
    } else {
      // Single character fallback
      tokens.push({ type: "text", text: remaining[0] });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}

function getTokenColor(type: Token["type"]): string {
  switch (type) {
    case "command":
      return "#ff7b72";
    case "flag":
      return "#79c0ff";
    case "string":
      return "#a5d6ff";
    case "pipe":
      return "#ffa657";
    case "brace":
      return "#d2a8ff";
    default:
      return "#e6e6e6";
  }
}

/**
 * /table - Render a table
 */
const table: SvgComponent = (ctx) => {
  const hasHeader = hasFlag(ctx.args, "header");
  const bordered = hasFlag(ctx.args, "bordered");

  const content = ctx.getRawContent();
  const rows = content.split("\n").filter((r) => r.trim());

  if (rows.length === 0) return { height: 0 };

  const cellPadding = 12;
  const rowHeight = 36;
  const startY = ctx.layout.y + 10;
  const tableWidth = ctx.layout.width;

  // Parse cells
  const parsedRows = rows.map((row) =>
    row.split("|").map((cell) => cell.trim())
  );

  const numCols = Math.max(...parsedRows.map((r) => r.length));
  const colWidth = tableWidth / numCols;

  let currentY = startY;

  // Table background
  const tableHeight = rows.length * rowHeight;
  ctx.addElement(
    `<rect x="${ctx.layout.x}" y="${startY}" width="${tableWidth}" height="${tableHeight}" fill="#ffffff" stroke="${bordered ? "#e5e7eb" : "none"}" stroke-width="1" rx="4"/>`
  );

  for (let rowIdx = 0; rowIdx < parsedRows.length; rowIdx++) {
    const row = parsedRows[rowIdx];
    const isHeaderRow = hasHeader && rowIdx === 0;
    const cellY = currentY;

    // Header background
    if (isHeaderRow) {
      ctx.addElement(
        `<rect x="${ctx.layout.x}" y="${cellY}" width="${tableWidth}" height="${rowHeight}" fill="#f9fafb" rx="${rowIdx === 0 ? "4" : "0"}"/>`
      );
    }

    // Row border
    if (bordered && rowIdx > 0) {
      ctx.addElement(
        `<line x1="${ctx.layout.x}" y1="${cellY}" x2="${ctx.layout.x + tableWidth}" y2="${cellY}" stroke="#e5e7eb" stroke-width="1"/>`
      );
    }

    // Cells
    for (let colIdx = 0; colIdx < row.length; colIdx++) {
      const cellX = ctx.layout.x + colIdx * colWidth + cellPadding;
      const textY = cellY + rowHeight / 2 + 5;

      // Column border
      if (bordered && colIdx > 0) {
        ctx.addElement(
          `<line x1="${ctx.layout.x + colIdx * colWidth}" y1="${cellY}" x2="${ctx.layout.x + colIdx * colWidth}" y2="${cellY + rowHeight}" stroke="#e5e7eb" stroke-width="1"/>`
        );
      }

      ctx.addElement(
        `<text x="${cellX}" y="${textY}" font-family="${ctx.layout.fontFamily}" font-size="14" fill="#1a1a1a" font-weight="${isHeaderRow ? "600" : "normal"}">${ctx.escapeText(row[colIdx] || "")}</text>`
      );
    }

    currentY += rowHeight;
  }

  // Bottom border for header
  if (hasHeader && parsedRows.length > 0) {
    ctx.addElement(
      `<line x1="${ctx.layout.x}" y1="${startY + rowHeight}" x2="${ctx.layout.x + tableWidth}" y2="${startY + rowHeight}" stroke="#e5e7eb" stroke-width="2"/>`
    );
  }

  ctx.updateLayout({ y: currentY + 20 });

  return { height: tableHeight + 30 };
};

/**
 * /columns - Multi-column layout (simplified for SVG)
 */
const columns: SvgComponent = (ctx) => {
  // For SVG, columns are complex. For now, just render children vertically.
  // A proper implementation would need to track column positions.
  const height = ctx.compileChildren();
  return { height };
};

/**
 * /region - Container (mostly for grouping in SVG)
 */
const region: SvgComponent = (ctx) => {
  const bg = getArg(ctx.args, "bg", "");
  const padding = getArg(ctx.args, "padding", "");

  let paddingPx = 0;
  if (padding) {
    if (padding.endsWith("rem")) {
      paddingPx = parseFloat(padding) * 16;
    } else if (padding.endsWith("px")) {
      paddingPx = parseFloat(padding);
    }
  }

  const startY = ctx.layout.y;

  if (paddingPx) {
    ctx.updateLayout({ y: ctx.layout.y + paddingPx });
  }

  const childHeight = ctx.compileChildren();

  if (paddingPx) {
    ctx.updateLayout({ y: ctx.layout.y + paddingPx });
  }

  const totalHeight = ctx.layout.y - startY;

  // Background if specified
  if (bg) {
    // Insert background rect (would need to be inserted before children)
    // For simplicity, skip background for now unless we refactor
  }

  return { height: totalHeight };
};

/**
 * /card - Card component
 */
const card: SvgComponent = (ctx) => {
  const icon = getArg(ctx.args, "icon", "");
  const startY = ctx.layout.y;
  const padding = 20;

  // Card background
  const cardX = ctx.layout.x;
  const cardWidth = ctx.layout.width;

  ctx.updateLayout({ y: ctx.layout.y + padding });

  // Icon
  if (icon) {
    const iconMap: Record<string, string> = {
      rocket: "🚀",
      shield: "🛡️",
      heart: "❤️",
      star: "⭐",
      check: "✓",
      bolt: "⚡",
    };
    const iconChar = iconMap[icon] || icon;
    ctx.addElement(
      `<text x="${cardX + padding}" y="${ctx.layout.y + 20}" font-size="24">${iconChar}</text>`
    );
    ctx.updateLayout({ y: ctx.layout.y + 35 });
  }

  const childHeight = ctx.compileChildren();

  ctx.updateLayout({ y: ctx.layout.y + padding });

  const totalHeight = ctx.layout.y - startY;

  // Draw card border (insert at position)
  ctx.addElement(
    `<rect x="${cardX}" y="${startY}" width="${cardWidth}" height="${totalHeight}" rx="8" fill="none" stroke="#e5e5e5" stroke-width="1"/>`
  );

  return { height: totalHeight };
};

/**
 * /quote - Blockquote
 */
const quote: SvgComponent = (ctx) => {
  const style = getPositional(ctx.args, 0, "");
  const isPull = style === "pull";

  const startY = ctx.layout.y + 10;
  const content = ctx.getRawContent() || getPositional(ctx.args, 1, "");

  if (isPull) {
    // Pull quote - centered, larger
    const fontSize = ctx.layout.fontSize * 1.5;
    ctx.updateLayout({ y: startY + fontSize });

    ctx.addElement(
      `<text x="${ctx.layout.x + ctx.layout.width / 2}" y="${ctx.layout.y}" font-family="${ctx.layout.fontFamily}" font-size="${fontSize}" fill="#666666" text-anchor="middle" font-style="italic">${ctx.escapeText(content)}</text>`
    );

    ctx.updateLayout({ y: ctx.layout.y + fontSize });
    return { height: fontSize * 2 + 20 };
  }

  // Regular blockquote
  const barX = ctx.layout.x;
  const textX = ctx.layout.x + 20;
  const lines = content.split("\n");
  const lineHeight = ctx.layout.fontSize * 1.5;
  const quoteHeight = lines.length * lineHeight + 20;

  // Quote bar
  ctx.addElement(
    `<rect x="${barX}" y="${startY}" width="4" height="${quoteHeight - 20}" fill="#e5e5e5"/>`
  );

  let currentY = startY + ctx.layout.fontSize;
  for (const line of lines) {
    ctx.addElement(
      `<text x="${textX}" y="${currentY}" font-family="${ctx.layout.fontFamily}" font-size="${ctx.layout.fontSize}" fill="#666666" font-style="italic">${ctx.escapeText(line)}</text>`
    );
    currentY += lineHeight;
  }

  ctx.updateLayout({ y: startY + quoteHeight });

  return { height: quoteHeight };
};

/**
 * /list - List component
 */
const list: SvgComponent = (ctx) => {
  const marker = getArg(ctx.args, "marker", "•");
  const ordered = hasFlag(ctx.args, "ordered");

  const content = ctx.getRawContent();
  const items = content.split("\n").filter((line) => line.trim());

  const startY = ctx.layout.y + 10;
  let currentY = startY;
  const lineHeight = ctx.layout.fontSize * 1.6;

  for (let i = 0; i < items.length; i++) {
    const item = items[i].trim();
    const bulletX = ctx.layout.x + 10;
    const textX = ctx.layout.x + 30;

    currentY += lineHeight;

    // Marker
    const markerText = ordered ? `${i + 1}.` : marker;
    ctx.addElement(
      `<text x="${bulletX}" y="${currentY}" font-family="${ctx.layout.fontFamily}" font-size="${ctx.layout.fontSize}" fill="${ctx.layout.color}">${ctx.escapeText(markerText)}</text>`
    );

    // Text
    ctx.addElement(
      `<text x="${textX}" y="${currentY}" font-family="${ctx.layout.fontFamily}" font-size="${ctx.layout.fontSize}" fill="${ctx.layout.color}">${ctx.escapeText(item)}</text>`
    );
  }

  ctx.updateLayout({ y: currentY + 10 });

  return { height: currentY - startY + 10 };
};

/**
 * /style - Custom CSS (ignored in SVG)
 */
const style: SvgComponent = () => {
  return { height: 0 };
};

/**
 * /center - Center content
 */
const center: SvgComponent = (ctx) => {
  // Content is already centered for text components
  const height = ctx.compileChildren();
  return { height };
};

/**
 * /vcenter - Vertical center (approximation for SVG)
 */
const vcenter: SvgComponent = (ctx) => {
  // For SVG README, just render normally
  const height = ctx.compileChildren();
  return { height };
};

/**
 * /frame - Bordered frame
 */
const frame: SvgComponent = (ctx) => {
  const border = getArg(ctx.args, "border", "1px solid #e5e5e5");
  const radius = getArg(ctx.args, "radius", "8px");
  const padding = getArg(ctx.args, "padding", "1rem");

  let paddingPx = 16;
  if (padding.endsWith("rem")) {
    paddingPx = parseFloat(padding) * 16;
  } else if (padding.endsWith("px")) {
    paddingPx = parseFloat(padding);
  }

  let radiusPx = 8;
  if (radius.endsWith("px")) {
    radiusPx = parseFloat(radius);
  }

  const startY = ctx.layout.y;
  ctx.updateLayout({ y: ctx.layout.y + paddingPx });

  const childHeight = ctx.compileChildren();

  ctx.updateLayout({ y: ctx.layout.y + paddingPx });

  const totalHeight = ctx.layout.y - startY;

  // Parse border (simplified)
  const borderMatch = border.match(/(\d+)px\s+(\w+)\s+(#?\w+)/);
  const strokeWidth = borderMatch ? parseInt(borderMatch[1]) : 1;
  const strokeColor = borderMatch ? borderMatch[3] : "#e5e5e5";

  ctx.addElement(
    `<rect x="${ctx.layout.x}" y="${startY}" width="${ctx.layout.width}" height="${totalHeight}" rx="${radiusPx}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidth}"/>`
  );

  return { height: totalHeight };
};

// Export all components
export const components: Record<string, SvgComponent> = {
  page,
  hero,
  text,
  button,
  code,
  table,
  columns,
  region,
  card,
  quote,
  list,
  style,
  center,
  vcenter,
  frame,
};
