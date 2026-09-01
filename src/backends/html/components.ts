/**
 * Built-in HTML Components
 *
 * Each component receives a context and returns HTML.
 */

import hljs from "highlight.js";
import { getIcon } from "./icons.js";
import { resolveStyleRef, loadStyle } from "../../library/index.js";
import type { PageSettings } from "./compiler.js";
import { fontCacheKey, type FontCache } from "./fonts.js";
import type { DiagnosticSeverity } from "../../diagnostics.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve as resolvePath, extname, isAbsolute } from "node:path";

const IMAGE_MIME: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

/**
 * Embed a local image as a data URI so it resolves in both standalone HTML and
 * PDF (Puppeteer) output, where relative paths have no base to resolve against.
 * Remote URLs, existing data URIs, and unreadable/unknown files are passed through unchanged.
 */
function embedImage(src: string, sourceDir?: string): string {
  if (/^(https?:|data:|\/\/)/i.test(src)) return src;
  try {
    const abs = isAbsolute(src) ? src : resolvePath(sourceDir || process.cwd(), src);
    if (!existsSync(abs)) return src;
    const mime = IMAGE_MIME[extname(abs).toLowerCase()];
    if (!mime) return src;
    return `data:${mime};base64,${readFileSync(abs).toString("base64")}`;
  } catch {
    return src;
  }
}

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
  /**
   * Add CSS authored by the document (/style, /import). Lands after component
   * and theme CSS so the document always wins.
   */
  addUserStyle: (css: string) => void;
  /** Set page settings (for PDF generation) */
  setPageSettings: (settings: Partial<PageSettings>) => void;
  /** Directory of the source document — used by /import to resolve relative paths. */
  sourceDir?: string;
  /** Pre-resolved /font cache populated by the async prefetch pass. */
  fontCache?: FontCache;
  /**
   * Report a problem against this command. Errors fail the build; the compiler
   * attaches the source line and reports everything once, after the final pass.
   */
  report: (severity: DiagnosticSeverity, message: string) => void;
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

// ======== Pattern Background Helpers ========

interface PatternCSS {
  backgroundImage: string;
  backgroundSize: string;
  maskImage?: string;
}

/**
 * Generate CSS properties for a background pattern.
 */
function generatePatternCSS(opts: {
  pattern: string;
  size?: string;
  color?: string;
  fade?: string;
}): PatternCSS {
  const size = opts.size || "64px";
  const color = opts.color || "rgba(0,0,0,0.1)";
  const fade = opts.fade || "none";

  let backgroundImage: string;
  let backgroundSize: string;

  switch (opts.pattern) {
    case "dots":
      backgroundImage = `radial-gradient(circle, ${color} 1px, transparent 1px)`;
      backgroundSize = `${size} ${size}`;
      break;
    case "cross": {
      const h = `linear-gradient(0deg, ${color} 40%, transparent 40%, transparent 60%, ${color} 60%)`;
      const v = `linear-gradient(90deg, ${color} 40%, transparent 40%, transparent 60%, ${color} 60%)`;
      backgroundImage = `${h}, ${v}`;
      backgroundSize = `${size} ${size}, ${size} ${size}`;
      break;
    }
    case "diagonal":
      backgroundImage = `repeating-linear-gradient(45deg, transparent, transparent 10px, ${color} 10px, ${color} 11px)`;
      backgroundSize = `${size} ${size}`;
      break;
    case "grid":
    default:
      backgroundImage = `linear-gradient(${color} 1px, transparent 1px), linear-gradient(90deg, ${color} 1px, transparent 1px)`;
      backgroundSize = `${size} ${size}, ${size} ${size}`;
      break;
  }

  let maskImage: string | undefined;
  if (fade === "radial") {
    maskImage = "radial-gradient(ellipse 70% 70% at 50% 50%, black 40%, transparent 100%)";
  } else if (fade === "edges") {
    maskImage = "radial-gradient(ellipse 80% 80% at 50% 50%, black 50%, transparent 100%)";
  }

  return { backgroundImage, backgroundSize, maskImage };
}

/**
 * Convert pattern CSS into an inline style string, optionally composing with an existing background.
 */
