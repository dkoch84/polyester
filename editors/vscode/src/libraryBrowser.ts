/**
 * Polyester Design Library Browser
 *
 * VS Code webview that lists all .polystyle items bundled with the Polyester
 * CLI, renders an inline preview of each, and lets the user insert the
 * /import statement (plus optional sample markup) into the active .poly file.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { compile as compilePoly, findLibraryRoot, listLibraryItems } from "./polyRuntime";

let panel: vscode.WebviewPanel | undefined;

// ─── Library loading via the in-process Polyester runtime ────────

let cachedExtensionPath: string | undefined;

interface LibraryItem {
  name: string;
  category: string;
  description: string;
  targets: string[];
  wrapperClass?: string;
  sampleMarkup?: string;
  css: string;
}

async function loadLibrary(): Promise<LibraryItem[]> {
  try {
    const items = await listLibraryItems(cachedExtensionPath);
    return (items as LibraryItem[]).sort((a, b) =>
      a.category === b.category ? a.name.localeCompare(b.name) : a.category.localeCompare(b.category),
    );
  } catch {
    return [];
  }
}

function shortName(it: LibraryItem): string {
  return it.name.replace(/^(card|btn|hero|hl|tbl|code|ic)-/, "");
}

function importRef(it: LibraryItem): string {
  return `@library/${it.category}/${shortName(it)}`;
}

// ─── Preview rendering ────────────────────────────────────────────

/** Compile a tiny .poly snippet to HTML in-process. */
async function compilePreview(sample: string, extraCss: string): Promise<string> {
  if (!sample) return "<p style=\"color:#666;font-style:italic;\">No preview available.</p>";

  const doc = `/page --pageless\n\n/style {\n${extraCss}\n}\n\n${sample}\n`;
  const sourceDir = findLibraryRoot(cachedExtensionPath) || process.cwd();
  try {
    const html = await compilePoly(doc, { sourceDir, title: "preview" }, cachedExtensionPath);
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/);
    const styleMatches = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[0]).join("\n");
    return styleMatches + (bodyMatch ? bodyMatch[1] : "");
  } catch (err: any) {
    return `<pre style="color:#b91c1c;">${String(err.message || err)}</pre>`;
  }
}

// ─── Webview HTML ─────────────────────────────────────────────────

