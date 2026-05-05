/**
 * Live Preview
 *
 * Shows a live-updating preview of the current Polyester document.
 * The preview's webview reports the post-pagination layout back to the
 * extension, which surfaces page boundaries, oversize warnings, and the
 * current page in the source editor.
 */

import * as vscode from "vscode";
import * as path from "path";
import { compile as compilePoly } from "./polyRuntime";

let previewPanel: vscode.WebviewPanel | undefined;
let updateTimeout: NodeJS.Timeout | undefined;
let extensionPath: string | undefined;

interface LayoutRecord {
  sourceLine: number;
  page: number;
  oversize: boolean;
}
interface PageInfo {
  page: number;
  fillRatio: number;
}
interface LayoutSummary {
  paginated: boolean;
  totalPages?: number;
  pages?: PageInfo[];
  records?: LayoutRecord[];
}

let currentDocument: vscode.TextDocument | undefined;
let currentLayout: LayoutSummary = { paginated: false };
let pageBoundaryDecoration: vscode.TextEditorDecorationType | undefined;
let oversizeDecoration: vscode.TextEditorDecorationType | undefined;
let statusBar: vscode.StatusBarItem | undefined;

async function compileSource(source: string, sourceDir: string, title: string): Promise<string> {
  try {
    return await compilePoly(source, { sourceDir, title }, extensionPath);
  } catch (err: any) {
    return `<html><body style="font-family: system-ui; padding: 2rem; color: #ef4444;">
      <h2>Build Error</h2>
      <pre style="background: #1e1e1e; color: #e5e5e5; padding: 1rem; border-radius: 4px; overflow: auto;">${escapeHtml(err.message || String(err))}</pre>
    </body></html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function ensureDecorations(): void {
  if (!pageBoundaryDecoration) {
    pageBoundaryDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      borderWidth: "0 0 1px 0",
      borderStyle: "dashed",
      borderColor: new vscode.ThemeColor("editorInfo.foreground"),
    });
  }
  if (!oversizeDecoration) {
    oversizeDecoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: new vscode.ThemeColor("inputValidation.warningBackground"),
      borderWidth: "0 0 0 2px",
      borderStyle: "solid",
      borderColor: new vscode.ThemeColor("editorWarning.foreground"),
      isWholeLine: true,
    });
  }
}

function ensureStatusBar(): void {
  if (!statusBar) {
    statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.name = "Polyester Page";
  }
}

function findEditorForDocument(doc: vscode.TextDocument): vscode.TextEditor | undefined {
  return vscode.window.visibleTextEditors.find((e) => e.document === doc);
}

function applyDecorations(): void {
  if (!currentDocument) return;
  const editor = findEditorForDocument(currentDocument);
  if (!editor) return;
  ensureDecorations();

  if (!currentLayout.paginated || !currentLayout.records) {
    editor.setDecorations(pageBoundaryDecoration!, []);
    editor.setDecorations(oversizeDecoration!, []);
    return;
  }

  const records = currentLayout.records;
  const totalPages = currentLayout.totalPages ?? 1;

  // First sourceLine of each page (smallest line number on that page).
  const pageStart = new Map<number, number>();
  for (const r of records) {
    const cur = pageStart.get(r.page);
    if (cur === undefined || r.sourceLine < cur) pageStart.set(r.page, r.sourceLine);
  }

  const lineCount = editor.document.lineCount;
  const boundaryRanges: vscode.DecorationOptions[] = [];
  for (let p = 2; p <= totalPages; p++) {
    const line = pageStart.get(p);
    if (line === undefined) continue;
    // Target the line ABOVE the page-start so the label sits above the break.
    // Blank lines are common between blocks, giving the label its own visual row.
    const aboveIdx = Math.min(Math.max(0, line - 2), lineCount - 1);
    const range = editor.document.lineAt(aboveIdx).range;
    boundaryRanges.push({
      range,
      renderOptions: {
        after: {
          contentText: `  ── Page ${p} ──`,
          color: new vscode.ThemeColor("editorInfo.foreground"),
          margin: "0 0 0 2em",
          fontStyle: "italic",
        },
      },
    });
  }
  editor.setDecorations(pageBoundaryDecoration!, boundaryRanges);

  const oversizeRanges: vscode.Range[] = [];
  for (const r of records) {
    if (!r.oversize) continue;
    const lineIdx = Math.min(Math.max(0, r.sourceLine - 1), lineCount - 1);
    oversizeRanges.push(editor.document.lineAt(lineIdx).range);
  }
  editor.setDecorations(oversizeDecoration!, oversizeRanges);
}

function clearDecorations(editor: vscode.TextEditor): void {
  if (pageBoundaryDecoration) editor.setDecorations(pageBoundaryDecoration, []);
  if (oversizeDecoration) editor.setDecorations(oversizeDecoration, []);
}

function pageForCursor(line: number): { page: number; fillRatio: number; total: number } | undefined {
  if (!currentLayout.paginated || !currentLayout.records?.length) return undefined;
  const sorted = [...currentLayout.records].sort((a, b) => a.sourceLine - b.sourceLine);
  let page = sorted[0].page;
  for (const r of sorted) {
    if (r.sourceLine - 1 <= line) page = r.page;
    else break;
  }
  const pi = currentLayout.pages?.find((p) => p.page === page);
  return {
    page,
    fillRatio: pi?.fillRatio ?? 0,
    total: currentLayout.totalPages ?? page,
  };
}

function updateStatusBar(editor?: vscode.TextEditor): void {
  ensureStatusBar();
  const ed = editor ?? vscode.window.activeTextEditor;
  if (!ed || !currentDocument || ed.document !== currentDocument) {
    statusBar!.hide();
    return;
  }
  const info = pageForCursor(ed.selection.active.line);
  if (!info) {
    statusBar!.hide();
    return;
  }
  const pct = Math.round(info.fillRatio * 100);
  statusBar!.text = `$(file) Page ${info.page}/${info.total} · ${pct}% full`;
  statusBar!.tooltip = "Polyester: page containing cursor · page fill ratio";
  statusBar!.show();
}

/**
 * Update the preview panel with current document content
 */
async function updatePreview(document: vscode.TextDocument): Promise<void> {
  if (!previewPanel) return;
  if (document.languageId !== "polyester") return;

  currentDocument = document;

  const baseDir = path.dirname(document.uri.fsPath);
  const html = await compileSource(
    document.getText(),
    baseDir,
    path.basename(document.fileName, ".poly"),
  );
  if (!previewPanel) return;
  const enhancedHtml = html.replace(
    "</head>",
    `<base href="${previewPanel.webview.asWebviewUri(vscode.Uri.file(baseDir))}/">
    <style>
      /* Background for preview — page sim script overrides for paginated docs */
      html, body { background: var(--poly-preview-bg, white); }
    </style>
    <script>
    (function() {
      var vscode;
      try { vscode = acquireVsCodeApi(); } catch (e) { vscode = window._polyVscodeApi; }
      window._polyVscodeApi = vscode;

      // Preserve scroll position on reload
      var state = vscode.getState() || { scroll: 0 };
      window.scrollTo(0, state.scroll);
      window.addEventListener('scroll', function() {
        vscode.setState({ scroll: window.scrollY });
      });

      function postLayout() {
        var doc = document.querySelector('.poly-document[data-page-size]');
        if (!doc) {
          vscode.postMessage({ type: 'layout', paginated: false });
          return;
        }
        var pageEls = Array.prototype.slice.call(doc.querySelectorAll('.poly-page'));
        var records = [];
        var pages = [];
        for (var i = 0; i < pageEls.length; i++) {
          var pageEl = pageEls[i];
          var pageNum = i + 1;
          var flow = pageEl.querySelector('.poly-page-flow');
          if (!flow) continue;
          var flowRect = flow.getBoundingClientRect();
          var cs = getComputedStyle(pageEl);
          var padTop = parseFloat(cs.paddingTop) || 0;
          var padBot = parseFloat(cs.paddingBottom) || 0;
          var contentHeight = pageEl.getBoundingClientRect().height - padTop - padBot;
          var used = 0;
          var kids = flow.children;
          for (var k = 0; k < kids.length; k++) {
            var child = kids[k];
            if (child.classList.contains('poly-pagebg')) continue;
            if (child.classList.contains('poly-hint-badge')) continue;
            var r = child.getBoundingClientRect();
            if (r.height === 0) continue;
            var bottom = r.bottom - flowRect.top;
            if (bottom > used) used = bottom;
            var sl = child.getAttribute('data-source-line');
            // Combine explicit oversize flag with implicit visual overflow
            // (child extends below the page's content area).
            var explicit = child.hasAttribute('data-poly-oversize');
            var implicit = bottom > contentHeight + 1;
            var oversize = explicit || implicit;
            if (sl) records.push({ sourceLine: parseInt(sl, 10), page: pageNum, oversize: oversize });
          }
          var ratio = contentHeight > 0 ? Math.max(0, Math.min(1, used / contentHeight)) : 0;
          pages.push({ page: pageNum, fillRatio: ratio });
        }
        vscode.postMessage({
          type: 'layout',
          paginated: true,
          totalPages: pageEls.length,
          pages: pages,
          records: records,
        });
      }

      function waitAndPost() {
        var doc = document.querySelector('.poly-document[data-page-size]');
        if (!doc) { postLayout(); return; }
        if (doc.dataset.paginated === '1') { setTimeout(postLayout, 0); return; }
        var obs = new MutationObserver(function() {
          if (doc.dataset.paginated === '1') {
            obs.disconnect();
            postLayout();
          }
        });
        obs.observe(doc, { attributes: true, attributeFilter: ['data-paginated'] });
        setTimeout(function() { obs.disconnect(); postLayout(); }, 5000);
      }

      if (document.readyState === 'complete') waitAndPost();
      else window.addEventListener('load', waitAndPost);
    })();
    </script>
    </head>`
  );

  previewPanel.webview.html = enhancedHtml;
}

/**
 * Debounced update - waits for typing to pause
 */
function scheduleUpdate(document: vscode.TextDocument): void {
  if (updateTimeout) {
    clearTimeout(updateTimeout);
  }
  updateTimeout = setTimeout(() => {
    updatePreview(document);
  }, 300); // 300ms debounce
}

/**
 * Open or focus the live preview panel
 */
export function openLivePreview(context: vscode.ExtensionContext): void {
  extensionPath = context.extensionPath;
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "polyester") {
    vscode.window.showWarningMessage("Open a .poly file to preview");
    return;
  }

  const document = editor.document;

  if (previewPanel) {
    previewPanel.reveal(vscode.ViewColumn.Beside);
    updatePreview(document);
    return;
  }

  // Create new panel
  previewPanel = vscode.window.createWebviewPanel(
    "polyesterPreview",
    "Preview: " + path.basename(document.fileName),
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [
        vscode.Uri.file(path.dirname(document.uri.fsPath)),
        vscode.Uri.file(path.join(context.extensionPath, "..", "..")),
      ],
    }
  );

  ensureStatusBar();

  // Initial render
  updatePreview(document);

  // Update on document change — track currentDocument so file switches work
  const changeListener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document === currentDocument) {
      scheduleUpdate(e.document);
    }
  });

  // Update when switching to a different .poly file
  const editorChangeListener = vscode.window.onDidChangeActiveTextEditor((ed) => {
    if (ed && ed.document.languageId === "polyester" && previewPanel) {
      previewPanel.title = "Preview: " + path.basename(ed.document.fileName);
      // Clear decorations on the previously-tracked editor before switching
      if (currentDocument && currentDocument !== ed.document) {
        const prev = findEditorForDocument(currentDocument);
        if (prev) clearDecorations(prev);
      }
      updatePreview(ed.document);
    }
  });

  // Status bar follows the cursor in the source editor
  const selectionListener = vscode.window.onDidChangeTextEditorSelection((e) => {
    if (currentDocument && e.textEditor.document === currentDocument) {
      updateStatusBar(e.textEditor);
    }
  });

  // Re-apply decorations when the source editor becomes visible again
  // (e.g. user navigated to another file and back). The TextEditor instance
  // can be replaced, so cached records must be re-painted.
  const visibilityListener = vscode.window.onDidChangeVisibleTextEditors(() => {
    if (currentDocument && currentLayout.paginated) {
      applyDecorations();
    }
    updateStatusBar();
  });

  // Receive layout records from the webview after pagination settles
  const messageListener = previewPanel.webview.onDidReceiveMessage((msg) => {
    if (!msg || msg.type !== "layout") return;
    currentLayout = {
      paginated: !!msg.paginated,
      totalPages: msg.totalPages,
      pages: msg.pages,
      records: msg.records,
    };
    applyDecorations();
    updateStatusBar();
  });

  // Clean up
  previewPanel.onDidDispose(() => {
    previewPanel = undefined;
    changeListener.dispose();
    editorChangeListener.dispose();
    selectionListener.dispose();
    visibilityListener.dispose();
    messageListener.dispose();
    if (updateTimeout) {
      clearTimeout(updateTimeout);
    }
    if (currentDocument) {
      const ed = findEditorForDocument(currentDocument);
      if (ed) clearDecorations(ed);
    }
    if (statusBar) statusBar.hide();
    currentDocument = undefined;
    currentLayout = { paginated: false };
  });

  context.subscriptions.push(
    changeListener,
    editorChangeListener,
    selectionListener,
    visibilityListener,
    messageListener,
  );
}

/**
 * Dispose the preview panel
 */
export function disposePreview(): void {
  if (previewPanel) {
    previewPanel.dispose();
  }
  if (pageBoundaryDecoration) {
    pageBoundaryDecoration.dispose();
    pageBoundaryDecoration = undefined;
  }
  if (oversizeDecoration) {
    oversizeDecoration.dispose();
    oversizeDecoration = undefined;
  }
  if (statusBar) {
    statusBar.dispose();
    statusBar = undefined;
  }
}