function patternToInlineStyle(patternCss: PatternCSS, existingBg?: string): string {
  let style = "";

  if (existingBg) {
    if (existingBg.includes("gradient") || existingBg.includes("url(")) {
      // Compose: pattern layers first, base gradient last
      style += `background-image: ${patternCss.backgroundImage}, ${existingBg}; `;
      // Add "cover" for the base gradient layer
      style += `background-size: ${patternCss.backgroundSize}, cover; `;
    } else {
      // Solid color — use background-color so it doesn't conflict
      style += `background-color: ${existingBg}; `;
      style += `background-image: ${patternCss.backgroundImage}; `;
      style += `background-size: ${patternCss.backgroundSize}; `;
    }
  } else {
    style += `background-image: ${patternCss.backgroundImage}; `;
    style += `background-size: ${patternCss.backgroundSize}; `;
  }

  if (patternCss.maskImage) {
    style += `-webkit-mask-image: ${patternCss.maskImage}; mask-image: ${patternCss.maskImage}; `;
  }

  return style;
}

/**
 * /page - Document setup
 * Usage: /page A4 --mode pdf --margin 2cm
 * Usage: /page --mode web (continuous, no page boundaries)
 * Usage: /page A4 --mode print (paginated with print considerations)
 *
 * --mode values:
 *   web   — continuous flow, no page boundaries (default when no size given)
 *   pdf   — paginated for digital PDF output (default when size given)
 *   print — paginated for physical printing
 *
 * Legacy: --pageless is accepted as an alias for --mode web.
 */
const page: Component = (ctx) => {
  const size = getPositional(ctx.args, 0, "");
  const margin = getArg(ctx.args, "margin", "2cm");
  const orientation = hasFlag(ctx.args, "landscape") ? "landscape" : "portrait";
  const maxWidth = getArg(ctx.args, "max-width", "");
  const pageless = hasFlag(ctx.args, "pageless");
  const theme = getArg(ctx.args, "theme", "");
  const style = getArg(ctx.args, "style", "");
  const spacing = getArg(ctx.args, "spacing", "");
  const font = getArg(ctx.args, "font", "");

  // Resolve --mode (web | pdf | print) with legacy --pageless and size-based defaults.
  const modeArg = String(getArg(ctx.args, "mode", "")).toLowerCase();
  let mode: "web" | "pdf" | "print";
  if (modeArg === "web" || modeArg === "pdf" || modeArg === "print") {
    mode = modeArg;
  } else if (pageless) {
    mode = "web";
  } else {
    mode = size ? "pdf" : "web";
  }
  const isPaginated = mode !== "web";

  // Store page settings for PDF generation and theme resolution
  ctx.setPageSettings({
    ...(size && { size }),
    margin,
    orientation,
    pageless: !isPaginated,
    mode,
    ...(theme && { theme }),
    ...(style && { style }),
    ...(spacing && { spacing }),
  });

  if (font) {
    ctx.addStyle(`
    .poly-document {
      --poly-font-body: ${font};
      --poly-font-heading: ${font};
    }`);
  }

  let extraStyles = "";
  if (maxWidth) {
    extraStyles = `
    .poly-document {
      max-width: ${maxWidth};
      padding: 0;
    }`;
  }

  if (!isPaginated || !size) {
    // No page size or pageless: don't set @page rules, let content flow naturally
    ctx.addStyle(`
    @media print {
      .poly-document {
        max-width: none;
        padding: 0;
      }
    }${extraStyles}
  `);
  } else {
    // Paginated docs: PDF generation runs the pagination sim, which creates
    // .poly-page wrappers whose padding provides the physical margin.
    // @page margin must therefore be 0 to avoid double-margining.
    ctx.addStyle(`
    @page {
      size: ${size} ${orientation};
      margin: 0;
    }
    @media print {
      .poly-document {
        max-width: none;
        padding: 0;
      }
    }${extraStyles}
  `);
  }

  // /page doesn't produce direct HTML, just sets up styles
  return { html: "" };
};

/**
 * /columns - Multi-column layout
 * Usage: /columns 2 -g 1.5cm { content }
 * Usage: /columns "60 40" { content }
 * Usage: /columns "1fr 2fr" { content }
 */