async function buildHtml(items: LibraryItem[]): Promise<string> {
  const categories = [...new Set(items.map(i => i.category))];
  const NATURAL_WIDTH = 960; // render content at this width, then scale down to fit the card

  const previews = await Promise.all(items.map(it => compilePreview(it.sampleMarkup || "", it.css)));
  const cards = items.map((it, idx) => {
    const rawPreview = previews[idx];
    const previewWithResize = rawPreview +
      `<script>
        (function(){
          function send(){
            const h = Math.max(
              document.body.scrollHeight,
              document.documentElement.scrollHeight,
              document.body.offsetHeight,
              document.documentElement.offsetHeight
            );
            parent.postMessage({type:"poly-preview-size", name:"${it.name}", height: h}, "*");
          }
          window.addEventListener("load", () => setTimeout(send, 80));
          new ResizeObserver(send).observe(document.documentElement);
          document.documentElement.style.overflow = "hidden";
          document.body.style.overflow = "hidden";
          document.body.style.margin = "0";
          document.body.style.padding = "32px";
        })();
      </script>`;
    const safePreview = previewWithResize.replace(/<\/script>/g, "<\\/script>");
    const ref = importRef(it);
    return `
      <article class="item" data-name="${it.name}" data-category="${it.category}">
        <header>
          <div>
            <h3>${escapeHtml(it.name)}</h3>
            <p class="desc">${escapeHtml(it.description)}</p>
          </div>
        </header>
        <div class="preview" data-name="${it.name}">
          <div class="preview-stage">
            <iframe data-name="${it.name}" srcdoc="${escapeHtml(safePreview)}" sandbox="allow-same-origin allow-scripts" scrolling="no" style="width:${NATURAL_WIDTH}px;"></iframe>
          </div>
          <span class="zoom-hint">Click to enlarge</span>
        </div>
        <footer>
          <code>${ref}</code>
          <div class="actions">
            <button data-action="copy" data-ref="${ref}">Copy /import</button>
            <button data-action="add" data-name="${it.name}" class="primary">Add to document</button>
          </div>
        </footer>
      </article>
    `;
  }).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    margin: 0;
    padding: 16px;
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
  }
  html, body { height: 100%; }
  body { display: flex; flex-direction: column; padding: 0; }
  .app { display: flex; flex: 1; min-height: 0; }
  .sidebar {
    width: 220px; flex-shrink: 0;
    border-right: 1px solid var(--vscode-widget-border);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    padding: 20px 12px;
    overflow-y: auto;
  }
  .sidebar h1 { margin: 0 0 12px 0; font-size: 15px; font-weight: 600; padding: 0 8px; }
  .sidebar .nav { display: flex; flex-direction: column; gap: 2px; }
  .sidebar .nav button {
    background: transparent; color: inherit;
    border: none; border-radius: 4px;
    padding: 6px 10px; font: inherit; font-size: 13px;
    cursor: pointer; text-align: left;
    display: flex; justify-content: space-between; align-items: center;
  }
  .sidebar .nav button:hover {
    background: var(--vscode-list-hoverBackground);
  }
  .sidebar .nav button.active {
    background: var(--vscode-list-activeSelectionBackground);
    color: var(--vscode-list-activeSelectionForeground);
  }
  .sidebar .nav .count {
    font-size: 11px; opacity: 0.6;
  }
  .main { flex: 1; overflow-y: auto; padding: 24px; min-width: 0; }
  .main h2 { margin: 0 0 4px 0; font-size: 18px; }
  .main .sub { color: var(--vscode-descriptionForeground); margin-bottom: 20px; font-size: 13px; }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 20px;
  }
  .item {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 8px;
    overflow: hidden;
    display: flex; flex-direction: column;
  }
  .item header {
    padding: 12px 16px;
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .item h3 { margin: 0; font-size: 14px; font-family: ui-monospace, monospace; }
  .item .desc { margin: 4px 0 0 0; font-size: 12px; color: var(--vscode-descriptionForeground); }
  .preview {
    background: #fff;
    overflow: hidden;
    position: relative;
    cursor: zoom-in;
    height: 280px;
  }
  .preview-stage {
    position: absolute; top: 0; left: 0;
    transform-origin: top left;
  }
  .preview iframe {
    border: 0;
    background: #fff;
    display: block;
  }
  .preview .zoom-hint {
    position: absolute; top: 6px; right: 6px;
    background: rgba(0,0,0,0.55); color: #fff;
    font-size: 10px; padding: 2px 6px; border-radius: 3px;
    opacity: 0; transition: opacity 0.15s ease;
    pointer-events: none;
  }
  .preview:hover .zoom-hint { opacity: 1; }
  /* Modal */
  .modal {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: none; align-items: center; justify-content: center;
    z-index: 1000; padding: 24px;
  }
  .modal.open { display: flex; }
  .modal-inner {
    background: #fff; border-radius: 8px; overflow: hidden;
    width: 100%; max-width: 1100px;
    max-height: calc(100vh - 48px);
    display: flex; flex-direction: column;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 10px 14px; background: var(--vscode-editorWidget-background);
    color: var(--vscode-editor-foreground);
    border-bottom: 1px solid var(--vscode-widget-border);
  }
  .modal-header h3 { margin: 0; font-size: 14px; font-family: ui-monospace, monospace; }
  .modal-header button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 4px; padding: 4px 10px;
    font: inherit; font-size: 12px; cursor: pointer;
  }
  .modal iframe {
    border: 0; width: 100%; flex: 1; background: #fff; min-height: 400px;
  }
  .item footer {
    padding: 10px 14px;
    display: flex; justify-content: space-between; align-items: center;
    border-top: 1px solid var(--vscode-widget-border);
    gap: 8px; flex-wrap: wrap;
  }
  code {
    background: var(--vscode-textBlockQuote-background);
    padding: 2px 6px; border-radius: 3px;
    font-size: 11px;
  }
  .actions { display: flex; gap: 6px; }
  .actions button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 4px;
    padding: 4px 10px; font: inherit; font-size: 12px;
    cursor: pointer;
  }
  .actions button.primary {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }
</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <h1>Design Library</h1>
      <div class="nav">
        <button class="active" data-filter="all">All<span class="count">${items.length}</span></button>
        ${categories.map(c => {
          const count = items.filter(i => i.category === c).length;
          return `<button data-filter="${c}">${c}<span class="count">${count}</span></button>`;
        }).join("")}
      </div>
    </aside>
    <main class="main">
      <h2 id="section-title">All components</h2>
      <p class="sub">Click a preview to enlarge. Click <em>Add to document</em> to insert an /import into the active .poly file.</p>
      <div class="grid">${cards}</div>
    </main>
  </div>
  <div class="modal" id="modal">
    <div class="modal-inner">
      <div class="modal-header">
        <h3 id="modal-title"></h3>
        <button id="modal-close">Close</button>
      </div>
      <iframe id="modal-frame" sandbox="allow-same-origin allow-scripts"></iframe>
    </div>
  </div>
