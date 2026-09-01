/**
 * MCP Tools
 *
 * Tool handlers for the Polyester MCP server.
 */

import { parse } from "../parser/parser.js";
import { compileToHtml } from "../backends/html/compiler.js";
import { formatDiagnostics, hasErrors } from "../diagnostics.js";
import { listLibrary, type PolyStyle } from "../library/index.js";
import {
  getComponent,
  formatComponentHelp,
  formatComponentsList,
  COMPONENTS,
  getComponentsByCategory,
  type ComponentDef,
} from "../components/registry.js";
import {
  tryResolveModules,
  styleToCSS,
  spacingToCSS,
  syntaxToCSS,
} from "../themes/loader.js";
import { loadConfig } from "../config/index.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

// ─── list_components ───────────────────────────────────────────

export function listComponents(category?: string): ToolResult {
  if (category) {
    const validCategories = ["layout", "content", "style", "interactive"];
    if (!validCategories.includes(category)) {
      return {
        content: [{ type: "text", text: `Invalid category "${category}". Valid: ${validCategories.join(", ")}` }],
        isError: true,
      };
    }
    const components = getComponentsByCategory(category as ComponentDef["category"]);
    const result = components.map(c => ({
      name: c.name,
      description: c.description,
      hasBlock: c.hasBlock ?? false,
    }));
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }

  return { content: [{ type: "text", text: formatComponentsList() }] };
}

// ─── get_component_help ────────────────────────────────────────

export function getComponentHelp(name: string): ToolResult {
  const cleanName = name.replace(/^\//, "");
  const component = getComponent(cleanName);
  if (!component) {
    return {
      content: [{ type: "text", text: `Unknown component: "${name}". Run list_components to see all available components.` }],
      isError: true,
    };
  }
  return { content: [{ type: "text", text: formatComponentHelp(component) }] };
}

// ─── validate_document ─────────────────────────────────────────

export function validateDocument(source: string): ToolResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const ast = parse(source);

    // Check for unknown commands
    for (const node of ast.children) {
      if (node.type === "command") {
        const comp = getComponent(node.name);
        if (!comp) {
          const line = node.loc?.start.line ?? "?";
          warnings.push(`Unknown command: /${node.name} (line ${line})`);
        }
      }
    }

    if (errors.length === 0 && warnings.length === 0) {
      return { content: [{ type: "text", text: "Document is valid. No errors or warnings." }] };
    }

    const parts: string[] = [];
    if (errors.length > 0) { parts.push("Errors:\n" + errors.map(e => `  - ${e}`).join("\n")); }
    if (warnings.length > 0) { parts.push("Warnings:\n" + warnings.map(w => `  - ${w}`).join("\n")); }
    return { content: [{ type: "text", text: parts.join("\n\n") }] };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Parse error: ${err.message}` }],
      isError: true,
    };
  }
}

// ─── compile_document ──────────────────────────────────────────

export function compileDocument(source: string): ToolResult {
  try {
    const ast = parse(source);
    const { html, diagnostics } = compileToHtml(ast, { standalone: true });
    // Returning HTML for a document with errors would hand back markup that
    // renders but is not the document that was asked for.
    if (hasErrors(diagnostics)) {
      return {
        content: [{ type: "text", text: formatDiagnostics(diagnostics) }],
        isError: true,
      };
    }
    return { content: [{ type: "text", text: html }] };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Compilation error: ${err.message}` }],
      isError: true,
    };
  }
}

// ─── design library ───────────────────────────────────────────

function shortName(item: PolyStyle): string {
  return item.name.replace(/^(card|btn|hero|hl|tbl|code|ic)-/, "");
}