const columns: Component = (ctx) => {
  const spec = getPositional(ctx.args, 0, "2");
  const gap = getArg(ctx.args, "g", "") || getArg(ctx.args, "gap", "1.5rem");

  // Determine grid-template-columns based on spec
  let gridTemplate: string;
  if (/^\d+$/.test(spec)) {
    // Simple number: equal columns
    gridTemplate = `repeat(${spec}, 1fr)`;
  } else if (spec.includes("fr")) {
    // Already a CSS grid template (e.g., "1fr 2fr")
    gridTemplate = spec;
  } else if (/^[\d\s]+$/.test(spec)) {
    // Space-separated numbers as ratios (e.g., "60 40")
    const parts = spec.trim().split(/\s+/);
    gridTemplate = parts.map((p) => `${p}fr`).join(" ");
  } else {
    // Fallback: use as-is
    gridTemplate = spec;
  }

  const style = `grid-template-columns: ${gridTemplate}; gap: ${gap};`;
  const children = ctx.compileChildren();

  // Split on <hr> tags to create separate column cells
  // This lets users use --- in Markdown to separate column content
  const segments = children.split(/<hr\s*\/?>/).map((s) => s.trim()).filter(Boolean);
  let inner: string;
  if (segments.length > 1) {
    inner = segments.map((seg) => `<div class="poly-column-cell">${seg}</div>`).join("\n");
  } else {
    inner = children;
  }

  return {
    html: `<div class="poly-columns" style="${style}">${inner}</div>`,
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
  const userClass = getArg(ctx.args, "class", "");

  let style = "";
  if (bg) style += `background: ${bg}; `;
  if (padding) style += `padding: ${padding}; `;
  if (margin) style += `margin: ${margin}; `;

  const children = ctx.compileChildren();
  const cls = `poly-region${userClass ? ` ${userClass}` : ""}`;

  return {
    html: `<div class="${cls}" style="${style}">${children}</div>`,
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
  const userClass = getArg(ctx.args, "class", "");

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

  const cls = `poly-text${userClass ? ` ${userClass}` : ""}`;
  return {
    html: `<span class="${cls}" style="${style}">${content}</span>`,
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
 * Estimate whether a CSS color is dark, for picking contrasting text.
 * Parses #rgb / #rrggbb / rgb()/rgba(). Returns null when it can't tell
 * (named colors, gradients, etc.) so callers can leave text untouched.
 */
function isDarkColor(value: string): boolean | null {
  const v = value.trim();
  let r: number, g: number, b: number;

  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    r = parseInt(h.slice(0, 2), 16);
    g = parseInt(h.slice(2, 4), 16);
    b = parseInt(h.slice(4, 6), 16);
  } else {
    const rgb = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
    if (!rgb) return null;
    r = parseFloat(rgb[1]); g = parseFloat(rgb[2]); b = parseFloat(rgb[3]);
  }

  // Perceived luminance (sRGB-weighted), 0–255.
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance < 140;
}

/**
 * /hero - Hero section
 * Usage: /hero --bg blue { content }
 * Usage: /hero --bg gradient --pattern grid { content }
 * Usage: /hero --bg "#4b6cf9" --pattern grid { content }   (solid color, auto white text)
 * Usage: /hero --bg theme { content }                      (theme's hero background)
 * Usage: /hero --image "cover.jpg" --overlay "rgba(0,0,0,0.4)" { content }
 */
const hero: Component = (ctx) => {
  const bg = getArg(ctx.args, "bg", "");
  const image = getArg(ctx.args, "image", "");
  const overlay = getArg(ctx.args, "overlay", "");
  const textColor = getArg(ctx.args, "text", "");
  const pattern = getArg(ctx.args, "pattern", "");

  let style = "";
  let baseColor = "";        // → background-color (solid fills; valid for solids only)
  let baseImage = "";        // → background-image base layer (gradients / images)
  let resolvedText = "";     // resolved text color, if any

  if (bg === "gradient") {
    baseImage = "var(--poly-hero-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%))";
    resolvedText = "var(--poly-hero-text, white)";
  } else if (bg === "theme") {
    // The theme's hero background is a solid fill (see StyleHero.background); fall back to the primary color.
    baseColor = "var(--poly-hero-bg, var(--poly-color-primary, #4b6cf9))";
    resolvedText = "var(--poly-hero-text, white)";
  } else if (bg) {
    if (bg.includes("gradient") || bg.includes("url(")) {
      baseImage = bg;
    } else {
      baseColor = bg;
      const dark = isDarkColor(bg);
      if (dark === true) resolvedText = "#fff";
      else if (dark === false) resolvedText = "var(--poly-color-text, #1a1a1a)";
    }
  }

  // Optional foreground image layer (with optional color scrim), sits above the base, below the pattern.
  let imageLayer = "";
  if (image) {
    const scrim = overlay ? `linear-gradient(${overlay}, ${overlay}), ` : "";
    imageLayer = `${scrim}url("${image}")`;
    if (!resolvedText) resolvedText = "var(--poly-hero-text, white)";
  }

  // Assemble background-image layers top → bottom: pattern, image, base gradient/image.
  const imgLayers: string[] = [];
  const imgSizes: string[] = [];
  if (pattern) {
    const patternSize = getArg(ctx.args, "pattern-size", "64px");
    const patternColor = getArg(ctx.args, "pattern-color", "rgba(255,255,255,0.15)");
    const patternFade = getArg(ctx.args, "pattern-fade", "none");
    const pCss = generatePatternCSS({ pattern, size: patternSize, color: patternColor, fade: patternFade });
    imgLayers.push(pCss.backgroundImage);
    imgSizes.push(pCss.backgroundSize);
    if (pCss.maskImage) style += `-webkit-mask-image: ${pCss.maskImage}; mask-image: ${pCss.maskImage}; `;
  }
  if (imageLayer) { imgLayers.push(imageLayer); imgSizes.push("cover"); }
  if (baseImage) { imgLayers.push(baseImage); imgSizes.push("cover"); }

  if (imgLayers.length) {
    style += `background-image: ${imgLayers.join(", ")}; `;
    style += `background-size: ${imgSizes.join(", ")}; `;
    style += `background-position: center; `;
  }
  // Solid fill goes to background-color so it never lands in (invalid) background-image.
  if (baseColor) style += `background-color: ${baseColor}; `;

  // Explicit --text always wins over the auto-resolved color.
  const finalText = textColor || resolvedText;
  if (finalText) style += `color: ${finalText}; `;

  const children = ctx.compileChildren();

  return {
    html: `<section class="poly-hero" style="${style}">${children}</section>`,
  };
};

/**
 * /background - Decorative pattern background
 * Usage: /background grid { content }
 * Usage: /background dots --size 48px --color "rgba(0,0,0,0.15)" --fade radial { content }
 */
const background: Component = (ctx) => {
  const pattern = getPositional(ctx.args, 0, "grid");
  const size = getArg(ctx.args, "size", "") || getArg(ctx.args, "s", "64px");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "rgba(0,0,0,0.1)");
  const bg = getArg(ctx.args, "bg", "");
  const fade = getArg(ctx.args, "fade", "none");
  const padding = getArg(ctx.args, "padding", "") || getArg(ctx.args, "p", "");

  const pCss = generatePatternCSS({ pattern, size, color, fade });
  let style = patternToInlineStyle(pCss, bg || undefined);
  if (padding) style += `padding: ${padding}; `;

  const children = ctx.compileChildren();

  return {
    html: `<div class="poly-background" style="${style}">${children}</div>`,
  };
};

/**
 * /card - Card component
 * Usage: /card --icon rocket { content }
 */
const card: Component = (ctx) => {
  const icon = getArg(ctx.args, "icon", "");
  const accent = hasFlag(ctx.args, "accent");
  const top = getArg(ctx.args, "top", "");
  const children = ctx.compileChildren();

  let iconHtml = "";
  if (icon) {
    const svg = getIcon(icon);
    if (svg) {
      iconHtml = `<div class="poly-card-icon">${svg}</div>`;
    } else {
      const emojiMap: Record<string, string> = {
        rocket: "🚀", shield: "🛡️", heart: "❤️",
        star: "⭐", check: "✓", bolt: "⚡",
      };
      iconHtml = `<div class="poly-card-icon">${emojiMap[icon] || icon}</div>`;
    }
  }

  const cls = accent ? "poly-card poly-card-accent" : "poly-card";
  const topStyle = top ? ` style="border-top: 3px solid ${top};"` : "";
  return {
    html: `<div class="${cls}"${topStyle}>${iconHtml}${children}</div>`,
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
      border-radius: var(--poly-radius, 0.375rem);
      font-weight: 500;
      text-decoration: none;
      cursor: pointer;
      border: var(--poly-border-width, 1px) solid var(--poly-color-border, #e5e5e5);
      background: var(--poly-color-bg, white);
      color: var(--poly-color-text, inherit);
    }
    .poly-button-primary {
      background: var(--poly-color-primary, #3b82f6);
      color: white;
      border-color: var(--poly-color-primary, #3b82f6);
    }
    .poly-button-secondary {
      background: var(--poly-color-surface, #f3f4f6);
      color: var(--poly-color-text, #374151);
      border-color: var(--poly-color-border, #e5e5e5);
    }
  `);

  const href = getArg(ctx.args, "href", "");
  const classAttr = `class="${classes.join(" ")}"`;

  if (href) {
    return {
      html: `<a ${classAttr} href="${href.replace(/"/g, "&quot;")}">${label}</a>`,
    };
  }

  return {
    html: `<button ${classAttr}>${label}</button>`,
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
  const height = getArg(ctx.args, "height", "") || getArg(ctx.args, "h", "");
  // Default to page content height in paginated docs, 100% otherwise
  const resolvedHeight = height || "var(--poly-page-height, 100%)";
  const children = ctx.compileChildren();

  ctx.addStyle(`.poly-vcenter > :first-child > :first-child { margin-top: 0 !important; }
.poly-vcenter > :first-child > :last-child { margin-bottom: 0 !important; }`);

  return {
    html: `<div class="poly-vcenter" style="display: flex; align-items: center; justify-content: center; flex-direction: column; height: ${resolvedHeight}; min-height: ${resolvedHeight};">${children}</div>`,
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
  const userClass = getArg(ctx.args, "class", "");
  const children = ctx.compileChildren();

  let style = `border: ${border}; border-radius: ${radius}; padding: ${padding};`;
  if (bg) style += ` background: ${bg};`;
  const cls = `poly-frame${userClass ? ` ${userClass}` : ""}`;

  return {
    html: `<div class="${cls}" style="${style}">${children}</div>`,
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
      font-family: var(--poly-font-mono, ui-monospace, monospace);
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
      padding: var(--poly-spacing-block-padding, 1rem);
      background: #1e1e1e;
      color: #e6e6e6;
      border-radius: 6px;
      overflow-x: auto;
    }
    .poly-code-block code {
      font-family: var(--poly-font-mono, ui-monospace, monospace);
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
  // Non-Polyester languages run through highlight.js, emitting .hljs-* spans
  // that the active syntax theme (and any user /style) colors. Unknown
  // languages fall back to plain escaped text.
  const useHljs = !isPolyester && !!language && !!hljs.getLanguage(language);

  // Helper to highlight a single line of code
  const highlightLine = (line: string): string => {
    if (isPolyester) return highlightPolyester(line);
    if (useHljs) return hljs.highlight(line, { language, ignoreIllegals: true }).value;
    return escapeHtml(line);
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
  } else if (isPolyester) {
    codeHtml = highlightPolyester(content);
  } else if (useHljs) {
    codeHtml = hljs.highlight(content, { language, ignoreIllegals: true }).value;
  } else {
    codeHtml = escapeHtml(content);
  }

  const titleHtml = title ? `<div class="poly-code-title">${escapeHtml(title)}</div>` : "";
  const userClass = getArg(ctx.args, "class", "");
  const blockCls = `poly-code-block${userClass ? ` ${userClass}` : ""}`;

  return {
    html: `<div class="${blockCls}">${titleHtml}<pre><code class="${langClass}">${codeHtml}</code></pre></div>`,
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
      break-inside: avoid;
    }
    @media print {
      .poly-table thead {
        display: table-header-group;
      }
    }
    .poly-table th,
    .poly-table td {
      padding: 0.75rem 1rem;
      text-align: left;
    }
    .poly-table thead th {
      font-weight: 600;
      background: var(--poly-color-surface, transparent);
      border-bottom: 2px solid var(--poly-color-border, #e5e5e5);
    }
    .poly-table.bordered th,
    .poly-table.bordered td {
      border: var(--poly-border-width, 1px) solid var(--poly-color-border, #e5e5e5);
    }
    .poly-table.striped tbody tr:nth-child(odd) {
      background: var(--poly-color-surface, #f9f9f9);
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
 * /image - Image with sizing and shape
 * Usage: /image "photo.jpg" --width 50%
 * Usage: /image "avatar.jpg" --shape circle --size 100px
 */
const image: Component = (ctx) => {
  const path = getPositional(ctx.args, 0, "");
  const size = getArg(ctx.args, "size", "") || getArg(ctx.args, "s", "");
  const width = getArg(ctx.args, "width", "") || getArg(ctx.args, "w", "") || size;
  const height = getArg(ctx.args, "height", "") || getArg(ctx.args, "h", "") || size;
  const alt = getArg(ctx.args, "alt", "");
  const caption = getArg(ctx.args, "caption", "");
  const align = getArg(ctx.args, "align", "center");
  const shape = getArg(ctx.args, "shape", "square");

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
    .poly-figure img.shape-circle {
      border-radius: 50%;
      object-fit: cover;
    }
    .poly-figure img.shape-rounded {
      border-radius: 8px;
    }
    .poly-figure figcaption {
      margin-top: 0.5rem;
      font-size: 0.9em;
      color: var(--poly-color-text-muted, #666);
      font-style: italic;
    }
  `);

  let style = "";
  if (width) style += `width: ${width};`;
  if (height) style += `height: ${height};`;

  const shapeClass = shape !== "square" ? ` shape-${shape}` : "";
  const resolvedSrc = embedImage(path, ctx.sourceDir);
  const imgHtml = `<img src="${escapeHtml(resolvedSrc)}" alt="${escapeHtml(alt)}" class="${shapeClass.trim()}" style="${style}">`;
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
      border: var(--poly-border-width, 1px) solid var(--poly-color-border, #e5e5e5);
      border-radius: var(--poly-radius, 4px);
    }
    .poly-fold summary {
      padding: var(--poly-spacing-block-padding, 0.75rem 1rem);
      cursor: pointer;
      font-weight: 500;
      background: var(--poly-color-surface, #f9f9f9);
      border-radius: var(--poly-radius, 4px);
    }
    .poly-fold[open] summary {
      border-bottom: var(--poly-border-width, 1px) solid var(--poly-color-border, #e5e5e5);
      border-radius: var(--poly-radius, 4px) var(--poly-radius, 4px) 0 0;
    }
    .poly-fold .poly-fold-content {
      padding: var(--poly-spacing-block-padding, 1rem);
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
 * /import - Import a style manifest from the design library or a file.
 * Usage: /import "@library/cards/enterprise"
 *        /import "./shared/styles.polystyle"
 */
const importStyle: Component = (ctx) => {
  const ref = getPositional(ctx.args, 0, "");
  if (!ref) return { html: `<!-- /import: missing reference -->` };
  try {
    const fromDir = ctx.sourceDir || process.cwd();
    const abs = resolveStyleRef(ref, fromDir);
    if (!abs) {
      return { html: `<!-- /import: could not resolve "${ref}" -->` };
    }
    const manifest = loadStyle(abs);
    ctx.addStyle(manifest.css);
    return { html: "" };
  } catch (err: any) {
    return { html: `<!-- /import error: ${err.message} -->` };
  }
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

/**
 * /icon - Lucide icon display
 * Usage: /icon mail --size 1rem --color blue
 */
const icon: Component = (ctx) => {
  const name = getPositional(ctx.args, 0, "");
  const size = getArg(ctx.args, "size", "") || getArg(ctx.args, "s", "1em");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "currentColor");

  if (!name) {
    return { html: `<span class="poly-icon-error">[icon: name required]</span>` };
  }

  const svg = getIcon(name, { size, color });
  if (!svg) {
    return { html: `<span class="poly-icon-error">[icon: "${escapeHtml(name)}" not found]</span>` };
  }

  return { html: `<span class="poly-icon">${svg}</span>` };
};

/**
 * /inline - Horizontal layout container
 * Usage: /inline --gap 1rem { /icon mail /text "email" }
 */
const inline: Component = (ctx) => {
  const gap = getArg(ctx.args, "gap", "") || getArg(ctx.args, "g", "0.5rem");
  const align = getArg(ctx.args, "align", "") || getArg(ctx.args, "a", "center");
  const wrap = hasFlag(ctx.args, "wrap") || hasFlag(ctx.args, "w");

  const alignMap: Record<string, string> = {
    start: "flex-start",
    center: "center",
    end: "flex-end",
    baseline: "baseline",
  };
  const alignItems = alignMap[align] || "center";

  ctx.addStyle(`
    .poly-inline {
      display: inline-flex;
      align-items: ${alignItems};
      gap: ${gap};
    }
    .poly-inline.wrap {
      flex-wrap: wrap;
    }
  `);

  const wrapClass = wrap ? " wrap" : "";
  const children = ctx.compileChildren();

  return {
    html: `<span class="poly-inline${wrapClass}">${children}</span>`,
  };
};

/**
 * /tag - Badge/pill component
 * Usage: /tag "Docker" --color blue --variant outline
 */
const tag: Component = (ctx) => {
  const label = getPositional(ctx.args, 0, "");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "");
  const variant = getArg(ctx.args, "variant", "") || getArg(ctx.args, "v", "filled");

  ctx.addStyle(`
    .poly-tag {
      display: inline-block;
      padding: 0.2em 0.6em;
      font-size: 0.85em;
      font-weight: 500;
      border-radius: 9999px;
      white-space: nowrap;
    }
    .poly-tag.filled {
      background: var(--poly-color-surface, #e5e7eb);
      color: var(--poly-color-text, #374151);
    }
    .poly-tag.outline {
      background: transparent;
      border: var(--poly-border-width, 1px) solid var(--poly-color-border, #d1d5db);
      color: var(--poly-color-text, #374151);
    }
  `);

  let style = "";
  if (color) {
    if (variant === "outline") {
      style = `border-color: ${color}; color: ${color};`;
    } else {
      // For filled, use lighter background
      style = `background: ${color}; color: white;`;
    }
  }

  return {
    html: `<span class="poly-tag ${variant}" style="${style}">${escapeHtml(label)}</span>`,
  };
};

/**
 * /progress - Value visualization (circles or bar)
 * Usage: /progress 4 --max 5 --style circles
 * Usage: /progress 80 --max 100 --style bar
 */
const progress: Component = (ctx) => {
  const valueStr = getPositional(ctx.args, 0, "0");
  const value = parseFloat(valueStr);
  const maxStr = getArg(ctx.args, "max", "") || getArg(ctx.args, "m", "5");
  const max = parseFloat(maxStr);
  const displayStyle = getArg(ctx.args, "style", "") || getArg(ctx.args, "s", "circles");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "");
  const emptyColor = getArg(ctx.args, "empty-color", "");

  if (displayStyle === "bar") {
    // Bar style
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    const fillColor = color || "var(--poly-color-primary, #3b82f6)";
    const bgColor = emptyColor || "var(--poly-color-surface, #e5e7eb)";

    ctx.addStyle(`
      .poly-progress-bar {
        display: inline-block;
        width: 100%;
        max-width: 200px;
        height: 8px;
        background: ${bgColor};
        border-radius: var(--poly-radius, 4px);
        overflow: hidden;
        vertical-align: middle;
      }
      .poly-progress-bar-fill {
        height: 100%;
        border-radius: var(--poly-radius, 4px);
        transition: width 0.3s ease;
      }
    `);

    return {
      html: `<span class="poly-progress-bar"><span class="poly-progress-bar-fill" style="width: ${percentage}%; background: ${fillColor};"></span></span>`,
    };
  } else {
    // Circles style (default)
    const fillColor = color || "var(--poly-color-primary, #3b82f6)";
    const bgColor = emptyColor || "var(--poly-color-surface, #e5e7eb)";
    const fullCount = Math.floor(value);
    const hasHalf = value - fullCount >= 0.5;
    const emptyCount = Math.ceil(max) - fullCount - (hasHalf ? 1 : 0);

    // Unicode circles: ● (filled), ◐ (half), ○ (empty)
    let circles = "";
    for (let i = 0; i < fullCount; i++) {
      circles += `<span style="color: ${fillColor};">●</span>`;
    }
    if (hasHalf) {
      circles += `<span style="color: ${fillColor};">◐</span>`;
    }
    for (let i = 0; i < emptyCount; i++) {
      circles += `<span style="color: ${bgColor};">○</span>`;
    }

    ctx.addStyle(`
      .poly-progress-circles {
        display: inline-flex;
        gap: 0.15em;
        font-size: 1em;
        vertical-align: middle;
      }
    `);

    return {
      html: `<span class="poly-progress-circles">${circles}</span>`,
    };
  }
};

/**
 * /divider - Horizontal separator
 * Usage: /divider --style dashed --color gray
 */
const divider: Component = (ctx) => {
  const lineStyle = getArg(ctx.args, "style", "") || getArg(ctx.args, "s", "solid");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "");
  const margin = getArg(ctx.args, "margin", "") || getArg(ctx.args, "m", "");
  const width = getArg(ctx.args, "width", "") || getArg(ctx.args, "w", "");

  const resolvedColor = color || "var(--poly-color-border, #e5e7eb)";
  const resolvedMargin = margin || "var(--poly-spacing-section-gap, 1rem)";
  const resolvedWidth = width || "var(--poly-border-width, 1px)";
  const style = `border: none; border-top: ${resolvedWidth} ${lineStyle} ${resolvedColor}; margin: ${resolvedMargin} 0;`;

  return {
    html: `<hr class="poly-divider" style="${style}">`,
  };
};

/**
 * /pagebg - Per-page background pattern/color
 * Usage: /pagebg 1 --pattern grid --size 48px --color "rgba(0,0,0,0.035)"
 * Usage: /pagebg 2-4 --bg "#f0f4ff"
 * Usage: /pagebg all --pattern dots --color "rgba(0,0,0,0.08)"
 */
const pagebg: Component = (ctx) => {
  const pages = getPositional(ctx.args, 0, "all");
  const pattern = getArg(ctx.args, "pattern", "");
  const size = getArg(ctx.args, "size", "") || getArg(ctx.args, "s", "64px");
  const color = getArg(ctx.args, "color", "") || getArg(ctx.args, "c", "rgba(0,0,0,0.1)");
  const bg = getArg(ctx.args, "bg", "");
  const fade = getArg(ctx.args, "fade", "none");

  let style = "";
  if (pattern) {
    const pCss = generatePatternCSS({ pattern, size, color, fade });
    style = patternToInlineStyle(pCss, bg || undefined);
  } else if (bg) {
    style = `background: ${bg}; `;
  }

  if (style) {
    ctx.setPageSettings({
      pagebgs: [{ pages, style }],
    });
  }

  return { html: "" };
};

/**
 * /pagebreak - Force a page break (for PDF output)
 * Usage: /pagebreak
 */
const pagebreak: Component = (ctx) => {
  ctx.addStyle(`
    .poly-pagebreak {
      page-break-before: always;
      break-before: page;
      height: 0;
      margin: 0;
      padding: 0;
    }
    @media screen {
      .poly-document:not([data-page-size]) .poly-pagebreak {
        border-top: 1px dashed #ccc;
        margin: 1rem 0;
        position: relative;
      }
      .poly-document:not([data-page-size]) .poly-pagebreak::after {
        content: "page break";
        position: absolute;
        top: -0.6em;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        padding: 0 0.5em;
        font-size: 0.75rem;
        color: #999;
      }
    }
  `);

  return {
    html: `<div class="poly-pagebreak"></div>`,
  };
};

/**
 * /font - Register a font family from a local file or Google Fonts.
 *
 * Looks up the resolved CSS produced by the async prefetch pass (fonts.ts).
 * Emits the @font-face block(s) into the document and optionally sets the
 * --poly-font-body / --poly-font-heading / --poly-font-mono CSS variables so
 * the registered family becomes the default for body/headings/code.
 */
const font: Component = (ctx) => {
  const family = getPositional(ctx.args, 0, "");
  if (!family) return { html: "" };

  const src = ctx.args["src"];
  const google = ctx.args["google"];

  let key: string | null = null;
  if (typeof src === "string") {
    key = fontCacheKey(family, `src:${src}`);
  } else if (google !== undefined) {
    const axes = typeof google === "string" ? google : "";
    key = fontCacheKey(family, `google:${axes}`);
  }

  if (!key) {
    ctx.report(
      "error",
      `/font "${family}" needs a source: add --src "path.woff2" or --google`,
    );
    return { html: "" };
  }

  const decl = ctx.fontCache?.get(key);
  if (decl?.failed) {
    // The prefetch pass already reported why. Saying anything more here would
    // bury that message under noise.
    return { html: "" };
  }
  if (decl) {
    ctx.addStyle(decl.css);
  } else {
    ctx.report(
      "error",
      `/font "${family}" was not resolved by the font prefetch pass (internal error)`,
    );
    return { html: "" };
  }

  // Apply as default body/heading/mono if requested.
  const stack = `"${family.replace(/"/g, '\\"')}", system-ui, -apple-system, sans-serif`;
  const monoStack = `"${family.replace(/"/g, '\\"')}", ui-monospace, monospace`;
  const vars: string[] = [];
  if (hasFlag(ctx.args, "body")) vars.push(`--poly-font-body: ${stack};`);
  if (hasFlag(ctx.args, "heading")) vars.push(`--poly-font-heading: ${stack};`);
  if (hasFlag(ctx.args, "mono")) vars.push(`--poly-font-mono: ${monoStack};`);
  if (vars.length) {
    ctx.addStyle(`.poly-document {\n  ${vars.join("\n  ")}\n}`);
  }

  return { html: "" };
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
  background,
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
  import: importStyle,
  icon,
  inline,
  tag,
  progress,
  divider,
  pagebg,
  pagebreak,
  font,
};