<script>
  const vscode = acquireVsCodeApi();
  const NATURAL_WIDTH = ${NATURAL_WIDTH};
  document.querySelectorAll(".sidebar .nav button").forEach(b => {
    b.addEventListener("click", () => {
      document.querySelectorAll(".sidebar .nav button").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      const f = b.dataset.filter;
      document.getElementById("section-title").textContent = f === "all" ? "All components" : f;
      document.querySelectorAll(".item").forEach(it => {
        it.style.display = (f === "all" || it.dataset.category === f) ? "" : "none";
      });
    });
  });
  document.querySelectorAll("button[data-action]").forEach(b => {
    b.addEventListener("click", () => {
      vscode.postMessage({ action: b.dataset.action, ref: b.dataset.ref, name: b.dataset.name });
    });
  });
  // Render each item at NATURAL_WIDTH, then scale the stage down to fit the card.
  function fitPreview(name, naturalH) {
    const frame = document.querySelector('iframe[data-name="' + name + '"]');
    if (!frame) return;
    const stage = frame.parentElement;
    const preview = stage.parentElement;
    frame.style.height = naturalH + "px";
    const cardW = preview.clientWidth;
    const cardH = preview.clientHeight;
    const scaleW = cardW / NATURAL_WIDTH;
    const scaleH = cardH / naturalH;
    const scale = Math.min(scaleW, scaleH, 1);
    stage.style.transform = "scale(" + scale + ")";
    // Center horizontally within card.
    const scaledW = NATURAL_WIDTH * scale;
    const scaledH = naturalH * scale;
    stage.style.left = Math.max(0, (cardW - scaledW) / 2) + "px";
    stage.style.top = Math.max(0, (cardH - scaledH) / 2) + "px";
  }
  const naturalHeights = {};
  window.addEventListener("message", (e) => {
    const d = e.data || {};
    if (d.type !== "poly-preview-size" || !d.name || !d.height) return;
    naturalHeights[d.name] = d.height;
    fitPreview(d.name, d.height);
  });
  window.addEventListener("resize", () => {
    for (const name in naturalHeights) fitPreview(name, naturalHeights[name]);
  });
  // Modal: click preview to open full-size view.
  const modal = document.getElementById("modal");
  const modalFrame = document.getElementById("modal-frame");
  const modalTitle = document.getElementById("modal-title");
  document.querySelectorAll(".preview").forEach(p => {
    p.addEventListener("click", () => {
      const name = p.dataset.name;
      const srcFrame = p.querySelector("iframe");
      if (!srcFrame) return;
      modalTitle.textContent = name;
      modalFrame.srcdoc = srcFrame.getAttribute("srcdoc") || "";
      modal.classList.add("open");
    });
  });
  function closeModal(){ modal.classList.remove("open"); modalFrame.srcdoc = ""; }
  document.getElementById("modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
</script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Insert into active .poly ────────────────────────────────────

async function insertImport(name: string, items: LibraryItem[]) {
  const item = items.find(i => i.name === name);
  if (!item) { vscode.window.showErrorMessage(`Library item not found: ${name}`); return; }

  // Find an active .poly editor (current or most-recent).
  let editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "polyester") {
    // Try to find one in visible editors
    const visible = vscode.window.visibleTextEditors.find(e => e.document.languageId === "polyester");
    if (visible) editor = visible;
  }
  if (!editor) {
    vscode.window.showWarningMessage("Open a .poly file first, then add items to it.");
    return;
  }

  const ref = importRef(item);
  const importLine = `/import "${ref}"\n`;
  const doc = editor.document;
  const text = doc.getText();

  await editor.edit((edit) => {
    if (text.includes(importLine.trim())) {
      // Already imported — just insert the sample markup at the cursor.
      if (item.sampleMarkup) {
        edit.insert(editor!.selection.active, `\n${item.sampleMarkup}\n`);
      }
      return;
    }
    // Insert /import after the leading /page (or at the very top if no /page).
    const lines = text.split("\n");
    let insertLine = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith("/page")) { insertLine = i + 1; break; }
      if (lines[i].trim() && !lines[i].startsWith("/page")) break;
    }
    edit.insert(new vscode.Position(insertLine, 0), (insertLine === 0 ? "" : "\n") + importLine);

    // Also insert sample markup at the current cursor if provided.
    if (item.sampleMarkup) {
      const cursor = editor!.selection.active.translate(insertLine === 0 ? 1 : 0, 0);
      edit.insert(cursor, `\n${item.sampleMarkup}\n`);
    }
  });

  vscode.window.showInformationMessage(`Added ${item.name} to ${path.basename(doc.fileName)}`);
}

// ─── Entry point ─────────────────────────────────────────────────

export async function openLibraryBrowser(context: vscode.ExtensionContext): Promise<void> {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
    return;
  }

  cachedExtensionPath = context.extensionPath;
  const items = await loadLibrary();
  if (items.length === 0) {
    vscode.window.showWarningMessage("No library items found. The Polyester runtime or library directory could not be located.");
    return;
  }

  panel = vscode.window.createWebviewPanel(
    "polyesterLibrary",
    "Polyester Library",
    vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  panel.webview.html = await buildHtml(items);

  panel.webview.onDidReceiveMessage(async (msg) => {
    if (msg.action === "copy" && msg.ref) {
      await vscode.env.clipboard.writeText(`/import "${msg.ref}"`);
      vscode.window.showInformationMessage(`Copied: /import "${msg.ref}"`);
    } else if (msg.action === "add" && msg.name) {
      await insertImport(msg.name, items);
    }
  });

  panel.onDidDispose(() => { panel = undefined; });
}

export function disposeLibraryBrowser(): void {
  if (panel) panel.dispose();
}