export function listLibraryItems(category?: string): ToolResult {
  try {
    const items = listLibrary()
      .filter((it) => !category || it.category === category)
      .map((it) => ({
        name: it.name,
        category: it.category,
        description: it.description,
        targets: it.targets,
        wrapperClass: it.wrapperClass,
        ref: `@library/${it.category}/${shortName(it)}`,
      }));
    return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Library error: ${err.message}` }], isError: true };
  }
}

export function getLibraryItem(name: string): ToolResult {
  try {
    const items = listLibrary();
    const item = items.find((it) => it.name === name || `${it.category}/${it.name}` === name);
    if (!item) {
      return { content: [{ type: "text", text: `Library item not found: ${name}` }], isError: true };
    }
    const importRef = `@library/${item.category}/${shortName(item)}`;
    return {
      content: [{
        type: "text",
        text: JSON.stringify({ ...item, importStatement: `/import "${importRef}"` }, null, 2),
      }],
    };
  } catch (err: any) {
    return { content: [{ type: "text", text: `Library error: ${err.message}` }], isError: true };
  }
}

// ─── analyze_page_layout ──────────────────────────────────────

export async function analyzePageLayout(source: string): Promise<ToolResult> {
  try {
    const ast = parse(source);
    const config = loadConfig();

    // Initial compile to extract pageSettings
    const initialResult = compileToHtml(ast, { standalone: false });
    const ps = initialResult.pageSettings;

    // Check if paginated
    const mode = ps.mode || (ps.size && !ps.pageless ? "pdf" : "web");
    if (mode === "web" || !ps.size) {
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            paginated: false,
            mode,
            message: "Document is in web mode (continuous flow). Set /page A4 --mode pdf (or print) to enable page layout analysis.",
          }, null, 2),
        }],
      };
    }

    // Resolve theme modules. A named theme that does not exist is an error:
    // analysing a layout in the wrong design measures the wrong document.
    const { resolved, diagnostics: themeDiagnostics } = tryResolveModules({
      theme: ps.theme || config.defaultTheme,
      style: ps.style,
      spacing: ps.spacing,
    });
    if (hasErrors(themeDiagnostics)) {
      return {
        content: [{ type: "text", text: formatDiagnostics(themeDiagnostics) }],
        isError: true,
      };
    }

    const styleCss = styleToCSS(resolved.style);
    const spacingCss = spacingToCSS(resolved.spacing);
    const syntaxCss = syntaxToCSS(resolved.syntax, resolved.name);

    // Full compile with theme CSS
    const { html } = compileToHtml(ast, {
      standalone: true,
      title: "layout-analysis",
      styleCss,
      spacingCss,
      syntaxCss,
    });

    // Launch Puppeteer and measure
    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.default.launch();
    const page = await browser.newPage();

    await page.setViewport({ width: 1400, height: 2000 });
    await page.setContent(html, { waitUntil: "networkidle0" });

    // Wait for the sim script to finish pagination.
    await page.waitForFunction(
      () => {
        const d = document.querySelector(".poly-document[data-page-size]") as HTMLElement | null;
        return !!(d && d.dataset.paginated === "1");
      },
      { timeout: 10000 },
    );

    const result = await page.evaluate(() => {
      const doc = document.querySelector(".poly-document[data-page-size]") as HTMLElement;
      if (!doc) return null;

      const pageEls = Array.from(doc.querySelectorAll(".poly-page")) as HTMLElement[];
      if (pageEls.length === 0) return null;

      const firstPage = pageEls[0];
      const pageWidthPx = Math.round(firstPage.getBoundingClientRect().width);
      const pageHeightPx = Math.round(firstPage.getBoundingClientRect().height);
      // Margins come from padding on .poly-page
      const cs = getComputedStyle(firstPage);
      const marginPx = parseFloat(cs.paddingTop);
      const contentWidthPx = Math.round(pageWidthPx - 2 * marginPx);
      const contentHeightPx = Math.round(pageHeightPx - 2 * marginPx);

      type ElementInfo = {
        tag: string;
        class: string;
        text: string;
        top: number;   // Y within the page's flow (content-area coords)
        left: number;
        width: number;
        height: number;
        page: number;
        sourceLine: number | null;
        oversize: boolean;
      };

      const pages: Array<{
        page: number;
        usedHeight: number;
        freeHeight: number;
        fillRatio: number;
        lastElementBottom: number;
        elements: ElementInfo[];
      }> = [];
      const overflows: Array<{ text: string; page: number; overflowPx: number; sourceLine: number | null }> = [];
      const allElements: ElementInfo[] = [];

      for (let p = 0; p < pageEls.length; p++) {
        const pageEl = pageEls[p];
        const flow = pageEl.querySelector(".poly-page-flow") as HTMLElement | null;
        if (!flow) continue;
        const flowRect = flow.getBoundingClientRect();
        const pageElements: ElementInfo[] = [];
        let lastBottom = 0;
        const kids = Array.from(flow.children) as HTMLElement[];
        for (const child of kids) {
          if (child.classList.contains("poly-pagebg") || child.classList.contains("poly-hint-badge")) continue;
          const r = child.getBoundingClientRect();
          if (r.height === 0) continue;
          const top = r.top - flowRect.top;
          const left = r.left - flowRect.left;
          let text = "";
          const heading = child.querySelector("h1, h2, h3, h4, h5, h6");
          if (heading) text = (heading.textContent || "").trim().slice(0, 80);
          else text = (child.textContent || "").trim().slice(0, 60);
          const srcAttr = child.getAttribute("data-source-line");
          const sourceLine = srcAttr ? parseInt(srcAttr, 10) : null;
          const oversize = child.hasAttribute("data-poly-oversize") || r.height > contentHeightPx + 1;
          const info: ElementInfo = {
            tag: child.tagName.toLowerCase(),
            class: (child.className || "").split(" ").filter(c => c && c !== "poly-hint-badge")[0] || "",
            text,
            top: Math.round(top),
            left: Math.round(left),
            width: Math.round(r.width),
            height: Math.round(r.height),
            page: p + 1,
            sourceLine,
            oversize,
          };
          pageElements.push(info);
          allElements.push(info);
          const bottom = top + r.height;
          if (bottom > lastBottom) lastBottom = bottom;
          if (oversize) {
            overflows.push({ text, page: p + 1, overflowPx: Math.round(r.height - contentHeightPx), sourceLine });
          }
        }
        const usedHeight = Math.min(contentHeightPx, Math.max(0, Math.round(lastBottom)));
        const freeHeight = Math.max(0, contentHeightPx - usedHeight);
        pages.push({
          page: p + 1,
          usedHeight,
          freeHeight,
          fillRatio: Math.round((usedHeight / contentHeightPx) * 100) / 100,
          lastElementBottom: Math.round(lastBottom),
          elements: pageElements,
        });
      }

      return {
        paginated: true,
        pageSettings: { size: doc.dataset.pageSize, orientation: doc.dataset.pageOrientation, margin: doc.dataset.pageMargin, mode: doc.dataset.pageMode || "pdf" },
        dimensions: { pageWidthPx, pageHeightPx, contentWidthPx, contentHeightPx, marginPx: Math.round(marginPx) },
        totalPages: pages.length,
        pages,
        overflows,
      };
    });

    await browser.close();

    if (!result) {
      return {
        content: [{ type: "text", text: JSON.stringify({ paginated: false, message: "Could not find paginated document element." }, null, 2) }],
      };
    }

    const svg = renderLayoutSvg(result as LayoutResult);
    return {
      content: [
        { type: "text", text: JSON.stringify(result, null, 2) },
        { type: "text", text: "\n--- SVG layout diagram (paste into a .svg file to view) ---\n" + svg },
      ],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text", text: `Layout analysis error: ${err.message}` }],
      isError: true,
    };
  }
}

// ─── SVG layout renderer ──────────────────────────────────────

interface LayoutElement {
  tag: string; class: string; text: string;
  top: number; left: number; width: number; height: number;
  page: number; sourceLine: number | null; oversize: boolean;
}
interface LayoutPage {
  page: number; usedHeight: number; freeHeight: number; fillRatio: number;
  lastElementBottom: number; elements: LayoutElement[];
}
interface LayoutResult {
  paginated: boolean;
  dimensions: { pageWidthPx: number; pageHeightPx: number; contentWidthPx: number; contentHeightPx: number; marginPx: number };
  totalPages: number;
  pages: LayoutPage[];
}

function renderLayoutSvg(r: LayoutResult): string {
  const { pageWidthPx: pw, pageHeightPx: ph, marginPx: mp } = r.dimensions;
  const scale = 0.5; // shrink for readability
  const sw = pw * scale;
  const sh = ph * scale;
  const gap = 20;
  const cols = Math.min(r.totalPages, 3);
  const rows = Math.ceil(r.totalPages / cols);
  const totalW = cols * sw + (cols + 1) * gap;
  const totalH = rows * (sh + 30) + gap;

  const esc = (s: string) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" font-family="ui-monospace,monospace" font-size="10">`;
  svg += `<style>.el{fill:rgba(59,130,246,0.12);stroke:#3b82f6;stroke-width:0.5}.over{fill:rgba(239,68,68,0.18);stroke:#dc2626;stroke-width:1;stroke-dasharray:3,2}.lbl{fill:#1f2937;pointer-events:none}.page{fill:white;stroke:#9ca3af;stroke-width:1}.content{fill:none;stroke:#d1d5db;stroke-width:0.5;stroke-dasharray:2,2}.free{fill:rgba(16,185,129,0.08)}</style>`;

  for (let i = 0; i < r.pages.length; i++) {
    const p = r.pages[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gap + col * (sw + gap);
    const y = gap + row * (sh + 30);

    svg += `<g transform="translate(${x},${y})">`;
    svg += `<text x="${sw / 2}" y="-6" text-anchor="middle" font-size="11" font-weight="700">Page ${p.page} — ${Math.round(p.fillRatio * 100)}% full (${p.freeHeight}px free)</text>`;
    // Page rect
    svg += `<rect class="page" x="0" y="0" width="${sw}" height="${sh}"/>`;
    // Content area outline
    svg += `<rect class="content" x="${mp * scale}" y="${mp * scale}" width="${(pw - 2 * mp) * scale}" height="${(ph - 2 * mp) * scale}"/>`;
    // Free space shading
    if (p.freeHeight > 0) {
      svg += `<rect class="free" x="${mp * scale}" y="${(mp + p.usedHeight) * scale}" width="${(pw - 2 * mp) * scale}" height="${p.freeHeight * scale}"/>`;
    }
    // Elements (coords are within flow; add marginPx to get page coords)
    for (const el of p.elements) {
      const ex = (mp + el.left) * scale;
      const ey = (mp + el.top) * scale;
      const ew = el.width * scale;
      const eh = el.height * scale;
      const cls = el.oversize ? "el over" : "el";
      svg += `<rect class="${cls}" x="${ex}" y="${ey}" width="${ew}" height="${eh}"/>`;
      const label = `${el.sourceLine ? "L" + el.sourceLine + " " : ""}${el.class || el.tag}${el.text ? " · " + el.text.slice(0, 30) : ""}`;
      svg += `<text class="lbl" x="${ex + 2}" y="${ey + 10}">${esc(label)}</text>`;
    }
    svg += `</g>`;
  }
  svg += `</svg>`;
  return svg;
}
